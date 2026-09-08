from datetime import datetime, date, timedelta, time
import calendar
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from app.database import get_db_connection
from app.utils.timezone import get_ist_now, get_ist_today
from typing import Any 

def format_duty_type(raw_val: str) -> str:
    if not raw_val:
        return "Regular"
    val = str(raw_val).strip().upper()
    if val in ["REGULAR", "DUTY"]:
        return "Regular"
    elif val == "REPLACEMENT":
        return "Replacement"
    elif val in ["TEMPORARY", "OUTPOST"]:
        return "Temporary"
    else:
        return val.capitalize()

def get_attendance_records_logic(
    date_str: str, 
    client_id: int = None, 
    site_id: int = None,
    branch_id: int = None,
    designation: str = None,
    shift: str = None,
    duty_type: str = None
):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}
        cursor = conn.cursor(dictionary=True)
        
        # 1. Fetch active employees
        emp_query = """
            SELECT 
                e.oid as empOid,
                e.name,
                e.emp_code,
                e.site as site_id,
                e.branch as emp_branch_id,
                d.name as designation_name,
                e.company_designation,
                st.name as site_name,
                st.clientt as client_id,
                st.branch as site_branch_id
            FROM EMPLOYEE e
            LEFT JOIN SITE st ON e.site = st.oid
            LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
            WHERE e.active = 1
        """
        params = []
        if site_id:
            emp_query += " AND e.site = %s"
            params.append(site_id)
        elif client_id:
            emp_query += " AND st.clientt = %s"
            params.append(client_id)
            
        if branch_id:
            emp_query += " AND (e.branch = %s OR st.branch = %s)"
            params.extend([branch_id, branch_id])

        if designation and designation != "all":
            desig_raw = designation.strip().lower()
            if desig_raw in ["security guard", "security_guard", "s/g", "guard"]:
                emp_query += " AND (LOWER(d.name) IN ('s/g', 'security guard', 'guard', 's/eg', 'h/g', 'super guard') OR LOWER(d.name) LIKE %s OR LOWER(e.company_designation) IN ('s/g', 'security guard', 'guard'))"
                params.append("%s/g%")
            elif desig_raw in ["lady security guard", "lady_security_guard", "ls/g", "l/sg"]:
                emp_query += " AND (LOWER(d.name) IN ('ls/g', 'l/sg', 'lady security guard') OR LOWER(d.name) LIKE %s OR LOWER(e.company_designation) IN ('ls/g', 'l/sg', 'lady security guard'))"
                params.append("%ls/g%")
            elif desig_raw in ["supervisor", "s/sup", "sup"]:
                emp_query += " AND (LOWER(d.name) LIKE %s OR LOWER(e.company_designation) LIKE %s)"
                params.extend(["%sup%", "%sup%"])
            else:
                emp_query += " AND (LOWER(d.name) LIKE %s OR LOWER(e.company_designation) LIKE %s)"
                params.extend([f"%{desig_raw}%", f"%{desig_raw}%"])
            
        cursor.execute(emp_query, tuple(params))
        employees = cursor.fetchall()
        
        if not employees:
            return {
                "success": True,
                "planned": 0,
                "present": 0,
                "absent": 0,
                "missedPunch": 0,
                "records": []
            }
        
        # 2. Batch fetch attendance cells for specified date and employees
        emp_oids = [emp["empOid"] for emp in employees]
        format_strings = ','.join(['%s'] * len(emp_oids))
        cell_query = f"""
            SELECT 
                ac.EMPLOYEE,
                ac.attendance_state,
                atl.in_time,
                atl.out_time,
                sh.name as shift_name,
                ar.duty_type
            FROM ATTENDANCE_CELL ac
            LEFT JOIN ATTENDANCE_TIME_LOG atl ON atl.ATTENDANCE_CELL = ac.oid
            LEFT JOIN SHIFT_DESIGNATION_COUNT sdc ON atl.SHIFT_DESIGNATION_COUNT = sdc.oid
            LEFT JOIN SHIFT sh ON sdc.SHIFT = sh.oid
            LEFT JOIN ATTENDANCE_ROW ar ON ac.ATTENDANCE_ROW = ar.oid
            WHERE ac.attendance_date = %s AND ac.EMPLOYEE IN ({format_strings})
            ORDER BY atl.in_time DESC
        """
        cursor.execute(cell_query, (date_str, *emp_oids))
        all_cells = cursor.fetchall()

        # Fetch site default shifts for fallback when guard has not punched in yet
        site_shift_map = {}
        try:
            cursor.execute("SELECT s.SITE, s.name FROM SHIFT s JOIN (SELECT SITE, MIN(oid) as min_oid FROM SHIFT GROUP BY SITE) first_s ON s.oid = first_s.min_oid")
            shift_rows = cursor.fetchall()
            for sr in shift_rows:
                if sr.get("SITE") and sr.get("name"):
                    site_shift_map[sr["SITE"]] = sr["name"]
        except Exception as shift_e:
            print(f"Warning fetching default site shifts: {shift_e}")

        cell_map = {}
        for cell in all_cells:
            emp_id = cell["EMPLOYEE"]
            if emp_id not in cell_map:
                cell_map[emp_id] = cell

        records = []
        planned = 0
        present = 0
        absent = 0
        missed_punch = 0

        for emp in employees:
            emp_oid = emp["empOid"]
            cell = cell_map.get(emp_oid)
            
            status = "Absent"
            punch_in = None
            punch_out = None
            shift_name = None
            duty_type_val = "Regular"
            
            if cell:
                punch_in = cell["in_time"].strftime("%H:%M") if cell.get("in_time") else None
                punch_out = cell["out_time"].strftime("%H:%M") if cell.get("out_time") else None
                shift_name = cell.get("shift_name")
                duty_type_val = format_duty_type(cell.get("duty_type"))
                
                if cell.get("in_time") and cell.get("out_time"):
                    status = "Present"
                elif cell.get("in_time") and not cell.get("out_time"):
                    status = "Missed Punch Out"
                else:
                    status = "Absent"
            else:
                status = "Absent"

            if not shift_name or shift_name == "N/A":
                shift_name = site_shift_map.get(emp.get("site_id")) or "General Shift"

            if shift and shift != "all":
                if shift.lower() not in shift_name.lower():
                    continue

            if duty_type and duty_type != "all":
                if duty_type.lower() not in duty_type_val.lower():
                    continue

            planned += 1
            if status == "Present":
                present += 1
            elif status == "Missed Punch Out":
                missed_punch += 1
            else:
                absent += 1

            records.append({
                "employeeOid": emp_oid,
                "siteOid": emp["site_id"],
                "empId": emp["emp_code"] or f"EMP{emp_oid:03d}",
                "guardName": emp["name"],
                "designation": emp.get("designation_name") or emp.get("company_designation") or "Security Guard",
                "site": emp["site_name"] or "Unassigned",
                "dutyType": duty_type_val,
                "shift": shift_name,
                "punchInTime": punch_in or "—",
                "punchOutTime": punch_out or "—",
                "status": status
            })
            
        return {
            "success": True,
            "planned": planned,
            "present": present,
            "absent": absent,
            "missedPunch": missed_punch,
            "records": records
        }
    except Exception as e:
        print(f"Error in get_attendance_records_logic: {e}")
        return {"success": False, "message": f"Server error: {str(e)}"}
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass

def get_attendance_shifts_logic(client_id=None, site_id=None, branch_id=None):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "shifts": []}
        cursor = conn.cursor(dictionary=True)
        
        query = """
            SELECT DISTINCT s.name 
            FROM SHIFT s 
            JOIN SITE st ON s.SITE = st.oid 
            WHERE 1=1
        """
        params = []
        if site_id and str(site_id).lower() != "all":
            query += " AND s.SITE = %s"
            params.append(site_id)
        elif client_id and str(client_id).lower() != "all":
            query += " AND st.CLIENTT = %s"
            params.append(client_id)
            
        if branch_id and str(branch_id).lower() != "all":
            query += " AND st.BRANCH = %s"
            params.append(branch_id)
            
        query += " ORDER BY s.name ASC"
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        
        shifts = [r["name"] for r in rows if r.get("name")]
        return {"success": True, "shifts": shifts}
    except Exception as e:
        print(f"Error in get_attendance_shifts_logic: {e}")
        return {"success": False, "shifts": []}
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass

