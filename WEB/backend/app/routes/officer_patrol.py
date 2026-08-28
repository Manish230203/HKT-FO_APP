from fastapi import APIRouter, HTTPException, Header, Query
from fastapi.responses import JSONResponse
from app.database import get_db_connection
import json
import time
import random
import uuid
from datetime import datetime, date
from typing import Dict, Any, List, Optional

router = APIRouter()

def get_authenticated_employee(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    import base64
    if authorization and isinstance(authorization, str) and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]
            return json.loads(base64.b64decode(token.encode()).decode())
        except Exception:
            pass
    return {
        "id": 7558,
        "name": "Amit Kulkarni",
        "role": "FIELD OFFICER",
        "employee_id": "EMP103",
        "site_id": 191
    }


# Helper to deserialize longtext fields
def serialize_field(val: Any) -> str:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return json.dumps(val)
    return str(val)

def deserialize_field(val: Any) -> Any:
    if not val:
        return None
    try:
        return json.loads(val)
    except Exception:
        return val

def map_db_row_to_frontend(r: Dict[str, Any]) -> Dict[str, Any]:
    if not r:
        return r
    # Map DB keys to frontend expected camelCase keys
    r["id"] = r.get("oid")
    r["reportNo"] = r.get("report_id")
    r["reportId"] = r.get("report_id")
    r["visitDate"] = r.get("visit_date")
    r["visitType"] = r.get("visit_type")
    r["createdOn"] = r.get("created_on")
    r["clientId"] = r.get("client_id")
    r["siteId"] = r.get("site_id")
    r["startTime"] = r.get("start_time") or r.get("check_in_time") or r.get("check-in_time") or r.get("startTime") or r.get("checkInTime")
    r["endTime"] = r.get("end_time") or r.get("check_out_time") or r.get("check-out_time") or r.get("endTime") or r.get("checkOutTime")
    r["officerSignature"] = r.get("officer_signature")
    r["lectureDetails"] = r.get("lecture_details")
    r["randomChecking"] = r.get("random_checking")
    r["overallRemarks"] = r.get("overall_remarks")
    r["clientName"] = r.get("client_name") or r.get("company") or "N/A"
    r["company"] = r.get("client_name") or r.get("company") or "N/A"
    
    unit_val = r.get("unit")
    if not unit_val or unit_val in ("Unspecified Unit", "N/A"):
        unit_val = r.get("site_name") or "N/A"
    r["unit"] = unit_val

    rep_id = r.get("report_id") or ""
    if ("-N/A-" in rep_id or "-Unspecified Unit-" in rep_id) and r.get("site_name"):
        rep_id = rep_id.replace("-N/A-", f"-{r['site_name']}-").replace("-Unspecified Unit-", f"-{r['site_name']}-")
    r["reportNo"] = rep_id
    r["reportId"] = rep_id

    r["branchId"] = r.get("branch_id")
    r["emailAccess"] = 1 if r.get("email_access") in (1, "1", True) else 0
    
    # Deserialization of list/dict fields
    r["photos"] = deserialize_field(r.get("photos")) or []
    r["guards"] = deserialize_field(r.get("guards")) or []
    r["checklist"] = deserialize_field(r.get("checklist")) or []
    r["observations"] = deserialize_field(r.get("observations")) or []
    r["attachments"] = deserialize_field(r.get("attachments")) or []
    return r

# --- ASSESSMENT CLIENTS & SITES ENDPOINTS ---

@router.get("/assessments/clients")
def get_assessments_clients(emp_oid: Optional[str] = Query(None), empOid: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    conn = get_db_connection()
    if conn is None:
        return JSONResponse(status_code=500, content={"message": "Database connection failed"})
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT oid as id, name, company_vender_code as code FROM CLIENTT ORDER BY name")
        rows = cursor.fetchall()
        return JSONResponse(content=rows)
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})
    finally:
        if cursor:
            try: cursor.close()
            except Exception: pass
        if conn:
            try: conn.close()
            except Exception: pass

