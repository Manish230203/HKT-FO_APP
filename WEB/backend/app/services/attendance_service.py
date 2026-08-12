from datetime import datetime, date, timedelta, time
from app.database import get_db_connection

def get_attendance_records_logic(date_str: str, client_id: int = None, site_id: int = None):
    try:
        from typing import Optional
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
                st.name as site_name,
                st.clientt as client_id
            FROM EMPLOYEE e
            LEFT JOIN SITE st ON e.site = st.oid
            WHERE e.active = 1
        """
        params = []
        if site_id:
            emp_query += " AND e.site = %s"
            params.append(site_id)
        elif client_id:
            emp_query += " AND st.clientt = %s"
            params.append(client_id)
            
        cursor.execute(emp_query, tuple(params))
        employees = cursor.fetchall()
        
        records = []
        planned = len(employees)
        present = 0
        absent = 0
        missed_punch = 0
        
        for emp in employees:
            emp_oid = emp["empOid"]
            
            # Fetch attendance cell and log for the specified date
            cell_query = """
                SELECT 
                    ac.attendance_state,
                    atl.in_time,
                    atl.out_time,
                    sh.name as shift_name
                FROM ATTENDANCE_CELL ac
                LEFT JOIN ATTENDANCE_TIME_LOG atl ON atl.ATTENDANCE_CELL = ac.oid
                LEFT JOIN SHIFT_DESIGNATION_COUNT sdc ON atl.SHIFT_DESIGNATION_COUNT = sdc.oid
                LEFT JOIN SHIFT sh ON sdc.SHIFT = sh.oid
                WHERE ac.EMPLOYEE = %s AND ac.attendance_date = %s
                ORDER BY atl.in_time DESC
                LIMIT 1
            """
            cursor.execute(cell_query, (emp_oid, date_str))
            cell = cursor.fetchone()
            
            status = "Absent"
            punch_in = None
            punch_out = None
            shift_name = "N/A"
            
            if cell:
                punch_in = cell["in_time"].strftime("%H:%M") if cell.get("in_time") else None
                punch_out = cell["out_time"].strftime("%H:%M") if cell.get("out_time") else None
                shift_name = cell.get("shift_name") or "N/A"
                
                if cell.get("in_time") and cell.get("out_time"):
                    status = "Present"
                    present += 1
                elif cell.get("in_time") and not cell.get("out_time"):
                    status = "Missed Punch Out"
                    missed_punch += 1
                else:
                    status = "Absent"
                    absent += 1
            else:
                status = "Absent"
                absent += 1
                
            records.append({
                "employeeOid": emp_oid,
                "siteOid": emp["site_id"],
                "empId": emp["emp_code"] or f"EMP{emp_oid:03d}",
                "guardName": emp["name"],
                "site": emp["site_name"] or "Unassigned",
                "shift": shift_name,
                "punchInTime": punch_in or "—",
                "punchOutTime": punch_out or "—",
                "status": status
            })
            
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "planned": planned,
            "present": present,
            "absent": absent,
            "missedPunch": missed_punch,
            "records": records
        }
    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        print(f"Error in get_attendance_records_logic: {e}")
        return {"success": False, "message": f"Server error: {str(e)}"}

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
                
            cursor.execute("""
                INSERT INTO ATTENDANCE_ROW (yearmonth, duty_type, EMPLOYEE, ATTENDANCE_SITE, DUTY_DESIGNATION)
                VALUES (%s, %s, %s, %s, %s)
            """, (year_month, duty_type, emp_oid, site_oid, designation))
            row_oid = cursor.lastrowid
            
        # 4. Find/Create ATTENDANCE_CELL
        cursor.execute("""
            SELECT oid FROM ATTENDANCE_CELL 
            WHERE EMPLOYEE = %s AND ATTENDANCE_SITE = %s AND attendance_date = %s
        """, (emp_oid, site_oid, duty_date))
        cell_res = cursor.fetchone()
        
        if cell_res:
            cell_oid = cell_res["oid"]
        else:
            cursor.execute("""
                INSERT INTO ATTENDANCE_CELL (attendance_date, attendance_state, EMPLOYEE_DESIGNATION, CLIENT_DESIGNATION, EMPLOYEE_SITE, ATTENDANCE_SITE, ATTENDANCE_ROW, EMPLOYEE)
                VALUES (%s, 'IN', %s, %s, %s, %s, %s, %s)
            """, (duty_date, emp["company_designation"] or designation, designation, user_assigned_site, site_oid, row_oid, emp_oid))
            cell_oid = cursor.lastrowid
            
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
            if reg_for == "Punch In":
                cursor.execute("""
                    INSERT INTO ATTENDANCE_TIME_LOG (in_time, ATTENDANCE_CELL, SHIFT_DESIGNATION_COUNT)
                    VALUES (%s, %s, %s)
                """, (datetime_str, cell_oid, sdc_oid))
            else:
                cursor.execute("""
                    INSERT INTO ATTENDANCE_TIME_LOG (out_time, ATTENDANCE_CELL, SHIFT_DESIGNATION_COUNT)
                    VALUES (%s, %s, %s)
                """, (datetime_str, cell_oid, sdc_oid))
                
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