def get_attendance_duty_types_logic():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": True, "duty_types": ["Regular", "Replacement", "Temporary"]}
        cursor = conn.cursor(dictionary=True)
        
        query = """
            SELECT DISTINCT duty_type FROM ATTENDANCE_ROW WHERE duty_type IS NOT NULL AND duty_type != ''
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        dt_set = set()
        for r in rows:
            formatted = format_duty_type(r.get("duty_type"))
            if formatted:
                dt_set.add(formatted)
                
        for default_val in ["Regular", "Replacement", "Temporary"]:
            dt_set.add(default_val)
            
        order_map = {"Regular": 1, "Replacement": 2, "Temporary": 3}
        sorted_types = sorted(list(dt_set), key=lambda x: (order_map.get(x, 99), x))
        
        return {"success": True, "duty_types": sorted_types}
    except Exception as e:
        print(f"Error in get_attendance_duty_types_logic: {e}")
        return {"success": True, "duty_types": ["Regular", "Replacement", "Temporary"]}
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def submit_regularization_logic(payload):
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}
        cursor = conn.cursor()
        
        # Original time could be "—" or None, clean it
        orig_time = payload.get("originalTime")
        if orig_time == "—":
            orig_time = None
            
        cursor.execute("""
            INSERT INTO attendance_regularization 
            (employee_oid, site_oid, shift_name, regularized_for, original_time, regularized_time, reason, duty_date, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'Pending')
        """, (
            payload.get("employeeOid"),
            payload.get("siteOid"),
            payload.get("shift"),
            payload.get("regularizedFor"),
            orig_time,
            payload.get("regularizedTime"),
            payload.get("reason"),
            payload.get("date")
        ))
        conn.commit()
        cursor.close()
        conn.close()
        return {"success": True, "message": "Regularization request submitted successfully"}
    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        print(f"Error in submit_regularization_logic: {e}")
        return {"success": False, "message": f"Server error: {str(e)}"}

def get_regularizations_logic(client_id: int = None, site_id: int = None, status: str = None):
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}
        cursor = conn.cursor(dictionary=True)
        
        # Build filter query
        query = """
            SELECT 
                ar.oid as id,
                e.name as guardName,
                e.emp_code as empId,
                s.name as site,
                ar.duty_date as date,
                ar.shift_name as shift,
                ar.regularized_for as regularizedFor,
                ar.original_time as originalTime,
                ar.regularized_time as regularizedTime,
                ar.reason,
                ar.approved_by as regularizedBy,
                ar.status,
                ar.created_at as regularizedOn
            FROM attendance_regularization ar
            JOIN employee e ON ar.employee_oid = e.oid
            JOIN site s ON ar.site_oid = s.oid
            WHERE 1=1
        """
        params = []
        if client_id:
            query += " AND s.clientt = %s"
            params.append(client_id)
        if site_id:
            query += " AND ar.site_oid = %s"
            params.append(site_id)
        if status and status != 'all':
            query += " AND ar.status = %s"
            params.append(status)
            
        query += " ORDER BY ar.created_at DESC"
        cursor.execute(query, tuple(params))
        records = cursor.fetchall()
        
        # Convert date and times to string for JSON serialization
        for r in records:
            if isinstance(r["date"], (date, datetime)):
                r["date"] = r["date"].strftime("%Y-%m-%d")
            if isinstance(r["regularizedOn"], (date, datetime)):
                r["regularizedOn"] = r["regularizedOn"].strftime("%Y-%m-%d %H:%M:%S")
            if r["regularizedBy"] is None:
                r["regularizedBy"] = "Pending"
                
        # Stats query
        stats_query = """
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN ar.status = 'Approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN ar.status = 'Pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN ar.status = 'Rejected' THEN 1 ELSE 0 END) as rejected
            FROM attendance_regularization ar
            JOIN site s ON ar.site_oid = s.oid
            WHERE 1=1
        """
        stats_params = []
        if client_id:
            stats_query += " AND s.clientt = %s"
            stats_params.append(client_id)
        if site_id:
            stats_query += " AND ar.site_oid = %s"
            stats_params.append(site_id)
            
        cursor.execute(stats_query, tuple(stats_params))
        stats_res = cursor.fetchone()
        
        total = stats_res["total"] or 0
        approved = int(stats_res["approved"] or 0)
        pending = int(stats_res["pending"] or 0)
        rejected = int(stats_res["rejected"] or 0)
        
        cursor.close()
        conn.close()
        return {
            "success": True, 
            "records": records, 
            "total": total, 
            "approved": approved, 
            "pending": pending, 
            "rejected": rejected
        }
    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        print(f"Error in get_regularizations_logic: {e}")
        return {"success": False, "message": f"Server error: {str(e)}"}

def approve_regularization_logic(reg_id: int, approved_by_name: str):
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}
        cursor = conn.cursor(dictionary=True)
        
        # 1. Fetch regularization request
        cursor.execute("""
            SELECT employee_oid, site_oid, shift_name, regularized_for, regularized_time, duty_date, status
            FROM attendance_regularization WHERE oid = %s
        """, (reg_id,))
        reg = cursor.fetchone()
        
        if not reg:
            cursor.close()
            conn.close()
            return {"success": False, "message": "Regularization request not found"}
            
        if reg["status"] != "Pending":
            cursor.close()
            conn.close()
            return {"success": False, "message": f"Request already processed as {reg['status']}"}
            
        emp_oid = reg["employee_oid"]
        site_oid = reg["site_oid"]
        duty_date = reg["duty_date"]
        reg_for = reg["regularized_for"]
        reg_time = reg["regularized_time"]
        shift_name = reg["shift_name"]
        
        # 2. Fetch Employee details
        cursor.execute("SELECT designation, company_designation, site FROM employee WHERE oid = %s", (emp_oid,))
        emp = cursor.fetchone()
        if not emp:
            cursor.close()
            conn.close()
            return {"success": False, "message": "Employee not found"}
            
        designation = emp["designation"] or emp["company_designation"]
        user_assigned_site = emp["site"]
        
        # 3. Find/Create ATTENDANCE_ROW
        year_month = duty_date.replace(day=1)
        cursor.execute("""
            SELECT oid FROM ATTENDANCE_ROW 
            WHERE EMPLOYEE = %s AND ATTENDANCE_SITE = %s AND yearmonth = %s AND DUTY_DESIGNATION = %s
        """, (emp_oid, site_oid, year_month, designation))
        row_res = cursor.fetchone()
        if row_res:
            row_oid = row_res["oid"]
        else:
            cursor.execute("SELECT clientt FROM SITE WHERE oid = %s", (site_oid,))
            site_data = cursor.fetchone()
            punch_client_oid = site_data["clientt"] if site_data else None
            
            cursor.execute("SELECT clientt FROM SITE WHERE oid = %s", (user_assigned_site,))
            primary_site_data = cursor.fetchone()
            primary_client_oid = primary_site_data["clientt"] if primary_site_data else None
            
            duty_type = "TEMPORARY"
            if user_assigned_site and int(site_oid) == int(user_assigned_site):
                duty_type = "DUTY"
            elif primary_client_oid and punch_client_oid and int(primary_client_oid) == int(punch_client_oid):
                duty_type = "OUTPOST"
                
            cursor.execute("SELECT COALESCE(MAX(oid), 0) + 1 as next_oid FROM ATTENDANCE_ROW")
            next_row_res = cursor.fetchone()
            next_row_oid = next_row_res["next_oid"] if next_row_res else 1
                
            cursor.execute("""
                INSERT INTO ATTENDANCE_ROW (oid, yearmonth, duty_type, EMPLOYEE, ATTENDANCE_SITE, DUTY_DESIGNATION)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (next_row_oid, year_month, duty_type, emp_oid, site_oid, designation))
            row_oid = next_row_oid
            
        # 4. Find/Create ATTENDANCE_CELL
        cursor.execute("""
            SELECT oid FROM ATTENDANCE_CELL 
            WHERE EMPLOYEE = %s AND ATTENDANCE_SITE = %s AND attendance_date = %s
        """, (emp_oid, site_oid, duty_date))
        cell_res = cursor.fetchone()
        
        if cell_res:
            cell_oid = cell_res["oid"]
        else:
            cursor.execute("SELECT COALESCE(MAX(oid), 0) + 1 as next_oid FROM ATTENDANCE_CELL")
            next_cell_res = cursor.fetchone()
            next_cell_oid = next_cell_res["next_oid"] if next_cell_res else 1

            cursor.execute("""
                INSERT INTO ATTENDANCE_CELL (oid, attendance_date, attendance_state, EMPLOYEE_DESIGNATION, CLIENT_DESIGNATION, EMPLOYEE_SITE, ATTENDANCE_SITE, ATTENDANCE_ROW, EMPLOYEE)
                VALUES (%s, %s, 'IN', %s, %s, %s, %s, %s, %s)
            """, (next_cell_oid, duty_date, emp["company_designation"] or designation, designation, user_assigned_site, site_oid, row_oid, emp_oid))
            cell_oid = next_cell_oid
            
        # 5. Resolve Shift & Shift Designation Count
        cursor.execute("SELECT oid FROM SHIFT WHERE name = %s AND SITE = %s LIMIT 1", (shift_name, site_oid))
        shift_res = cursor.fetchone()
        shift_oid = shift_res["oid"] if shift_res else None
        
        sdc_oid = None
        if shift_oid:
            cursor.execute("""
                SELECT oid FROM SHIFT_DESIGNATION_COUNT 
                WHERE SHIFT = %s AND attendance_date = %s AND DESIGNATION = %s
            """, (shift_oid, duty_date, designation))
            sdc_res = cursor.fetchone()
            if sdc_res:
                sdc_oid = sdc_res["oid"]
            else:
                cursor.execute("""
                    INSERT INTO SHIFT_DESIGNATION_COUNT (attendance_date, planned_head_count, actual_head_count, SHIFT, DESIGNATION)
                    VALUES (%s, 1, 1, %s, %s)
                """, (duty_date, shift_oid, designation))
                sdc_oid = cursor.lastrowid
                
        # 6. Find/Create/Update ATTENDANCE_TIME_LOG
        cursor.execute("SELECT oid, in_time, out_time FROM ATTENDANCE_TIME_LOG WHERE ATTENDANCE_CELL = %s LIMIT 1", (cell_oid,))
        log_res = cursor.fetchone()
        
        datetime_str = f"{duty_date} {reg_time}:00"
        
        if log_res:
            log_oid = log_res["oid"]
            if reg_for == "Punch In":
                cursor.execute("UPDATE ATTENDANCE_TIME_LOG SET in_time = %s WHERE oid = %s", (datetime_str, log_oid))
            else:
                cursor.execute("UPDATE ATTENDANCE_TIME_LOG SET out_time = %s WHERE oid = %s", (datetime_str, log_oid))
        else:
            cursor.execute("SELECT COALESCE(MAX(oid), 0) + 1 as next_oid FROM ATTENDANCE_TIME_LOG")
            next_log_res = cursor.fetchone()
            next_log_oid = next_log_res["next_oid"] if next_log_res else 1

            if reg_for == "Punch In":
                cursor.execute("""
                    INSERT INTO ATTENDANCE_TIME_LOG (oid, in_time, ATTENDANCE_CELL, SHIFT_DESIGNATION_COUNT)
                    VALUES (%s, %s, %s, %s)
                """, (next_log_oid, datetime_str, cell_oid, sdc_oid))
            else:
                cursor.execute("""
                    INSERT INTO ATTENDANCE_TIME_LOG (oid, out_time, ATTENDANCE_CELL, SHIFT_DESIGNATION_COUNT)
                    VALUES (%s, %s, %s, %s)
                """, (next_log_oid, datetime_str, cell_oid, sdc_oid))
                
        # 7. Update ATTENDANCE_CELL state based on active log
        cursor.execute("SELECT in_time, out_time FROM ATTENDANCE_TIME_LOG WHERE ATTENDANCE_CELL = %s LIMIT 1", (cell_oid,))
        current_log = cursor.fetchone()
        if current_log:
            new_state = "IN"
            if current_log.get("in_time") and current_log.get("out_time"):
                new_state = "PRESENT"
            elif current_log.get("out_time"):
                new_state = "OUT"
            cursor.execute("UPDATE ATTENDANCE_CELL SET attendance_state = %s WHERE oid = %s", (new_state, cell_oid))
            
        # 8. Update regularization request status
        cursor.execute("""
            UPDATE attendance_regularization 
            SET status = 'Approved', approved_by = %s 
            WHERE oid = %s
        """, (approved_by_name, reg_id))
        
        conn.commit()
        cursor.close()
        conn.close()
        return {"success": True, "message": "Regularization approved and attendance updated"}
    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        print(f"Error in approve_regularization_logic: {e}")
        return {"success": False, "message": f"Server error: {str(e)}"}