@router.get("/assessments/sites")
def get_assessments_sites(client_id: Optional[int] = Query(None), company_id: Optional[int] = Query(None), emp_oid: Optional[str] = Query(None), empOid: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    conn = get_db_connection()
    if conn is None:
        return JSONResponse(status_code=500, content={"message": "Database connection failed"})
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT DISTINCT s.oid as id, s.name, s.CLIENTT as client_id, cl.name as client_name, b.name as branch_name, 
                   COALESCE(NULLIF(s.latitude, 0), sg.latitude) as latitude, 
                   COALESCE(NULLIF(s.longitude, 0), sg.longitude) as longitude 
            FROM SITE s 
            LEFT JOIN CLIENTT cl ON s.CLIENTT = cl.oid 
            LEFT JOIN BRANCH b ON s.BRANCH = b.oid
            LEFT JOIN (
                SELECT SITE, AVG(latitude) as latitude, AVG(longitude) as longitude 
                FROM SITE_GATE_QRCODE 
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0
                GROUP BY SITE
            ) sg ON s.oid = sg.SITE
        """
        where_clauses = []
        params = []

        target_client = client_id or company_id
        if target_client:
            where_clauses.append("(s.CLIENTT = %s)")
            params.append(target_client)

        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        query += " ORDER BY s.name"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return JSONResponse(content=rows)
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})
    finally:
        if cursor:
            try: cursor.close()
            except Exception: pass
        if conn:
            try: conn.close()
            except Exception: pass

@router.post("/assessments/branches/{branch_id}/email-access")
@router.put("/assessments/branches/{branch_id}")
def update_branch_email_access(branch_id: int, payload: dict):
    email_access = 1 if payload.get("emailAccess") in (1, "1", True) or payload.get("email_access") in (1, "1", True) else 0
    conn = get_db_connection()
    if conn is None:
        return JSONResponse(status_code=500, content={"message": "Database connection failed"})
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        if branch_id in (3, 6):
            cursor.execute("UPDATE BRANCH SET email_access = %s WHERE oid IN (3, 6) OR LOWER(name) LIKE '%pune%'", (email_access,))
        else:
            cursor.execute("UPDATE BRANCH SET email_access = %s WHERE oid = %s", (email_access, branch_id))
        conn.commit()
        return JSONResponse(content={"success": True, "message": f"Updated email access for branch {branch_id} to {email_access}"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})
    finally:
        if cursor:
            try: cursor.close()
            except Exception: pass
        if conn:
            try: conn.close()
            except Exception: pass

@router.get("/site-guards")
def get_site_guards(
    site_id: Optional[int] = Query(None),
    siteId: Optional[int] = Query(None),
    shift: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    target_site_id = site_id or siteId
    conn = get_db_connection()
    if conn is None:
        return JSONResponse(status_code=500, content={"message": "Database connection failed"})
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        if target_site_id:
            query = """
                SELECT 
                    e.oid as empOid,
                    e.name,
                    e.emp_code as empCode,
                    COALESCE(d.name, e.company_designation, 'Security Guard') as dutyType,
                    'Satisfactory' as rating,
                    'Alert & Awake' as status
                FROM EMPLOYEE e
                LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
                WHERE e.active = 1 AND e.SITE = %s
                ORDER BY e.name
            """
            cursor.execute(query, (target_site_id,))
        else:
            query = """
                SELECT 
                    e.oid as empOid,
                    e.name,
                    e.emp_code as empCode,
                    COALESCE(d.name, e.company_designation, 'Security Guard') as dutyType,
                    'Satisfactory' as rating,
                    'Alert & Awake' as status
                FROM EMPLOYEE e
                LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
                WHERE e.active = 1
                LIMIT 50
            """
            cursor.execute(query)
        rows = cursor.fetchall()
        
        guards_list = []
        for r in rows:
            guards_list.append({
                "name": r.get("name") or "Security Guard",
                "empCode": r.get("empCode") or f"G{r.get('empOid')}",
                "empOid": r.get("empOid"),
                "dutyType": r.get("dutyType") or "Security Guard",
                "rating": "Satisfactory",
                "status": "Alert & Awake"
            })
        return JSONResponse(content=guards_list)
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})
    finally:
        if cursor:
            try: cursor.close()
            except Exception: pass
        if conn:
            try: conn.close()
            except Exception: pass

# --- PLANNED VISITS ENDPOINT (FIELD_OFFICER_ASSIGNED_VISITS & FIELD_OFFICER_VISIT_FREQUENCY) ---

@router.get("/planned-visits")
def get_planned_visits(empOid: Optional[str] = Query(None)):
    import calendar
    from datetime import datetime

    conn = get_db_connection()
    if conn is None:
        return JSONResponse(status_code=500, content={"message": "Database connection failed"})
    
    try:
        cursor = conn.cursor(dictionary=True)

        # Fetch completed reports per site with visit/creation date for accurate plan matching
        completed_reports = []
        try:
            query_counts = """
                SELECT site_id, employee_oid, LOWER(TRIM(officer)) as off_name, DATE(COALESCE(visit_date, created_on)) as rep_date
                FROM (
                    SELECT site_id, employee_oid, officer, visit_date, created_on FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE site_id IS NOT NULL AND status = 'Completed'
                    UNION ALL
                    SELECT site_id, employee_oid, officer, visit_date, created_on FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE site_id IS NOT NULL AND status = 'Completed'
                    UNION ALL
                    SELECT site_id, employee_oid, officer, visit_date, created_on FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE site_id IS NOT NULL
                ) t
            """
            cursor.execute(query_counts)
            completed_reports = cursor.fetchall() or []
        except Exception as err:
            print("Error checking completed site counts:", err)

        where_clauses = ["(UPPER(av.status) = 'PUBLISHED' OR UPPER(av.status) = 'COMPLETED')"]
        params = []
        if empOid:
            where_clauses.append("(av.employee_oid = %s OR e.oid = %s OR e.emp_code = %s)")
            params.extend([empOid, empOid, empOid])

        where_clause = " WHERE " + " AND ".join(where_clauses)

        query = f"""
            SELECT 
                av.oid as id,
                av.plan_code as planCode,
                av.planning_type as planningType,
                av.visit_date as visitDate,
                av.week_start_date as weekStartDate,
                av.week_end_date as weekEndDate,
                av.planning_month as planningMonth,
                av.planning_year as planningYear,
                av.status as planStatus,
                av.created_at as createdAt,
                e.oid as officerId,
                e.name as officerName,
                s.oid as siteId,
                s.name as siteName,
                COALESCE(NULLIF(s.latitude, 0), sg.latitude) as latitude,
                COALESCE(NULLIF(s.longitude, 0), sg.longitude) as longitude,
                cl.oid as clientId,
                cl.name as clientName,
                vf.visit_frequency as visitFrequency
            FROM FIELD_OFFICER_ASSIGNED_VISITS av
            JOIN FIELD_OFFICER_VISIT_FREQUENCY vf ON av.oid = vf.plan_oid
            LEFT JOIN EMPLOYEE e ON av.employee_oid = e.oid
            LEFT JOIN SITE s ON vf.site_oid = s.oid
            LEFT JOIN (
                SELECT SITE, AVG(latitude) as latitude, AVG(longitude) as longitude 
                FROM SITE_GATE_QRCODE 
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0
                GROUP BY SITE
            ) sg ON s.oid = sg.SITE
            LEFT JOIN CLIENTT cl ON s.CLIENTT = cl.oid
            {where_clause}
            ORDER BY av.created_at DESC, av.oid DESC
        """
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        result = []
        today_str = time.strftime("%Y-%m-%d")

        for r in rows:
            site_id_val = r.get("siteId")
            officer_id_str = str(r.get("officerId")) if r.get("officerId") is not None else None
            officer_name = (r.get("officerName") or "").lower().strip()

            ws = r.get("weekStartDate")
            we = r.get("weekEndDate")
            pm = r.get("planningMonth")
            py = r.get("planningYear")
            vdate = r.get("visitDate")
            cdate = r["createdAt"].strftime("%Y-%m-%d") if hasattr(r.get("createdAt"), "strftime") else str(r.get("createdAt"))[:10] if r.get("createdAt") else today_str

            # Filter reports within this plan's specific timeframe
            done_cnt = 0
            if site_id_val:
                for rep in completed_reports:
                    if rep.get("site_id") != site_id_val:
                        continue
                    
                    rep_d_str = str(rep["rep_date"]) if rep.get("rep_date") else None
                    if not rep_d_str:
                        continue

                    # Check date range matching plan period
                    in_period = False
                    if ws and we:
                        in_period = (str(ws) <= rep_d_str <= str(we))
                    elif pm and py:
                        try:
                            rep_dt = datetime.strptime(rep_d_str, "%Y-%m-%d")
                            in_period = (rep_dt.month == int(pm) and rep_dt.year == int(py))
                        except Exception:
                            in_period = False
                    else:
                        target_d = str(vdate) if vdate else cdate
                        in_period = (rep_d_str == target_d)

                    if in_period:
                        rep_emp = str(rep["employee_oid"]) if rep.get("employee_oid") else None
                        rep_off = (rep.get("off_name") or "").strip()
                        if officer_id_str and rep_emp and officer_id_str == rep_emp:
                            done_cnt += 1
                        elif officer_name and rep_off and officer_name == rep_off:
                            done_cnt += 1
                        elif not officer_id_str and not officer_name:
                            done_cnt += 1

            freq = r.get("visitFrequency") or 1
            pending_cnt = max(0, freq - done_cnt)

            if ws and we:
                try:
                    ws_dt = datetime.strptime(str(ws), "%Y-%m-%d")
                    we_dt = datetime.strptime(str(we), "%Y-%m-%d")
                    period_str = f"{ws_dt.strftime('%d %b %Y')} - {we_dt.strftime('%d %b %Y')}"
                except Exception:
                    period_str = f"{ws} - {we}"
            elif pm and py:
                try:
                    last_day = calendar.monthrange(int(py), int(pm))[1]
                    month_name = datetime(int(py), int(pm), 1).strftime("%b")
                    period_str = f"01 {month_name} {py} - {last_day} {month_name} {py}"
                except Exception:
                    period_str = f"Month {pm}/{py}"
            elif vdate:
                try:
                    vd_dt = datetime.strptime(str(vdate), "%Y-%m-%d")
                    period_str = vd_dt.strftime("%d %b %Y")
                except Exception:
                    period_str = str(vdate)
            elif r.get("createdAt"):
                period_str = r["createdAt"].strftime("%d %b %Y") if hasattr(r["createdAt"], "strftime") else str(r["createdAt"])[:10]
            else:
                period_str = time.strftime("%d %b %Y")

            date_str = str(ws) if ws else (str(vdate) if vdate else period_str)

            raw_status = (r.get("planStatus") or "PUBLISHED").upper()
            if raw_status == "COMPLETED" or done_cnt >= freq:
                status = "Completed"
            elif done_cnt > 0:
                status = "In Progress"
            elif raw_status == "DRAFT":
                status = "Pending"
            else:
                if r.get("weekEndDate") and str(r["weekEndDate"]) < today_str:
                    status = "Overdue"
                else:
                    status = "Pending"

            pt_raw = (r.get("planningType") or "WEEKLY").upper()
            if pt_raw == "WEEKLY":
                type_name = "Weekly"
            elif pt_raw == "MONTHLY":
                type_name = "Monthly"
            elif pt_raw == "SINGLE":
                type_name = "Single"
            else:
                type_name = pt_raw.title()

            shift_text = f"{type_name} ({done_cnt}/{freq} Done)"

            result.append({
                "id": f"pv-{r['id']}-{r.get('siteId', 0)}",
                "planCode": r.get("planCode"),
                "planningType": r.get("planningType"),
                "clientId": r.get("clientId") or 1,
                "clientName": r.get("clientName") or "N/A",
                "siteId": r.get("siteId") or 1,
                "siteName": r.get("siteName") or "N/A",
                "latitude": r.get("latitude"),
                "longitude": r.get("longitude"),
                "officerId": r.get("officerId"),
                "officerName": r.get("officerName") or "Field Officer",
                "date": date_str,
                "plannedPeriod": period_str,
                "shift": shift_text,
                "visitFrequency": freq,
                "completedVisits": done_cnt,
                "pendingVisits": pending_cnt,
                "status": status
            })

        cursor.close()
        conn.close()
        return JSONResponse(content=result)
    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        print(f"Error in get_planned_visits: {e}")
        return JSONResponse(status_code=500, content={"message": f"Server error: {str(e)}"})

@router.post("/planned-visits")
def create_planned_visit(payload: dict):
    conn = get_db_connection()
    if conn is None:
        return JSONResponse(status_code=500, content={"success": False, "message": "Database connection failed"})
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        from datetime import datetime
        
        cursor.execute("SELECT plan_code FROM FIELD_OFFICER_ASSIGNED_VISITS WHERE plan_code LIKE 'VP-%' ORDER BY CHAR_LENGTH(plan_code) DESC, plan_code DESC LIMIT 1")
        last_vp_row = cursor.fetchone()
        next_num = 1
        if last_vp_row and last_vp_row.get("plan_code"):
            try:
                num_str = str(last_vp_row["plan_code"]).replace("VP-", "").strip()
                next_num = int(num_str) + 1
            except Exception:
                next_num = 1
        plan_code = f"VP-{next_num:03d}"
        
        planning_type = str(payload.get("planningType", "SINGLE")).upper()
        if planning_type not in ["WEEKLY", "MONTHLY", "SINGLE"]:
            planning_type = "SINGLE"
            
        raw_emp = payload.get("officerId") or payload.get("employee_oid") or payload.get("empOid") or 7558
        emp_oid = 7558
        try:
            emp_oid = int(raw_emp)
        except (ValueError, TypeError):
            # Resolve string employee ID/code to integer oid
            try:
                cursor.execute("SELECT oid FROM EMPLOYEE WHERE emp_code = %s OR oid = %s LIMIT 1", (str(raw_emp), str(raw_emp)))
                emp_row = cursor.fetchone()
                if emp_row and emp_row.get("oid"):
                    emp_oid = int(emp_row["oid"])
            except Exception as err:
                print("Warning resolving emp_code:", err)

        raw_site = payload.get("siteId") or payload.get("site_oid") or 1
        site_oid = 1
        try:
            site_oid = int(raw_site)
        except (ValueError, TypeError):
            site_oid = 1

        freq = int(payload.get("visitFrequency", 1))

        week_start_date = None
        week_end_date = None
        planning_month = None
        planning_year = None
        visit_date = None

        if planning_type == "SINGLE":
            visit_date = payload.get("visitDate") or payload.get("startDate") or datetime.now().strftime("%Y-%m-%d")
        elif planning_type == "WEEKLY":
            week_start_date = payload.get("weekStartDate") or payload.get("startDate") or datetime.now().strftime("%Y-%m-%d")
            week_end_date = payload.get("weekEndDate") or payload.get("endDate") or week_start_date
        elif planning_type == "MONTHLY":
            pm = payload.get("planningMonth") or payload.get("month")
            py = payload.get("planningYear") or payload.get("year")
            if pm and py:
                planning_month = int(pm)
                planning_year = int(py)
            else:
                date_ref = payload.get("startDate") or payload.get("visitDate") or datetime.now().strftime("%Y-%m-%d")
                try:
                    dt_ref = datetime.strptime(str(date_ref), "%Y-%m-%d")
                    planning_month = dt_ref.month
                    planning_year = dt_ref.year
                except Exception:
                    now_dt = datetime.now()
                    planning_month = now_dt.month
                    planning_year = now_dt.year
        
        cursor.execute("""
            INSERT INTO FIELD_OFFICER_ASSIGNED_VISITS 
            (plan_code, planning_type, week_start_date, week_end_date, planning_month, planning_year, visit_date, employee_oid, planning_method, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'MANUAL', 'PUBLISHED')
        """, (plan_code, planning_type, week_start_date, week_end_date, planning_month, planning_year, visit_date, emp_oid))
        
        plan_oid = cursor.lastrowid
        
        cursor.execute("""
            INSERT INTO FIELD_OFFICER_VISIT_FREQUENCY (plan_oid, site_oid, visit_frequency)
            VALUES (%s, %s, %s)
        """, (plan_oid, site_oid, freq))
        
        conn.commit()
        if cursor:
            cursor.close()
        conn.close()
        return JSONResponse(content={"success": True, "message": "Visit plan assigned successfully", "id": plan_oid, "planCode": plan_code})
    except Exception as e:
        print(f"Error in create_planned_visit: {e}")
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            try:
                conn.close()
            except Exception:
                pass
        return JSONResponse(status_code=500, content={"success": False, "message": f"Failed to create visit plan: {str(e)}"})


# --- OFFICER ROUND REPORTS ---

@router.get("/officer-rounds/reports")
def get_round_reports(emp_oid: Optional[str] = Query(None), empOid: Optional[str] = Query(None)):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT r.*, s.name as site_name, cl.name as client_name, s.BRANCH as branch_id,
                   CASE WHEN COALESCE(b_off.email_access, b_site.email_access, 1) = 1 AND COALESCE(b_site.email_access, 1) = 1 THEN 1 ELSE 0 END as email_access
            FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS r
            LEFT JOIN SITE s ON r.site_id = s.oid
            LEFT JOIN CLIENTT cl ON (r.client_id = cl.oid OR s.CLIENTT = cl.oid)
            LEFT JOIN EMPLOYEE e ON (r.employee_oid = e.oid OR r.employee_oid = e.emp_code)
            LEFT JOIN BRANCH b_site ON s.BRANCH = b_site.oid
            LEFT JOIN BRANCH b_off ON e.BRANCH = b_off.oid
        """
        params = []
        target_emp = emp_oid or empOid
        if target_emp:
            query += """ WHERE (
                r.employee_oid = %s OR r.employee_oid = (SELECT emp_code FROM EMPLOYEE WHERE oid = %s LIMIT 1)
                OR r.officer = (SELECT name FROM EMPLOYEE WHERE oid = %s OR emp_code = %s LIMIT 1)
            ) """
            params.extend([target_emp, target_emp, target_emp, target_emp])
        query += " ORDER BY r.created_on DESC, r.oid DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [map_db_row_to_frontend(r) for r in rows]
    finally:
        cursor.close()
        conn.close()

@router.get("/officer-rounds/reports/{id}")
def get_round_report(id: str):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT r.*, s.name as site_name, cl.name as client_name, s.BRANCH as branch_id,
                   CASE WHEN COALESCE(b_off.email_access, b_site.email_access, 1) = 1 AND COALESCE(b_site.email_access, 1) = 1 THEN 1 ELSE 0 END as email_access
            FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS r
            LEFT JOIN SITE s ON r.site_id = s.oid
            LEFT JOIN CLIENTT cl ON (r.client_id = cl.oid OR s.CLIENTT = cl.oid)
            LEFT JOIN EMPLOYEE e ON (r.employee_oid = e.oid OR r.employee_oid = e.emp_code)
            LEFT JOIN BRANCH b_site ON s.BRANCH = b_site.oid
            LEFT JOIN BRANCH b_off ON e.BRANCH = b_off.oid
            WHERE r.oid = %s
        """
        cursor.execute(query, (id,))
        r = cursor.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Report not found")
        return map_db_row_to_frontend(r)
    finally:
        cursor.close()
        conn.close()

@router.post("/officer-rounds/reports")
def save_round_report(payload: Dict[str, Any], authorization: Optional[str] = Header(None)):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        emp = get_authenticated_employee(authorization)
        emp_oid = emp.get("id")
        emp_name = emp.get("name")

        if not payload.get("id") and not payload.get("oid"):
            cursor.execute("SELECT oid FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE oid REGEXP '^[0-9]+$' ORDER BY CAST(oid AS UNSIGNED) DESC LIMIT 1")
            max_r = cursor.fetchone()
            next_num = (int(max_r["oid"]) + 1) if max_r and max_r.get("oid") else 109
            oid = str(next_num)
        else:
            oid = str(payload.get("id") or payload.get("oid"))

        unit = payload.get("unit") or payload.get("unit_name") or ""
        client_id = payload.get("clientId") or payload.get("client_id") or 1
        site_id = payload.get("siteId") or payload.get("site_id") or 1
        visit_date = payload.get("visitDate") or payload.get("visit_date") or date.today().isoformat()
        visit_type = payload.get("visitType") or payload.get("visit_type") or "Night Round"
        shift = payload.get("shift") or "Night"
        start_time = payload.get("startTime") or payload.get("start_time") or "21:00"
        end_time = payload.get("endTime") or payload.get("end_time") or "05:00"
        gps = payload.get("gps") or ""
        photos = payload.get("photos")
        guards = payload.get("guards")
        checklist = payload.get("checklist")
        observations = payload.get("observations")
        suggestions = payload.get("suggestions") or payload.get("key_improvements") or ""
        attachments = payload.get("attachments")
        officer_signature = payload.get("officerSignature") or payload.get("officer_signature") or ""
        status = payload.get("status") or "Completed"
        created_on = payload.get("createdOn") or payload.get("created_on") or datetime.now().isoformat()
        lecture_details = payload.get("lectureDetails") or payload.get("lecture_details") or ""
        random_checking = payload.get("randomChecking") or payload.get("random_checking") or ""
        overall_remarks = payload.get("overallRemarks") or payload.get("overall_remarks") or ""

        if not payload.get("reportNo") and not payload.get("reportId") and not payload.get("report_id"):
            try:
                dt = datetime.strptime(str(visit_date), "%Y-%m-%d")
                date_fmt = dt.strftime("%d/%m/%y")
            except Exception:
                date_fmt = datetime.now().strftime("%d/%m/%y")

            c_name = "Client"
            s_name = unit or "Site"
            if client_id:
                cursor.execute("SELECT name FROM CLIENTT WHERE oid = %s", (client_id,))
                cr = cursor.fetchone()
                if cr and cr.get("name"): c_name = cr["name"]
            if site_id:
                cursor.execute("SELECT name FROM SITE WHERE oid = %s", (site_id,))
                sr = cursor.fetchone()
                if sr and sr.get("name"): s_name = sr["name"]

            report_id = f"01-{c_name}-{s_name}-ONR-{date_fmt}"
        else:
            report_id = str(payload.get("reportNo") or payload.get("reportId") or payload.get("report_id"))

        # Check if exists
        cursor.execute("SELECT oid FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE oid = %s", (oid,))
        exists = cursor.fetchone()

        if exists:
            sql = """
                UPDATE FIELD_OFFICER_NIGHT_VISIT_REPORTS SET
                    report_id = %s, unit = %s, client_id = %s, site_id = %s, visit_date = %s,
                    visit_type = %s, officer = %s, shift = %s, `check-in_time` = %s, `check-out_time` = %s,
                    gps = %s, photos = %s, guards = %s, checklist = %s, observations = %s,
                    suggestions = %s, attachments = %s, officer_signature = %s, status = %s,
                    created_on = COALESCE(created_on, %s), lecture_details = %s, random_checking = %s,
                    overall_remarks = %s, employee_oid = %s
                WHERE oid = %s
            """
            query_params = (
                report_id,
                unit,
                client_id,
                site_id,
                visit_date,
                visit_type,
                emp_name,
                shift,
                start_time,
                end_time,
                gps,
                serialize_field(photos),
                serialize_field(guards),
                serialize_field(checklist),
                serialize_field(observations),
                suggestions,
                serialize_field(attachments),
                officer_signature,
                status,
                created_on,
                lecture_details,
                random_checking,
                overall_remarks,
                emp_oid,
                oid
            )
            cursor.execute(sql, query_params)
        else:
            sql = """
                INSERT INTO FIELD_OFFICER_NIGHT_VISIT_REPORTS (
                    report_id, unit, client_id, site_id, visit_date,
                    visit_type, officer, shift, `check-in_time`, `check-out_time`,
                    gps, photos, guards, checklist, observations,
                    suggestions, attachments, officer_signature, status,
                    created_on, lecture_details, random_checking, overall_remarks, employee_oid, oid
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            query_params = (
                report_id,
                unit,
                client_id,
                site_id,
                visit_date,
                visit_type,
                emp_name,
                shift,
                start_time,
                end_time,
                gps,
                serialize_field(photos),
                serialize_field(guards),
                serialize_field(checklist),
                serialize_field(observations),
                suggestions,
                serialize_field(attachments),
                officer_signature,
                status,
                created_on,
                lecture_details,
                random_checking,
                overall_remarks,
                emp_oid,
                oid
            )
            cursor.execute(sql, query_params)

            # Insert or update into VISIT_REPORT_METADATA
            metadata_sql = """
                INSERT INTO VISIT_REPORT_METADATA (
                    employee_oid, officer, report_type, report_oid, site_id, visit_date
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE site_id = VALUES(site_id), visit_date = VALUES(visit_date)
            """
            metadata_params = (
                emp_oid,
                emp_name,
                "NIGHT",
                oid,
                site_id,
                visit_date
            )
            cursor.execute(metadata_sql, metadata_params)
        
        conn.commit()
        return {"success": True, "message": "Report saved successfully", "id": oid, "report_id": report_id}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@router.delete("/officer-rounds/reports/{id}")
def delete_round_report(id: str):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("DELETE FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE oid = %s", (id,))
        conn.commit()
        return {"success": True, "message": "Report deleted successfully"}
    finally:
        cursor.close()
        conn.close()


# --- OFFICER VISIT REPORTS ---

@router.get("/officer-visits/reports")
def get_visit_reports(emp_oid: Optional[str] = Query(None), empOid: Optional[str] = Query(None)):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT r.*, s.name as site_name, cl.name as client_name, s.BRANCH as branch_id,
                   CASE WHEN COALESCE(b_off.email_access, b_site.email_access, 1) = 1 AND COALESCE(b_site.email_access, 1) = 1 THEN 1 ELSE 0 END as email_access
            FROM FIELD_OFFICER_DAY_VISIT_REPORTS r
            LEFT JOIN SITE s ON r.site_id = s.oid
            LEFT JOIN CLIENTT cl ON (r.client_id = cl.oid OR s.CLIENTT = cl.oid)
            LEFT JOIN EMPLOYEE e ON (r.employee_oid = e.oid OR r.employee_oid = e.emp_code)
            LEFT JOIN BRANCH b_site ON s.BRANCH = b_site.oid
            LEFT JOIN BRANCH b_off ON e.BRANCH = b_off.oid
        """
        params = []
        target_emp = emp_oid or empOid
        if target_emp:
            query += """ WHERE (
                r.employee_oid = %s OR r.employee_oid = (SELECT emp_code FROM EMPLOYEE WHERE oid = %s LIMIT 1)
                OR r.officer = (SELECT name FROM EMPLOYEE WHERE oid = %s OR emp_code = %s LIMIT 1)
            ) """
            params.extend([target_emp, target_emp, target_emp, target_emp])
        query += " ORDER BY r.created_on DESC, r.oid DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [map_db_row_to_frontend(r) for r in rows]
    finally:
        cursor.close()
        conn.close()

@router.get("/officer-visits/reports/{id}")
def get_visit_report(id: str):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT r.*, s.name as site_name, cl.name as client_name, s.BRANCH as branch_id,
                   CASE WHEN COALESCE(b_off.email_access, b_site.email_access, 1) = 1 AND COALESCE(b_site.email_access, 1) = 1 THEN 1 ELSE 0 END as email_access
            FROM FIELD_OFFICER_DAY_VISIT_REPORTS r
            LEFT JOIN SITE s ON r.site_id = s.oid
            LEFT JOIN CLIENTT cl ON (r.client_id = cl.oid OR s.CLIENTT = cl.oid)
            LEFT JOIN EMPLOYEE e ON (r.employee_oid = e.oid OR r.employee_oid = e.emp_code)
            LEFT JOIN BRANCH b_site ON s.BRANCH = b_site.oid
            LEFT JOIN BRANCH b_off ON e.BRANCH = b_off.oid
            WHERE r.oid = %s
        """
        cursor.execute(query, (id,))
        r = cursor.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Report not found")
        return map_db_row_to_frontend(r)
    finally:
        cursor.close()
        conn.close()

@router.post("/officer-visits/reports")
def save_visit_report(payload: Dict[str, Any], authorization: Optional[str] = Header(None)):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        emp = get_authenticated_employee(authorization)
        emp_oid = emp.get("id")
        emp_name = emp.get("name")

        if not payload.get("id") and not payload.get("oid"):
            cursor.execute("SELECT oid FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE oid REGEXP '^[0-9]+$' ORDER BY CAST(oid AS UNSIGNED) DESC LIMIT 1")
            max_r = cursor.fetchone()
            next_num = (int(max_r["oid"]) + 1) if max_r and max_r.get("oid") else 107
            oid = str(next_num)
        else:
            oid = str(payload.get("id") or payload.get("oid"))

        unit = payload.get("unit") or payload.get("unit_name") or ""
        client_id = payload.get("clientId") or payload.get("client_id") or 1
        site_id = payload.get("siteId") or payload.get("site_id") or 1
        visit_date = payload.get("visitDate") or payload.get("visit_date") or date.today().isoformat()
        visit_type = payload.get("visitType") or payload.get("visit_type") or "Scheduled"
        shift = payload.get("shift") or "Day"
        start_time = payload.get("startTime") or payload.get("start_time") or "09:00"
        end_time = payload.get("endTime") or payload.get("end_time") or "17:00"
        gps = payload.get("gps") or ""
        photos = payload.get("photos")
        guards = payload.get("guards")
        checklist = payload.get("checklist")
        observations = payload.get("observations")
        suggestions = payload.get("suggestions") or payload.get("key_improvements") or ""
        attachments = payload.get("attachments")
        status = payload.get("status") or "Completed"
        created_on = payload.get("createdOn") or payload.get("created_on") or datetime.now().isoformat()
        lecture_details = payload.get("lectureDetails") or payload.get("lecture_details") or ""
        random_checking = payload.get("randomChecking") or payload.get("random_checking") or ""
        overall_remarks = payload.get("overallRemarks") or payload.get("overall_remarks") or ""

        if not payload.get("reportNo") and not payload.get("reportId") and not payload.get("report_id"):
            try:
                dt = datetime.strptime(str(visit_date), "%Y-%m-%d")
                date_fmt = dt.strftime("%d/%m/%y")
            except Exception:
                date_fmt = datetime.now().strftime("%d/%m/%y")

            c_name = "Client"
            s_name = unit or "Site"
            if client_id:
                cursor.execute("SELECT name FROM CLIENTT WHERE oid = %s", (client_id,))
                cr = cursor.fetchone()
                if cr and cr.get("name"): c_name = cr["name"]
            if site_id:
                cursor.execute("SELECT name FROM SITE WHERE oid = %s", (site_id,))
                sr = cursor.fetchone()
                if sr and sr.get("name"): s_name = sr["name"]

            report_id = f"01-{c_name}-{s_name}-ODV-{date_fmt}"
        else:
            report_id = str(payload.get("reportNo") or payload.get("reportId") or payload.get("report_id"))

        cursor.execute("SELECT oid FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE oid = %s", (oid,))
        exists = cursor.fetchone()

        if exists:
            sql = """
                UPDATE FIELD_OFFICER_DAY_VISIT_REPORTS SET
                    report_id = %s, unit = %s, client_id = %s, site_id = %s, visit_date = %s,
                    visit_type = %s, officer = %s, shift = %s, `check-in_time` = %s, `check-out_time` = %s,
                    gps = %s, photos = %s, guards = %s, checklist = %s, observations = %s,
                    suggestions = %s, attachments = %s, status = %s, created_on = COALESCE(created_on, %s),
                    lecture_details = %s, random_checking = %s, overall_remarks = %s, employee_oid = %s
                WHERE oid = %s
            """
            query_params = (
                report_id,
                unit,
                client_id,
                site_id,
                visit_date,
                visit_type,
                emp_name,
                shift,
                start_time,
                end_time,
                gps,
                serialize_field(photos),
                serialize_field(guards),
                serialize_field(checklist),
                serialize_field(observations),
                suggestions,
                serialize_field(attachments),
                status,
                created_on,
                lecture_details,
                random_checking,
                overall_remarks,
                emp_oid,
                oid
            )
            cursor.execute(sql, query_params)
        else:
            sql = """
                INSERT INTO FIELD_OFFICER_DAY_VISIT_REPORTS (
                    report_id, unit, client_id, site_id, visit_date,
                    visit_type, officer, shift, `check-in_time`, `check-out_time`,
                    gps, photos, guards, checklist, observations,
                    suggestions, attachments, status, created_on,
                    lecture_details, random_checking, overall_remarks, employee_oid, oid
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            query_params = (
                report_id,
                unit,
                client_id,
                site_id,
                visit_date,
                visit_type,
                emp_name,
                shift,
                start_time,
                end_time,
                gps,
                serialize_field(photos),
                serialize_field(guards),
                serialize_field(checklist),
                serialize_field(observations),
                suggestions,
                serialize_field(attachments),
                status,
                created_on,
                lecture_details,
                random_checking,
                overall_remarks,
                emp_oid,
                oid
            )
            cursor.execute(sql, query_params)

            # Insert or update into VISIT_REPORT_METADATA
            metadata_sql = """
                INSERT INTO VISIT_REPORT_METADATA (
                    employee_oid, officer, report_type, report_oid, site_id, visit_date
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE site_id = VALUES(site_id), visit_date = VALUES(visit_date)
            """
            metadata_params = (
                emp_oid,
                emp_name,
                "DAY",
                oid,
                site_id,
                visit_date
            )
            cursor.execute(metadata_sql, metadata_params)
        
        conn.commit()
        return {"success": True, "message": "Report saved successfully", "id": oid, "report_id": report_id}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@router.delete("/officer-visits/reports/{id}")
def delete_visit_report(id: str):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("DELETE FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE oid = %s", (id,))
        conn.commit()
        return {"success": True, "message": "Report deleted successfully"}
    finally:
        cursor.close()
        conn.close()


# --- OFFICER ROUND TEMPLATES ---

@router.get("/officer-rounds/templates")
def get_round_templates():
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM FIELD_OFFICER_NIGHT_VISIT_TEMPLATES")
        rows = cursor.fetchall()
        for r in rows:
            r["id"] = r["oid"]
            r["sections"] = deserialize_field(r["sections"]) or []
            r["questions"] = deserialize_field(r["questions"]) or []
        
        # If DB has no templates, return a seed default template
        if not rows:
            default_template = {
                "id": "temp-default",
                "name": "Officer Night Round Template",
                "sections": ["Guards & Patrol", "Perimeter & Access Control", "Facility & Safety Security"],
                "questions": [
                    {"id": "q1", "section": "Guards & Patrol", "question": "Security guards alert and in proper uniform?", "answerType": "yes_no", "required": True, "photoRequired": False},
                    {"id": "q2", "section": "Guards & Patrol", "question": "Patrol tracking system being updated properly?", "answerType": "yes_no", "required": True, "photoRequired": False},
                    {"id": "q3", "section": "Perimeter & Access Control", "question": "All gates and access points secured?", "answerType": "yes_no", "required": True, "photoRequired": False}
                ]
            }
            return [default_template]
        return rows
    finally:
        cursor.close()
        conn.close()

@router.post("/officer-rounds/templates")
def save_round_template(payload: Dict[str, Any]):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        oid = payload.get("id")
        cursor.execute("SELECT oid FROM FIELD_OFFICER_NIGHT_VISIT_TEMPLATES WHERE oid = %s", (oid,))
        exists = cursor.fetchone()

        query_params = (
            payload.get("name"),
            serialize_field(payload.get("sections")),
            serialize_field(payload.get("questions")),
            oid
        )

        if exists:
            sql = "UPDATE FIELD_OFFICER_NIGHT_VISIT_TEMPLATES SET name = %s, sections = %s, questions = %s WHERE oid = %s"
            cursor.execute(sql, query_params)
        else:
            sql = "INSERT INTO FIELD_OFFICER_NIGHT_VISIT_TEMPLATES (name, sections, questions, oid) VALUES (%s, %s, %s, %s)"
            cursor.execute(sql, query_params)
        conn.commit()
        return {"success": True, "message": "Template saved successfully"}
    finally:
        cursor.close()
        conn.close()

@router.delete("/officer-rounds/templates/{id}")
def delete_round_template(id: str):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("DELETE FROM FIELD_OFFICER_NIGHT_VISIT_TEMPLATES WHERE oid = %s", (id,))
        conn.commit()
        return {"success": True, "message": "Template deleted successfully"}
    finally:
        cursor.close()
        conn.close()


# --- OFFICER VISIT TEMPLATES ---

@router.get("/officer-visits/templates")
def get_visit_templates():
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM FIELD_OFFICER_DAY_VISIT_TEMPLATES")
        rows = cursor.fetchall()
        for r in rows:
            r["id"] = r["oid"]
            r["sections"] = deserialize_field(r["sections"]) or []
            r["questions"] = deserialize_field(r["questions"]) or []
        return rows
    finally:
        cursor.close()
        conn.close()

@router.post("/officer-visits/templates")
def save_visit_template(payload: Dict[str, Any]):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        oid = payload.get("id")
        cursor.execute("SELECT oid FROM FIELD_OFFICER_DAY_VISIT_TEMPLATES WHERE oid = %s", (oid,))
        exists = cursor.fetchone()

        query_params = (
            payload.get("name"),
            serialize_field(payload.get("sections")),
            serialize_field(payload.get("questions")),
            oid
        )

        if exists:
            sql = "UPDATE FIELD_OFFICER_DAY_VISIT_TEMPLATES SET name = %s, sections = %s, questions = %s WHERE oid = %s"
            cursor.execute(sql, query_params)
        else:
            sql = "INSERT INTO FIELD_OFFICER_DAY_VISIT_TEMPLATES (name, sections, questions, oid) VALUES (%s, %s, %s, %s)"
            cursor.execute(sql, query_params)
        conn.commit()
        return {"success": True, "message": "Template saved successfully"}
    finally:
        cursor.close()
        conn.close()

@router.delete("/officer-visits/templates/{id}")
def delete_visit_template(id: str):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("DELETE FROM FIELD_OFFICER_DAY_VISIT_TEMPLATES WHERE oid = %s", (id,))
        conn.commit()
        return {"success": True, "message": "Template deleted successfully"}
    finally:
        cursor.close()
        conn.close()


# --- GENERAL VISITS ---

def init_general_visits_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS FIELD_OFFICER_GENERAL_VISIT_REPORTS (
            oid VARCHAR(255) PRIMARY KEY,
            report_id VARCHAR(255),
            client_id INT,
            client_name VARCHAR(255),
            site_id INT,
            site_name VARCHAR(255),
            person_visited TEXT,
            reason_of_visit TEXT,
            visit_date VARCHAR(50),
            remark TEXT,
            `check-in_time` VARCHAR(50),
            `check-out_time` VARCHAR(50),
            created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # To handle existing table without these columns, alter them safely:
    try:
        cursor.execute("ALTER TABLE FIELD_OFFICER_GENERAL_VISIT_REPORTS ADD COLUMN report_id VARCHAR(255)")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE FIELD_OFFICER_GENERAL_VISIT_REPORTS ADD COLUMN visit_date VARCHAR(50)")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE FIELD_OFFICER_GENERAL_VISIT_REPORTS ADD COLUMN remark TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE FIELD_OFFICER_GENERAL_VISIT_REPORTS ADD COLUMN `check-in_time` VARCHAR(50)")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE FIELD_OFFICER_GENERAL_VISIT_REPORTS ADD COLUMN `check-out_time` VARCHAR(50)")
    except Exception:
        pass

@router.get("/general-visits")
def get_general_visits(emp_oid: Optional[str] = Query(None), empOid: Optional[str] = Query(None)):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        init_general_visits_table(cursor)
        query = """
            SELECT r.*, s.name as site_name, cl.name as client_name, s.BRANCH as branch_id,
                   CASE WHEN COALESCE(b_off.email_access, b_site.email_access, 1) = 1 AND COALESCE(b_site.email_access, 1) = 1 THEN 1 ELSE 0 END as email_access
            FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS r
            LEFT JOIN SITE s ON r.site_id = s.oid
            LEFT JOIN CLIENTT cl ON (r.client_id = cl.oid OR s.CLIENTT = cl.oid)
            LEFT JOIN EMPLOYEE e ON (r.employee_oid = e.oid OR r.employee_oid = e.emp_code)
            LEFT JOIN BRANCH b_site ON s.BRANCH = b_site.oid
            LEFT JOIN BRANCH b_off ON e.BRANCH = b_off.oid
        """
        params = []
        target_emp = emp_oid or empOid
        if target_emp:
            query += """ WHERE (
                r.employee_oid = %s OR r.employee_oid = (SELECT emp_code FROM EMPLOYEE WHERE oid = %s LIMIT 1)
                OR r.officer = (SELECT name FROM EMPLOYEE WHERE oid = %s OR emp_code = %s LIMIT 1)
            ) """
            params.extend([target_emp, target_emp, target_emp, target_emp])
        query += " ORDER BY r.created_on DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        for r in rows:
            r["id"] = r["oid"]
            r["reportId"] = r.get("report_id")
            r["clientId"] = r.get("client_id")
            r["clientName"] = r.get("client_name") or r.get("clientName")
            r["siteId"] = r.get("site_id")
            r["siteName"] = r.get("site_name") or r.get("siteName")
            r["personVisited"] = r.get("person_visited")
            r["reasonOfVisit"] = r.get("reason_of_visit")
            r["visitDate"] = r.get("visit_date")
            r["remark"] = r.get("remark")
            r["startTime"] = r.get("check-in_time")
            r["endTime"] = r.get("check-out_time")
            r["branchId"] = r.get("branch_id")
            r["emailAccess"] = 1 if r.get("email_access") in (1, "1", True) else 0
            r["email_access"] = r["emailAccess"]
            r["createdOn"] = r.get("created_on").strftime("%Y-%m-%d %H:%M:%S") if r.get("created_on") and hasattr(r.get("created_on"), "strftime") else str(r.get("created_on") or "")
        return rows
    finally:
        cursor.close()
        conn.close()

@router.post("/general-visits")
def save_general_visit(payload: Dict[str, Any], authorization: Optional[str] = Header(None)):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        emp = get_authenticated_employee(authorization)
        emp_oid = emp.get("id")
        emp_name = emp.get("name")

        init_general_visits_table(cursor)
        if not payload.get("id") and not payload.get("oid"):
            cursor.execute("SELECT oid FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE oid REGEXP '^[0-9]+$' ORDER BY CAST(oid AS UNSIGNED) DESC LIMIT 1")
            max_r = cursor.fetchone()
            next_num = (int(max_r["oid"]) + 1) if max_r and max_r.get("oid") else 108
            oid = str(next_num)
        else:
            oid = str(payload.get("id") or payload.get("oid"))

        site_id = payload.get("siteId") or payload.get("site_id")
        client_id = payload.get("clientId") or payload.get("client_id")
        site_name = payload.get("siteName") or payload.get("site_name")
        client_name = payload.get("clientName") or payload.get("client_name")

        if not site_name and site_id:
            cursor.execute("SELECT name, CLIENTT FROM SITE WHERE oid = %s", (site_id,))
            s_row = cursor.fetchone()
            if s_row:
                site_name = s_row["name"]
                if not client_id and s_row.get("CLIENTT"):
                    client_id = s_row["CLIENTT"]

        if not client_name and client_id:
            cursor.execute("SELECT name FROM CLIENTT WHERE oid = %s", (client_id,))
            c_row = cursor.fetchone()
            if c_row:
                client_name = c_row["name"]

        if not payload.get("reportId") and not payload.get("report_id"):
            v_date_raw = str(payload.get("visitDate") or payload.get("visit_date") or date.today().isoformat())
            try:
                dt = datetime.strptime(v_date_raw, "%Y-%m-%d")
                date_fmt = dt.strftime("%d/%m/%y")
            except Exception:
                date_fmt = datetime.now().strftime("%d/%m/%y")

            c_str = client_name or "Client"
            s_str = site_name or "Site"
            report_id = f"01-{c_str}-{s_str}-OGV-{date_fmt}"
        else:
            report_id = str(payload.get("reportId") or payload.get("report_id"))

        # Ensure gps column exists in FIELD_OFFICER_GENERAL_VISIT_REPORTS
        try:
            cursor.execute("SHOW COLUMNS FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS LIKE 'gps'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE FIELD_OFFICER_GENERAL_VISIT_REPORTS ADD COLUMN gps VARCHAR(255) NULL")
        except Exception:
            pass

        gps_val = payload.get("gps") or ""

        cursor.execute("SELECT oid FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE oid = %s", (oid,))
        exists = cursor.fetchone()
        
        if exists:
            sql = """
                UPDATE FIELD_OFFICER_GENERAL_VISIT_REPORTS SET
                    report_id = %s, client_id = %s, client_name = %s, site_id = %s, site_name = %s,
                    person_visited = %s, reason_of_visit = %s, visit_date = %s,
                    remark = %s, `check-in_time` = %s, `check-out_time` = %s, gps = %s, employee_oid = %s, officer = %s
                WHERE oid = %s
            """
            query_params = (
                report_id,
                client_id,
                client_name,
                site_id,
                site_name,
                payload.get("personVisited") or payload.get("person_visited"),
                payload.get("reasonOfVisit") or payload.get("reason_of_visit"),
                payload.get("visitDate") or payload.get("visit_date"),
                payload.get("remark"),
                payload.get("startTime") or payload.get("start_time"),
                payload.get("endTime") or payload.get("end_time"),
                gps_val,
                emp_oid,
                emp_name,
                oid
            )
            cursor.execute(sql, query_params)
        else:
            sql = """
                INSERT INTO FIELD_OFFICER_GENERAL_VISIT_REPORTS (
                    report_id, client_id, client_name, site_id, site_name,
                    person_visited, reason_of_visit, visit_date,
                    remark, `check-in_time`, `check-out_time`, gps, employee_oid, officer, oid
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            query_params = (
                report_id,
                client_id,
                client_name,
                site_id,
                site_name,
                payload.get("personVisited") or payload.get("person_visited"),
                payload.get("reasonOfVisit") or payload.get("reason_of_visit"),
                payload.get("visitDate") or payload.get("visit_date"),
                payload.get("remark"),
                payload.get("startTime") or payload.get("start_time"),
                payload.get("endTime") or payload.get("end_time"),
                gps_val,
                emp_oid,
                emp_name,
                oid
            )
            cursor.execute(sql, query_params)

            # Insert into VISIT_REPORT_METADATA
            metadata_sql = """
                INSERT INTO VISIT_REPORT_METADATA (
                    employee_oid, officer, report_type, report_oid, site_id, visit_date
                ) VALUES (%s, %s, %s, %s, %s, %s)
            """
            metadata_params = (
                emp_oid,
                emp_name,
                "GENERAL",
                oid,
                payload.get("siteId") or payload.get("site_id"),
                payload.get("visitDate") or payload.get("visit_date")
            )
            cursor.execute(metadata_sql, metadata_params)
        
        conn.commit()
        return {"success": True, "message": "General Visit saved successfully"}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise e
    finally:
        cursor.close()
        conn.close()

@router.delete("/general-visits/{id}")
def delete_general_visit(id: str):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("DELETE FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE oid = %s", (id,))
        conn.commit()
        return {"success": True, "message": "General Visit deleted successfully"}
    finally:
        cursor.close()
        conn.close()

@router.post("/officer-visits/send-email")
def send_report_email(payload: dict):
    email = payload.get("email")
    subject = payload.get("subject")
    message = payload.get("message")
    branch_id = payload.get("branchId") or payload.get("branch_id")
    site_id = payload.get("siteId") or payload.get("site_id")
    emp_oid = payload.get("empOid") or payload.get("officerId") or payload.get("employee_oid")

    if not email:
        raise HTTPException(status_code=400, detail="Recipient email is required")

    # Validate branch email_access in DB (checking both site branch and officer branch)
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            
            # 1. Check officer's assigned branch email_access
            if emp_oid:
                cursor.execute("""
                    SELECT b.email_access 
                    FROM EMPLOYEE e 
                    JOIN BRANCH b ON e.BRANCH = b.oid 
                    WHERE e.oid = %s OR e.emp_code = %s
                """, (emp_oid, emp_oid))
                emp_res = cursor.fetchone()
                if emp_res and emp_res.get("email_access") in (0, "0", False):
                    cursor.close()
                    conn.close()
                    raise HTTPException(status_code=403, detail="Email sending is disabled for officer's assigned branch (email_access = 0).")

            # 2. Check site's branch email_access
            if site_id:
                cursor.execute("""
                    SELECT b.email_access 
                    FROM SITE s 
                    JOIN BRANCH b ON s.BRANCH = b.oid 
                    WHERE s.oid = %s
                """, (site_id,))
                res = cursor.fetchone()
                if res and res.get("email_access") in (0, "0", False):
                    cursor.close()
                    conn.close()
                    raise HTTPException(status_code=403, detail="Email sending is disabled for this site's branch (email_access = 0).")

            # 3. Check explicit branch_id if provided
            if branch_id:
                cursor.execute("SELECT email_access FROM BRANCH WHERE oid = %s", (branch_id,))
                res = cursor.fetchone()
                if res and res.get("email_access") in (0, "0", False):
                    cursor.close()
                    conn.close()
                    raise HTTPException(status_code=403, detail="Email sending is disabled for this branch (email_access = 0).")
            
            cursor.close()
            conn.close()
        except HTTPException as he:
            raise he
        except Exception as e:
            if conn:
                conn.close()
            print("DB Check Error in send_report_email:", e)

    print(f"Sending email to {email} with subject: {subject}")
    return {"success": True, "message": f"Email sent successfully to {email}"}

@router.get("/officer-visits/client-representatives/{client_id}")
def get_client_representatives(client_id: int):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT cr.oid, cr.name, COALESCE(cr.email, ua.email) AS email, cr.designation
            FROM CLIENT_REPRESENTETOR cr
            LEFT JOIN USER_ACCOUNT ua ON cr.USER_ACCOUNT = ua.oid
            WHERE cr.CLIENTT = %s
        """
        cursor.execute(query, (client_id,))
        reps = cursor.fetchall()
        return reps
    finally:
        cursor.close()
        conn.close()