def reject_regularization_logic(reg_id: int, rejected_by_name: str):
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE attendance_regularization 
            SET status = 'Rejected', approved_by = %s 
            WHERE oid = %s AND status = 'Pending'
        """, (rejected_by_name, reg_id))
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            return {"success": False, "message": "Request not found or already processed"}
            
        conn.commit()
        cursor.close()
        conn.close()
        return {"success": True, "message": "Regularization request rejected"}
    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        print(f"Error in reject_regularization_logic: {e}")
        return {"success": False, "message": f"Server error: {str(e)}"}

def export_attendance_excel_logic(date_str: str, client_id_param: str = None, site_id_param: str = None):
    try:
        # 1. Parse date and calculate month range
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
        except Exception:
            dt = datetime.now()
            
        year = dt.year
        month = dt.month
        month_name = dt.strftime("%B")
        days_in_month = calendar.monthrange(year, month)[1]
        
        start_date_str = f"{year:04d}-{month:02d}-01"
        end_date_str = f"{year:04d}-{month:02d}-{days_in_month:02d}"
        
        conn = get_db_connection()
        if conn is None:
            return None
        cursor = conn.cursor(dictionary=True)
        
        # 2. Get Client Name if client_id is passed
        client_name = ""
        client_id_val = None
        if client_id_param and client_id_param != "all":
            try:
                client_id_val = int(client_id_param)
                cursor.execute("SELECT name FROM CLIENTT WHERE oid = %s LIMIT 1", (client_id_val,))
                c_row = cursor.fetchone()
                if c_row and c_row.get("name"):
                    client_name = c_row["name"]
            except ValueError:
                pass
                
        site_id_val = None
        if site_id_param and site_id_param != "all":
            try:
                site_id_val = int(site_id_param)
            except ValueError:
                pass

        # 3. Fetch active employees
        emp_query = """
            SELECT 
                e.oid as empOid,
                e.name as empName,
                e.emp_code as empCode,
                d.name as rankName,
                st.name as siteName,
                st.oid as siteOid,
                c.name as clientName
            FROM EMPLOYEE e
            LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
            LEFT JOIN SITE st ON e.site = st.oid
            LEFT JOIN CLIENTT c ON st.CLIENTT = c.oid
            WHERE e.active = 1
        """
        params = []
        if site_id_val:
            emp_query += " AND e.site = %s"
            params.append(site_id_val)
        elif client_id_val:
            emp_query += " AND st.CLIENTT = %s"
            params.append(client_id_val)
            
        emp_query += " ORDER BY st.name ASC, e.name ASC"
        cursor.execute(emp_query, tuple(params))
        employees = cursor.fetchall()
        
        if not employees:
            cursor.close()
            conn.close()
            return None
        
        # 4. Fetch attendance cells for the month
        emp_oids = [emp["empOid"] for emp in employees]
        format_strings = ','.join(['%s'] * len(emp_oids))
        
        cell_query = f"""
            SELECT 
                ac.EMPLOYEE as empOid,
                ac.attendance_date,
                ac.attendance_state,
                atl.in_time,
                atl.out_time
            FROM ATTENDANCE_CELL ac
            LEFT JOIN ATTENDANCE_TIME_LOG atl ON atl.ATTENDANCE_CELL = ac.oid
            WHERE ac.attendance_date >= %s AND ac.attendance_date <= %s
              AND ac.EMPLOYEE IN ({format_strings})
            ORDER BY ac.attendance_date ASC
        """
        cursor.execute(cell_query, (start_date_str, end_date_str, *emp_oids))
        month_cells = cursor.fetchall()
        
        # Map (empOid, day_int) -> status code ('P', 'A', 'WO', 'PH')
        attendance_map = {}
        for cell in month_cells:
            emp_id = cell["empOid"]
            cell_date = cell["attendance_date"]
            if isinstance(cell_date, (date, datetime)):
                day_num = cell_date.day
            else:
                try:
                    day_num = datetime.strptime(str(cell_date), "%Y-%m-%d").day
                except Exception:
                    continue
            
            key = (emp_id, day_num)
            if key in attendance_map and attendance_map[key] == "P":
                continue # Already marked Present
                
            state_raw = str(cell.get("attendance_state") or "").strip().upper()
            has_log = cell.get("in_time") is not None
            
            if has_log or state_raw in ["IN", "OUT", "PRESENT", "P", "8.0", "8"]:
                status = "P"
            elif state_raw in ["WO", "WEEKLY_OFF", "OFF", "WEEKLY OFF"]:
                status = "WO"
            elif state_raw in ["PH", "HOLIDAY", "PUBLIC_HOLIDAY", "PUBLIC HOLIDAY"]:
                status = "PH"
            elif state_raw in ["ABSENT", "A"]:
                status = "A"
            else:
                status = "A"
                
            attendance_map[key] = status
            
        cursor.close()
        conn.close()

        # 5. Build openpyxl Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Attendance"
        ws.views.sheetView[0].showGridLines = True
        
        # Define styles
        font_title = Font(name="Calibri", size=16, bold=True, color="1E293B")
        font_subtitle = Font(name="Calibri", size=11, bold=True, italic=True, color="475569")
        
        fill_header = PatternFill(start_color="334155", end_color="334155", fill_type="solid") # Dark Slate
        font_header = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        
        fill_summary = PatternFill(start_color="FEF9C3", end_color="FEF9C3", fill_type="solid") # Light Yellow
        font_summary = Font(name="Calibri", size=10, bold=True, color="854D0E")
        
        font_data = Font(name="Calibri", size=10)
        
        # Status fonts & fills
        fill_p = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid") # Soft Green
        font_p = Font(name="Calibri", size=10, bold=True, color="15803D")
        
        fill_a = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid") # Soft Red
        font_a = Font(name="Calibri", size=10, bold=True, color="B91C1C")
        
        fill_wo = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid") # Soft Gray
        font_wo = Font(name="Calibri", size=10, bold=True, color="64748B")
        
        fill_ph = PatternFill(start_color="E0E7FF", end_color="E0E7FF", fill_type="solid") # Soft Indigo
        font_ph = Font(name="Calibri", size=10, bold=True, color="4338CA")

        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )
        
        align_center = Alignment(horizontal='center', vertical='center')
        align_left = Alignment(horizontal='left', vertical='center')

        # Total Columns count
        total_cols = 6 + days_in_month + 4

        # Title Rows
        title_prefix = client_name if client_name else "Guard"
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=total_cols)
        c_title = ws.cell(row=1, column=1, value=f"{title_prefix} Security Attendance Month of {month_name} - {year}")
        c_title.font = font_title
        c_title.alignment = align_left

        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=total_cols)
        c_sub = ws.cell(row=2, column=1, value=f"Attendance Period: 01 {month_name} {year} to {days_in_month:02d} {month_name} {year}")
        c_sub.font = font_subtitle
        c_sub.alignment = align_left

        # Row 3 is blank
        ws.row_dimensions[1].height = 24
        ws.row_dimensions[2].height = 18
        ws.row_dimensions[3].height = 10
        ws.row_dimensions[4].height = 26

        # Header Row (Row 4)
        headers = ["Sr. No.", "Emp. Site", "Rank", "Emp. Code", "Emp. Name", "Duty Type"]
        for d in range(1, days_in_month + 1):
            headers.append(str(d))
        headers.extend(["PH", "Total Duty Days", "Weekly Off Days", "Absent Days"])

        for col_idx, h_text in enumerate(headers, start=1):
            cell = ws.cell(row=4, column=col_idx, value=h_text)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = align_center
            cell.border = thin_border
            
            # Apply summary header fill for last 4 columns
            if col_idx > 6 + days_in_month:
                cell.fill = PatternFill(start_color="CA8A04", end_color="CA8A04", fill_type="solid") # Dark Gold

        # Data Rows (starting Row 5)
        today_date = date.today()
        current_row = 5

        for idx, emp in enumerate(employees, start=1):
            emp_id = emp["empOid"]
            site_name = emp["siteName"] or "Unassigned"
            rank_name = emp["rankName"] or "Guard"
            emp_code = emp["empCode"] or f"EMP{emp_id:03d}"
            emp_name = emp["empName"] or "Unknown"
            duty_type = "12 Hrs" # Default duty type

            row_data = [idx, site_name, rank_name, emp_code, emp_name, duty_type]
            daily_statuses = []

            for d in range(1, days_in_month + 1):
                cur_date = date(year, month, d)
                if (emp_id, d) in attendance_map:
                    st = attendance_map[(emp_id, d)]
                else:
                    if cur_date.weekday() == 6:
                        st = "WO"
                    elif cur_date <= today_date:
                        st = "A"
                    else:
                        st = "A"
                daily_statuses.append(st)

            ph_count = daily_statuses.count("PH")
            duty_days = daily_statuses.count("P")
            wo_days = daily_statuses.count("WO")
            absent_days = daily_statuses.count("A")

            row_values = row_data + daily_statuses + [ph_count, duty_days, wo_days, absent_days]

            ws.row_dimensions[current_row].height = 20

            for col_idx, val in enumerate(row_values, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=val)
                cell.border = thin_border
                cell.font = font_data
                
                # Alignments
                if col_idx in [2, 5]: # Site name & Guard name
                    cell.alignment = align_left
                else:
                    cell.alignment = align_center

                # Daily status formatting (columns 7 to 6 + days_in_month)
                if 7 <= col_idx <= 6 + days_in_month:
                    if val == "P":
                        cell.fill = fill_p
                        cell.font = font_p
                    elif val == "A":
                        cell.fill = fill_a
                        cell.font = font_a
                    elif val == "WO":
                        cell.fill = fill_wo
                        cell.font = font_wo
                    elif val == "PH":
                        cell.fill = fill_ph
                        cell.font = font_ph

                # Summary columns formatting (last 4 columns)
                if col_idx > 6 + days_in_month:
                    cell.fill = fill_summary
                    cell.font = font_summary

            current_row += 1

        # Column Widths Auto-fit
        ws.column_dimensions['A'].width = 8   # Sr. No.
        ws.column_dimensions['B'].width = 22  # Emp. Site
        ws.column_dimensions['C'].width = 16  # Rank
        ws.column_dimensions['D'].width = 14  # Emp. Code
        ws.column_dimensions['E'].width = 22  # Emp. Name
        ws.column_dimensions['F'].width = 12  # Duty Type

        for d in range(1, days_in_month + 1):
            col_letter = get_column_letter(6 + d)
            ws.column_dimensions[col_letter].width = 4.5

        # Summary columns widths
        sum_cols_start = 6 + days_in_month + 1
        ws.column_dimensions[get_column_letter(sum_cols_start)].width = 8    # PH
        ws.column_dimensions[get_column_letter(sum_cols_start + 1)].width = 16 # Total Duty Days
        ws.column_dimensions[get_column_letter(sum_cols_start + 2)].width = 16 # Weekly Off Days
        ws.column_dimensions[get_column_letter(sum_cols_start + 3)].width = 14 # Absent Days

        # Save to BytesIO
        output = BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()

    except Exception as e:
        print(f"Error in export_attendance_excel_logic: {e}")
        return None

# --- AIP MOBILE ATTENDANCE ENDPOINTS & LOGIC ---

import math
from geopy.distance import geodesic

def is_within_radius(user_lat, user_long, site_lat, site_long, radius_meters):
    return geodesic((site_lat, site_long), (user_lat, user_long)).meters <= radius_meters

def init_fo_location_table(cursor):
    # Table creation disabled/commented out
    pass
    # cursor.execute("""
    #     CREATE TABLE IF NOT EXISTS FIELD_OFFICER_ATTENDANCE_LOCATION (
    #         oid BIGINT AUTO_INCREMENT PRIMARY KEY,
    #         attendance_time_log BIGINT NOT NULL,
    #         employee_oid BIGINT NOT NULL,
    #         officer VARCHAR(255) NULL,
    #         punch_type VARCHAR(10) NOT NULL,
    #         latitude DECIMAL(10,8) NOT NULL,
    #         longitude DECIMAL(11,8) NOT NULL,
    #         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    #         CONSTRAINT fk_fo_location_timelog
    #             FOREIGN KEY (attendance_time_log) 
    #             REFERENCES ATTENDANCE_TIME_LOG(oid) ON DELETE CASCADE,
    #         CONSTRAINT fk_fo_location_employee
    #             FOREIGN KEY (employee_oid) 
    #             REFERENCES EMPLOYEE(oid) ON DELETE CASCADE
    #     )
    # """)

def mark_attendance_logic(data):
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}
            
        cursor = conn.cursor(dictionary=True)
        init_fo_location_table(cursor)

        empOid = data.empOid
        lat, long = data.latitude, data.longitude
        qrSiteOid = getattr(data, 'siteOid', None)

        now = get_ist_now()
        today = get_ist_today()

        cursor.execute("""
            SELECT e.oid, e.site, e.name, e.emp_code, e.active, e.DESIGNATION, e.COMPANY_DESIGNATION, d.name as designation_name
            FROM EMPLOYEE e
            LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
            WHERE e.oid = %s
        """, (empOid,))
        user = cursor.fetchone()

        if not user:
            cursor.close()
            conn.close()
            return {"success": False, "message": "USER NOT FOUND"}

        desig_str = str(user.get("designation_name", "") or user.get("COMPANY_DESIGNATION", "") or "").upper()
        is_field_officer = "FIELD OFFICER" in desig_str

        user_assigned_site = user.get("site") or user.get("SITE")
        active_site_oid = qrSiteOid if qrSiteOid else user_assigned_site
        
        if not active_site_oid:
            cursor.close()
            conn.close()
            return {"success": False, "message": "NO SITE SPECIFIED (ASSIGNED OR QR)"}

        cursor.execute("""
            SELECT 
                s.oid as site_oid, 
                s.name, 
                sg.latitude, 
                sg.longitude, 
                COALESCE(sg.radius, 100) as radius
            FROM SITE s
            LEFT JOIN SITE_GATE_QRCODE sg ON sg.SITE = s.oid
            WHERE s.oid = %s OR sg.oid = %s
            ORDER BY (sg.oid = %s) DESC, sg.oid ASC
            LIMIT 1
        """, (active_site_oid, active_site_oid, active_site_oid))
        site = cursor.fetchone()

        if not site:
            cursor.close()
            conn.close()
            return {"success": False, "message": "INVALID SITE OR QR CODE"}

        master_site_oid = site["site_oid"]
        user["site_oid"] = master_site_oid
        user["assigned_site"] = user_assigned_site
        active_site_oid = master_site_oid

        if not is_field_officer:
            if site["latitude"] is None or site["longitude"] is None:
                cursor.close()
                conn.close()
                return {"success": False, "message": f"SITE COORDINATES NOT SET FOR {site['name'].upper()}"}

            distance_km = geodesic((site["latitude"], site["longitude"]), (lat, long)).km
            if (distance_km * 1000) > (site["radius"] or 100):
                cursor.close()
                conn.close()
                return {
                    "success": False, 
                    "message": f"YOU ARE FAR FROM {site['name'].upper()} ({distance_km:.2f} kms away)."
                }

        cursor.execute("SELECT clientt FROM SITE WHERE oid = %s", (user_assigned_site,))
        primary_site_data = cursor.fetchone()
        primary_client_oid = primary_site_data["clientt"] if primary_site_data else None

        cursor.execute("SELECT clientt FROM SITE WHERE oid = %s", (active_site_oid,))
        punch_site_data = cursor.fetchone()
        punch_client_oid = punch_site_data["clientt"] if punch_site_data else None

        duty_type = "TEMPORARY"
        if user_assigned_site and int(active_site_oid) == int(user_assigned_site):
            duty_type = "REGULAR"
        elif punch_client_oid and primary_client_oid and int(punch_client_oid) == int(primary_client_oid):
            duty_type = "REPLACEMENT"

        cursor.execute("""
            SELECT atl.*, ac.oid as cell_oid 
            FROM ATTENDANCE_TIME_LOG atl
            JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
            WHERE ac.EMPLOYEE = %s AND atl.out_time IS NULL
            ORDER BY atl.oid DESC LIMIT 1
        """, (empOid,))
        open_log = cursor.fetchone()

        if open_log:
            in_time = open_log["in_time"]
            if in_time:
                duration_hours = (now - in_time).total_seconds() / 3600.0
                if duration_hours > 16.0:
                    auto_out = in_time + timedelta(hours=16)
                    cursor.execute("UPDATE ATTENDANCE_TIME_LOG SET out_time = %s WHERE oid = %s", (auto_out, open_log["oid"]))
                    cursor.execute("UPDATE ATTENDANCE_CELL SET attendance_state = 'PRESENT' WHERE oid = %s", (open_log["cell_oid"],))
                    conn.commit()
                    open_log = None

        if not open_log:
            cursor.execute("""
                SELECT COUNT(*) as shift_count, MAX(atl.out_time) as last_out_time, SUM(TIMESTAMPDIFF(MINUTE, atl.in_time, atl.out_time)) as total_mins 
                FROM ATTENDANCE_TIME_LOG atl
                JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
                WHERE ac.EMPLOYEE = %s AND ac.attendance_date = %s
            """, (empOid, today))
            shift_stats = cursor.fetchone()
            shift_count = shift_stats["shift_count"] if shift_stats and shift_stats["shift_count"] else 0
            last_out_time = shift_stats["last_out_time"] if shift_stats else None
            total_mins = shift_stats["total_mins"] if shift_stats and shift_stats["total_mins"] else 0

            if shift_count >= 2:
                cursor.close()
                conn.close()
                return {"success": False, "message": "Punch blocked: You have already completed the maximum of 2 shifts for today."}

            if total_mins >= 960:
                cursor.close()
                conn.close()
                return {"success": False, "message": "Punch blocked: You have already completed the maximum 16 hours of duty today."}

            if last_out_time:
                now_dt = datetime.now()
                if isinstance(last_out_time, datetime):
                    last_out_dt = last_out_time
                else:
                    last_out_dt = now_dt

                elapsed_seconds = (now_dt - last_out_dt).total_seconds()
                if 0 <= elapsed_seconds < 600:
                    remaining_mins = int(math.ceil((600 - elapsed_seconds) / 60))
                    cursor.close()
                    conn.close()
                    return {
                        "success": False,
                        "message": f"Punch blocked: Mandatory 10-minute gap required between shifts. Please wait {remaining_mins} minute(s)."
                    }

            shift_detect = detect_shift_logic_internal(cursor, empOid, user["site_oid"], "IN")
            matched_shift = shift_detect.get("matched_shift")

            sdc_oid = None
            if matched_shift:
                matched_shift_oid = matched_shift["oid"]
                cursor.execute("""
                    SELECT oid FROM SHIFT_DESIGNATION_COUNT 
                    WHERE SHIFT = %s AND attendance_date = %s AND DESIGNATION = %s
                """, (matched_shift_oid, today, user["DESIGNATION"]))
                sdc_res = cursor.fetchone()
                
                if sdc_res:
                    sdc_oid = sdc_res["oid"]
                    cursor.execute("UPDATE SHIFT_DESIGNATION_COUNT SET actual_head_count = actual_head_count + 1 WHERE oid = %s", (sdc_oid,))
                else:
                    cursor.execute("""
                        INSERT INTO SHIFT_DESIGNATION_COUNT (attendance_date, planned_head_count, actual_head_count, SHIFT, DESIGNATION)
                        VALUES (%s, 1, 1, %s, %s)
                    """, (today, matched_shift_oid, user["DESIGNATION"]))
                    sdc_oid = cursor.lastrowid

            if not sdc_oid:
                desig_val = user.get("DESIGNATION") or user.get("COMPANY_DESIGNATION") or 1
                cursor.execute("SELECT oid FROM SHIFT WHERE SITE = %s LIMIT 1", (user["site_oid"],))
                fallback_s = cursor.fetchone()
                if not fallback_s:
                    cursor.execute("SELECT oid FROM SHIFT LIMIT 1")
                    fallback_s = cursor.fetchone()

                if fallback_s:
                    f_shift_oid = fallback_s["oid"]
                else:
                    cursor.execute("INSERT INTO SHIFT (name, start_time, end_time, SITE) VALUES ('GENERAL', '09:00:00', '18:00:00', %s)", (user["site_oid"],))
                    f_shift_oid = cursor.lastrowid

                cursor.execute("""
                    SELECT oid FROM SHIFT_DESIGNATION_COUNT 
                    WHERE SHIFT = %s AND attendance_date = %s AND DESIGNATION = %s
                """, (f_shift_oid, today, desig_val))
                sdc_res = cursor.fetchone()
                if sdc_res:
                    sdc_oid = sdc_res["oid"]
                else:
                    cursor.execute("""
                        INSERT INTO SHIFT_DESIGNATION_COUNT (attendance_date, planned_head_count, actual_head_count, SHIFT, DESIGNATION)
                        VALUES (%s, 1, 1, %s, %s)
                    """, (today, f_shift_oid, desig_val))
                    sdc_oid = cursor.lastrowid

            duty_desig = user.get("DESIGNATION") or user.get("COMPANY_DESIGNATION") or 3
            year_month = today.replace(day=1)
            cursor.execute("""
                SELECT oid FROM ATTENDANCE_ROW 
                WHERE EMPLOYEE = %s AND ATTENDANCE_SITE = %s AND yearmonth = %s AND DUTY_DESIGNATION = %s
            """, (empOid, user["site_oid"], year_month, duty_desig))
            row_res = cursor.fetchone()
            
            if row_res:
                row_oid = row_res["oid"]
                cursor.execute("UPDATE ATTENDANCE_ROW SET duty_type = %s WHERE oid = %s", (duty_type, row_oid))
            else:
                cursor.execute("SELECT COALESCE(MAX(oid), 0) + 1 as next_oid FROM ATTENDANCE_ROW")
                next_row_res = cursor.fetchone()
                next_row_oid = next_row_res["next_oid"] if next_row_res else 1

                cursor.execute("""
                    INSERT INTO ATTENDANCE_ROW (oid, yearmonth, duty_type, EMPLOYEE, ATTENDANCE_SITE, DUTY_DESIGNATION)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (next_row_oid, year_month, duty_type, empOid, user["site_oid"], duty_desig))
                row_oid = next_row_oid

            cursor.execute("""
                SELECT oid FROM ATTENDANCE_CELL 
                WHERE EMPLOYEE = %s AND ATTENDANCE_SITE = %s AND attendance_date = %s
            """, (empOid, user["site_oid"], today))
            cell_res = cursor.fetchone()
            
            if cell_res:
                cell_oid = cell_res["oid"]
                cursor.execute("UPDATE ATTENDANCE_CELL SET attendance_state = 'IN' WHERE oid = %s", (cell_oid,))
            else:
                cursor.execute("SELECT COALESCE(MAX(oid), 0) + 1 as next_oid FROM ATTENDANCE_CELL")
                next_cell_res = cursor.fetchone()
                next_cell_oid = next_cell_res["next_oid"] if next_cell_res else 1

                cursor.execute("""
                    INSERT INTO ATTENDANCE_CELL (oid, attendance_date, attendance_state, EMPLOYEE_DESIGNATION, CLIENT_DESIGNATION, EMPLOYEE_SITE, ATTENDANCE_SITE, ATTENDANCE_ROW, EMPLOYEE)
                    VALUES (%s, %s, 'IN', %s, %s, %s, %s, %s, %s)
                """, (next_cell_oid, today, user["COMPANY_DESIGNATION"] or user["DESIGNATION"], user["DESIGNATION"], user_assigned_site, active_site_oid, row_oid, empOid))
                cell_oid = next_cell_oid

            cursor.execute("SELECT COALESCE(MAX(oid), 0) + 1 as next_oid FROM ATTENDANCE_TIME_LOG")
            next_log_res = cursor.fetchone()
            next_log_oid = next_log_res["next_oid"] if next_log_res else 1

            cursor.execute("""
                INSERT INTO ATTENDANCE_TIME_LOG (oid, in_time, ATTENDANCE_CELL, SHIFT_DESIGNATION_COUNT)
                VALUES (%s, %s, %s, %s)
            """, (next_log_oid, now, cell_oid, sdc_oid))
            log_oid = next_log_oid
            officer_name = user.get("name") or user.get("NAME") or ""
            try:
                cursor.execute("""
                    INSERT INTO FIELD_OFFICER_ATTENDANCE_LOCATION 
                    (attendance_time_log, employee_oid, officer, punch_type, latitude, longitude, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (log_oid, empOid, officer_name, 'IN', lat, long, now))
            except Exception as loc_err:
                print(f"Warning inserting attendance location: {loc_err}")

            # Also record into GPSLocationLog for live tracking engine
            try:
                from app.database import SessionLocal
                from app.models.patrol_models import GPSLocationLog
                db_session = SessionLocal()
                try:
                    gps_log = GPSLocationLog(
                        employee_id=empOid,
                        latitude=float(lat),
                        longitude=float(long),
                        accuracy=10.0,
                        speed=0.0,
                        battery_level=100.0,
                        is_mock=False,
                        recorded_at=now
                    )
                    db_session.add(gps_log)
                    db_session.commit()
                finally:
                    db_session.close()
            except Exception as gps_log_err:
                print(f"Warning auto-ingesting punch GPS location: {gps_log_err}")

            conn.commit()
            cursor.close()
            conn.close()
            return {"success": True, "message": "IN TIME marked", "locationTrackingEnabled": True}

        else:
            in_time = open_log["in_time"]
            if in_time:
                time_diff = (now - in_time).total_seconds()
                if time_diff < 600:
                    cursor.close()
                    conn.close()
                    return {"success": False, "message": "PLEASE WAIT 10 MINS AFTER PUNCH IN"}

            out_time_to_save = now
            capped_message = "OUT TIME marked"
            if in_time:
                duration_secs = (now - in_time).total_seconds()
                if duration_secs > 16 * 3600:
                    out_time_to_save = in_time + timedelta(hours=16)
                    capped_message = "OUT TIME marked (Capped at 16 hours maximum duty)"

            cursor.execute("UPDATE ATTENDANCE_TIME_LOG SET out_time = %s WHERE oid = %s", (out_time_to_save, open_log["oid"]))
            cursor.execute("UPDATE ATTENDANCE_CELL SET attendance_state = 'PRESENT' WHERE oid = %s", (open_log["cell_oid"],))
            log_oid = open_log["oid"]

            officer_name = user.get("name") or user.get("NAME") or ""
            try:
                cursor.execute("""
                    INSERT INTO FIELD_OFFICER_ATTENDANCE_LOCATION 
                    (attendance_time_log, employee_oid, officer, punch_type, latitude, longitude, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (log_oid, empOid, officer_name, 'OUT', lat, long, now))
            except Exception as loc_err:
                print(f"Warning inserting attendance location: {loc_err}")

            # Also record into GPSLocationLog for live tracking engine
            try:
                from app.database import SessionLocal
                from app.models.patrol_models import GPSLocationLog
                db_session = SessionLocal()
                try:
                    gps_log = GPSLocationLog(
                        employee_id=empOid,
                        latitude=float(lat),
                        longitude=float(long),
                        accuracy=10.0,
                        speed=0.0,
                        battery_level=100.0,
                        is_mock=False,
                        recorded_at=now
                    )
                    db_session.add(gps_log)
                    db_session.commit()
                finally:
                    db_session.close()
            except Exception as gps_log_err:
                print(f"Warning auto-ingesting punch GPS location: {gps_log_err}")

            conn.commit()
            cursor.close()
            conn.close()
            return {"success": True, "message": capped_message, "locationTrackingEnabled": False}

    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        return {"success": False, "message": f"Punch failed: {str(e)}"}

def get_attendance_logs_logic(empOid: int):
    conn = get_db_connection()
    if conn is None:
        return {"success": False, "message": "Database connection failed"}
    
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)

        # 1. Fetch all sites with valid coordinates for distance comparison
        sites_with_coords = []
        try:
            cursor.execute("SELECT oid, name, latitude, longitude FROM SITE WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
            sites_with_coords = cursor.fetchall()
        except Exception as s_err:
            print("Warning fetching sites with coords:", s_err)

        query = """
            SELECT ac.attendance_date as date, atl.in_time as check_in, atl.out_time as check_out, 'PRESENT' as status,
                   s.start_time, s.end_time, st.name as site_name, COALESCE(ar.duty_type, 'REGULAR') as duty_type,
                   loc_in.latitude as check_in_lat, loc_in.longitude as check_in_long,
                   loc_out.latitude as check_out_lat, loc_out.longitude as check_out_long
            FROM ATTENDANCE_TIME_LOG atl
            JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
            LEFT JOIN ATTENDANCE_ROW ar ON ac.ATTENDANCE_ROW = ar.oid
            LEFT JOIN SITE st ON ac.ATTENDANCE_SITE = st.oid
            LEFT JOIN SHIFT_DESIGNATION_COUNT sdc ON atl.SHIFT_DESIGNATION_COUNT = sdc.oid
            LEFT JOIN SHIFT s ON sdc.SHIFT = s.oid
            LEFT JOIN FIELD_OFFICER_ATTENDANCE_LOCATION loc_in ON (loc_in.attendance_time_log = atl.oid AND loc_in.punch_type = 'IN')
            LEFT JOIN FIELD_OFFICER_ATTENDANCE_LOCATION loc_out ON (loc_out.attendance_time_log = atl.oid AND loc_out.punch_type = 'OUT')
            WHERE ac.EMPLOYEE = %s 
            ORDER BY ac.attendance_date DESC, atl.in_time DESC 
            LIMIT 20
        """
        cursor.execute(query, (empOid,))
        logs = cursor.fetchall()
        
        for log in logs:
            log["date"] = log["date"].isoformat() if log.get("date") else None
            log["check_in"] = log["check_in"].isoformat() if log.get("check_in") else None
            log["check_out"] = log["check_out"].isoformat() if log.get("check_out") else None
            log.pop("start_time", None)
            log.pop("end_time", None)

            # Coordinate matching logic:
            # Compare punch-in lat/long against sites in DB
            c_lat = log.get("check_in_lat")
            c_lon = log.get("check_in_long")

            matched_site = None
            if c_lat is not None and c_lon is not None:
                from app.services.gps_service import haversine_distance_meters
                try:
                    clat_f = float(c_lat)
                    clon_f = float(c_lon)
                    min_dist = float('inf')
                    for st_row in sites_with_coords:
                        try:
                            slat_f = float(st_row["latitude"])
                            slon_f = float(st_row["longitude"])
                            radius = float(st_row.get("geofence_radius") or 300.0)
                            dist = haversine_distance_meters(clat_f, clon_f, slat_f, slon_f)
                            if dist <= radius and dist < min_dist:
                                min_dist = dist
                                matched_site = st_row["name"]
                        except Exception:
                            continue
                except Exception as dist_err:
                    print("Distance calc error:", dist_err)

            log["check_in_lat"] = float(log["check_in_lat"]) if log.get("check_in_lat") is not None else None
            log["check_in_long"] = float(log["check_in_long"]) if log.get("check_in_long") is not None else None
            log["check_out_lat"] = float(log["check_out_lat"]) if log.get("check_out_lat") is not None else None
            log["check_out_long"] = float(log["check_out_long"]) if log.get("check_out_long") is not None else None

            if matched_site:
                log["site_name"] = matched_site
            else:
                # If coordinates were recorded but did NOT match any site in DB, clear site_name so UI shows coordinates only
                if c_lat is not None and c_lon is not None:
                    log["site_name"] = None
                elif not log.get("site_name"):
                    log["site_name"] = None

        return {"success": True, "logs": logs}
    except Exception as e:
        print(f"Error in get_attendance_logs_logic: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor:
            try: cursor.close()
            except Exception: pass
        if conn:
            try: conn.close()
            except Exception: pass

def get_today_status_logic(empOid: int):
    conn = get_db_connection()
    if conn is None:
        return {"success": False, "message": "Database connection failed"}
    
    cursor = None
    try:
        today = get_ist_today()
        cursor = conn.cursor(dictionary=True)

        # 1. Auto-close any stale unclosed open logs older than 16 hours first
        try:
            now_dt = datetime.now()
            cursor.execute("""
                SELECT atl.oid, atl.in_time, atl.ATTENDANCE_CELL 
                FROM ATTENDANCE_TIME_LOG atl
                JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
                WHERE ac.EMPLOYEE = %s AND atl.out_time IS NULL
            """, (empOid,))
            stale_logs = cursor.fetchall()
            for s_log in stale_logs:
                in_t = s_log.get("in_time")
                if in_t and (now_dt - in_t).total_seconds() > 16 * 3600:
                    auto_out = in_t + timedelta(hours=16)
                    cursor.execute("UPDATE ATTENDANCE_TIME_LOG SET out_time = %s WHERE oid = %s", (auto_out, s_log["oid"]))
                    cursor.execute("UPDATE ATTENDANCE_CELL SET attendance_state = 'PRESENT' WHERE oid = %s", (s_log["ATTENDANCE_CELL"],))
            conn.commit()
        except Exception as stale_err:
            print("Error auto-closing stale open logs:", stale_err)

        # 2. Query today's status
        query = """
            SELECT ac.attendance_date as date, atl.in_time as check_in, atl.out_time as check_out, 'PRESENT' as status,
                   loc_in.latitude as check_in_lat, loc_in.longitude as check_in_long,
                   loc_out.latitude as check_out_lat, loc_out.longitude as check_out_long
            FROM ATTENDANCE_TIME_LOG atl
            JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
            LEFT JOIN FIELD_OFFICER_ATTENDANCE_LOCATION loc_in ON (loc_in.attendance_time_log = atl.oid AND loc_in.punch_type = 'IN')
            LEFT JOIN FIELD_OFFICER_ATTENDANCE_LOCATION loc_out ON (loc_out.attendance_time_log = atl.oid AND loc_out.punch_type = 'OUT')
            WHERE ac.EMPLOYEE = %s AND ac.attendance_date = %s
            ORDER BY atl.oid DESC LIMIT 1
        """
        cursor.execute(query, (empOid, today))
        record = cursor.fetchone()

        # 3. Only look for open logs if today's record is still currently IN (open)
        if not record or (record.get("check_in") and record.get("check_out")):
            record = None # Today is fully completed / absent, do NOT fall back to past days!
        
        if record:
            record["date"] = record["date"].isoformat() if record["date"] else None
            record["check_in"] = record["check_in"].isoformat() if record["check_in"] else None
            record["check_out"] = record["check_out"].isoformat() if record["check_out"] else None
        
        return {"success": True, "record": record}
    except Exception as e:
        print(f"Error in get_today_status_logic: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor:
            try: cursor.close()
            except Exception: pass
        if conn:
            try: conn.close()
            except Exception: pass

def get_monthly_stats_logic(empOid: int):
    conn = get_db_connection()
    if conn is None:
        return {"success": False, "message": "Database connection failed"}
    
    cursor = conn.cursor(dictionary=True)
    today = get_ist_today()
    first_day = today.replace(day=1)
    
    _, last_day_of_month = calendar.monthrange(today.year, today.month)
    
    cursor.execute("""
        SELECT COUNT(DISTINCT attendance_date) as present_count 
        FROM ATTENDANCE_CELL 
        WHERE EMPLOYEE = %s AND attendance_date >= %s AND attendance_date <= %s
    """, (empOid, first_day, today))
    res = cursor.fetchone()
    present_count = res["present_count"] if res else 0
    absent_count = max(0, today.day - present_count)

    cursor.close()
    conn.close()
    
    return {
        "success": True,
        "stats": {
            "totalDays": str(last_day_of_month).zfill(2),
            "presentDays": str(present_count).zfill(2),
            "absentDays": str(absent_count).zfill(2)
        }
    }

def get_profile_logic(empOid: int):
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}
        
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                e.name, e.emp_code, e.email, e.mobile, e.date_of_joining, e.active, e.SITE as site_id, e.COMPANY as company_id,
                COALESCE(d.name, '') as designation,
                COALESCE(s.name, '') as site_name,
                COALESCE(c.name, '') as client_name,
                COALESCE(b.name, '') as branch_name,
                COALESCE(comp.name, '') as company_name
            FROM EMPLOYEE e
            LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
            LEFT JOIN SITE s ON e.SITE = s.oid
            LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid
            LEFT JOIN BRANCH b ON e.BRANCH = b.oid
            LEFT JOIN COMPANY comp ON e.COMPANY = comp.oid
            WHERE e.oid = %s
        """
        cursor.execute(query, (empOid,))
        profile = cursor.fetchone()
        
        if profile:
            profile["date_of_joining"] = profile["date_of_joining"].isoformat() if profile["date_of_joining"] else None
            profile["profile_photo"] = None

        cursor.close()
        conn.close()
        
        if not profile:
            return {"success": False, "message": "Profile not found"}
            
        return {"success": True, "profile": profile}
    except Exception as e:
        return {"success": False, "message": str(e)}

async def validate_selfie(emp_oid, file):
    try:
        contents = await file.read()
        import json, os
        from app.utils.face import get_face_embedding, match_embeddings, is_live_face

        # 1. Anti-spoofing / Liveness Check
        is_live, liveness_message = is_live_face(img_data=contents)
        if not is_live:
            return {"success": False, "message": f"Liveness Check Failed: {liveness_message}"}

        # 2. Extract face embedding from current live camera selfie
        current_embedding = get_face_embedding(img_data=contents)
        if current_embedding is None:
            return {"success": False, "message": "No face detected in camera frame. Position face clearly in proper light."}

        # 3. Fetch pre-calculated face_embedding from database for this employee
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}
            
        cursor = conn.cursor(dictionary=True)
        emp_str = str(emp_oid).strip()
        cursor.execute("SELECT oid, emp_code, face_embedding FROM EMPLOYEE WHERE oid = %s OR emp_code = %s", (emp_str, emp_str))
        employee = cursor.fetchone()

        if not employee:
            cursor.close()
            conn.close()
            return {"success": False, "message": f"Employee '{emp_str}' not found"}

        actual_oid = employee['oid']
        actual_emp_code = employee.get('emp_code') or str(actual_oid)

        master_embedding = None
        if employee and employee.get('face_embedding'):
            try:
                master_embedding = json.loads(employee['face_embedding'])
            except Exception:
                master_embedding = None

        # Fallback: Check if master photo exists on disk and extract embedding dynamically
        if master_embedding is None:
            master_photo_path = os.path.join("uploads", f"{actual_oid}.jpg")
            if not os.path.exists(master_photo_path):
                master_photo_path = os.path.join("uploads", f"{actual_emp_code}.jpg")

            if os.path.exists(master_photo_path):
                master_embedding = get_face_embedding(master_photo_path)
                if master_embedding:
                    try:
                        cursor.execute("UPDATE EMPLOYEE SET face_embedding = %s WHERE oid = %s", (json.dumps(master_embedding), actual_oid))
                        conn.commit()
                    except Exception as update_err:
                        print(f"Error saving master face_embedding: {update_err}")

        cursor.close()
        conn.close()

        # Reject if no master reference embedding could be found/extracted
        if master_embedding is None:
            return {"success": False, "message": "MASTER PHOTO NOT REGISTERED. Please upload your profile photo first in settings."}

        # 4. Strict match against master embedding using SFace YuNet comparison
        is_match, match_message = match_embeddings(master_embedding, current_embedding)
        if not is_match:
            return {"success": False, "message": f"FACE MISMATCH: {match_message}"}

        return {"success": True, "message": "FACE VERIFIED SUCCESSFULLY"}
    except Exception as e:
        print(f"Error in validate_selfie: {e}")
        return {"success": False, "message": f"Face verification error: {str(e)}"}

def upload_profile_photo_logic(empOid: Any, file):
    try:
        import os
        uploads_dir = "uploads"
        if not os.path.exists(uploads_dir):
            os.makedirs(uploads_dir)

        emp_str = str(empOid).strip()

        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}

        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT oid, emp_code FROM EMPLOYEE WHERE oid = %s OR emp_code = %s", (emp_str, emp_str))
        emp_row = cursor.fetchone()

        if not emp_row:
            cursor.close()
            conn.close()
            return {"success": False, "message": f"Employee '{emp_str}' not found in database"}

        actual_oid = emp_row['oid']
        actual_emp_code = emp_row.get('emp_code') or str(actual_oid)

        file_contents = file.file.read()

        # Save under both oid and emp_code filenames
        file_path_oid = os.path.join(uploads_dir, f"{actual_oid}.jpg")
        with open(file_path_oid, "wb") as f:
            f.write(file_contents)

        if actual_emp_code and str(actual_emp_code) != str(actual_oid):
            file_path_code = os.path.join(uploads_dir, f"{actual_emp_code}.jpg")
            with open(file_path_code, "wb") as f:
                f.write(file_contents)

        from app.utils.face import get_face_embedding
        embedding = get_face_embedding(file_path_oid)
        if embedding:
            import json
            embedding_json = json.dumps(embedding)
            cursor.execute("UPDATE EMPLOYEE SET face_embedding = %s WHERE oid = %s", (embedding_json, actual_oid))
            conn.commit()
            cursor.close()
            conn.close()
            return {"success": True, "message": "Profile photo uploaded and face embedding registered successfully", "url": f"/uploads/{actual_oid}.jpg"}
        else:
            cursor.close()
            conn.close()
            return {"success": False, "message": "Photo uploaded but no face detected. Please upload a clear face photo."}

    except Exception as e:
        print(f"Error in upload_profile_photo_logic: {e}")
        return {"success": False, "message": str(e)}

async def unified_punch_logic(empOid: int, file, latitude: float, longitude: float):
    try:
        # 1. Validate Selfie
        v_res = await validate_selfie(empOid, file)
        if not v_res["success"]:
            return v_res
            
        # 2. Mark Attendance
        class PunchData:
            def __init__(self, oid, lat, long):
                self.empOid = oid
                self.latitude = lat
                self.longitude = long
                
        punch_data = PunchData(empOid, latitude, longitude)
        res = mark_attendance_logic(punch_data)
        
        if res["success"]:
            return {"success": True, "message": f"Verified & Punched: {res['message']}"}
        else:
            return res
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Server Logic Error: {str(e)}"}

def detect_shift_logic_internal(cursor, empOid: int, site_id: int, punch_type: str = "IN"):
    cursor.execute("SELECT oid, name, start_time, end_time FROM SHIFT WHERE SITE = %s", (site_id,))
    shifts = cursor.fetchall()
    
    if not shifts:
        return {"success": True, "matched_shift": None, "is_within_window": True}
        
    now = datetime.now()
    current_mins = now.hour * 60 + now.minute
    
    matched_shift = None
    closest_diff = 1440
    for s in shifts:
        start_td = s["start_time"]
        end_td = s["end_time"]
        target_secs = start_td.total_seconds() if punch_type == "IN" else end_td.total_seconds()
        target_mins = int(target_secs // 60)
        
        diff = min((target_mins - current_mins) % 1440, (current_mins - target_mins) % 1440)
        if diff < closest_diff:
            closest_diff = diff
            matched_shift = s
            
    if matched_shift:
        matched_shift = dict(matched_shift)
        matched_shift["start_time"] = str(matched_shift["start_time"])
        matched_shift["end_time"] = str(matched_shift["end_time"])
        
    return {
        "success": True, 
        "matched_shift": matched_shift, 
        "is_within_window": True
    }

def detect_shift_logic(empOid: int, punch_type: str = "IN"):
    try:
        conn = get_db_connection()
        if conn is None:
            return {"success": False, "message": "Database connection failed"}
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT site FROM EMPLOYEE WHERE oid = %s", (empOid,))
        user = cursor.fetchone()
        if not user or not user["site"]:
            cursor.close()
            conn.close()
            return {"success": False, "message": "Employee or site not found"}
            
        res = detect_shift_logic_internal(cursor, empOid, user["site"], punch_type)
        cursor.close()
        conn.close()
        return res
    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        return {"success": False, "message": str(e)}

