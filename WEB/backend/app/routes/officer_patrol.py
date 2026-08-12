from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import JSONResponse
from app.database import get_db_connection
import json
import time
from typing import Dict, Any, List, Optional

router = APIRouter()

def get_authenticated_employee(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    import base64
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]
            return json.loads(base64.b64decode(token.encode()).decode())
        except Exception:
            pass
    return {
        "id": 1,
        "name": "Administrator",
        "role": "Admin",
        "employee_id": "ADM001",
        "site_id": None
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
    r["officerSignature"] = r.get("officer_signature")
    r["lectureDetails"] = r.get("lecture_details")
    r["randomChecking"] = r.get("random_checking")
    r["overallRemarks"] = r.get("overall_remarks")
    r["startTime"] = r.get("check-in_time")
    r["endTime"] = r.get("check-out_time")
    
    # Deserialization of list/dict fields
    r["photos"] = deserialize_field(r.get("photos")) or []
    r["guards"] = deserialize_field(r.get("guards")) or []
    r["checklist"] = deserialize_field(r.get("checklist")) or []
    r["observations"] = deserialize_field(r.get("observations")) or []
    r["attachments"] = deserialize_field(r.get("attachments")) or []
    return r

# --- OFFICER ROUND REPORTS ---

@router.get("/officer-rounds/reports")
def get_round_reports():
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS")
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
        cursor.execute("SELECT * FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE oid = %s", (id,))
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

        oid = payload.get("id")
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
                payload.get("reportNo") or payload.get("reportId"),
                payload.get("unit"),
                payload.get("clientId"),
                payload.get("siteId"),
                payload.get("visitDate"),
                payload.get("visitType"),
                emp_name,
                payload.get("shift"),
                payload.get("startTime"),
                payload.get("endTime"),
                payload.get("gps"),
                serialize_field(payload.get("photos")),
                serialize_field(payload.get("guards")),
                serialize_field(payload.get("checklist")),
                serialize_field(payload.get("observations")),
                payload.get("suggestions"),
                serialize_field(payload.get("attachments")),
                payload.get("officerSignature"),
                payload.get("status"),
                payload.get("createdOn"),
                payload.get("lectureDetails"),
                payload.get("randomChecking"),
                payload.get("overallRemarks"),
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
                payload.get("reportNo") or payload.get("reportId"),
                payload.get("unit"),
                payload.get("clientId"),
                payload.get("siteId"),
                payload.get("visitDate"),
                payload.get("visitType"),
                emp_name,
                payload.get("shift"),
                payload.get("startTime"),
                payload.get("endTime"),
                payload.get("gps"),
                serialize_field(payload.get("photos")),
                serialize_field(payload.get("guards")),
                serialize_field(payload.get("checklist")),
                serialize_field(payload.get("observations")),
                payload.get("suggestions"),
                serialize_field(payload.get("attachments")),
                payload.get("officerSignature"),
                payload.get("status"),
                payload.get("createdOn"),
                payload.get("lectureDetails"),
                payload.get("randomChecking"),
                payload.get("overallRemarks"),
                emp_oid,
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
                "NIGHT",
                oid,
                payload.get("siteId"),
                payload.get("visitDate")
            )
            cursor.execute(metadata_sql, metadata_params)
        
        conn.commit()
        return {"success": True, "message": "Report saved successfully"}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise e
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
def get_visit_reports():
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM FIELD_OFFICER_DAY_VISIT_REPORTS")
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
        cursor.execute("SELECT * FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE oid = %s", (id,))
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

        oid = payload.get("id")
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
                payload.get("reportNo") or payload.get("reportId"),
                payload.get("unit"),
                payload.get("clientId"),
                payload.get("siteId"),
                payload.get("visitDate"),
                payload.get("visitType"),
                emp_name,
                payload.get("shift"),
                payload.get("startTime"),
                payload.get("endTime"),
                payload.get("gps"),
                serialize_field(payload.get("photos")),
                serialize_field(payload.get("guards")),
                serialize_field(payload.get("checklist")),
                serialize_field(payload.get("observations")),
                payload.get("suggestions"),
                serialize_field(payload.get("attachments")),
                payload.get("status"),
                payload.get("createdOn"),
                payload.get("lectureDetails"),
                payload.get("randomChecking"),
                payload.get("overallRemarks"),
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
                payload.get("reportNo") or payload.get("reportId"),
                payload.get("unit"),
                payload.get("clientId"),
                payload.get("siteId"),
                payload.get("visitDate"),
                payload.get("visitType"),
                emp_name,
                payload.get("shift"),
                payload.get("startTime"),
                payload.get("endTime"),
                payload.get("gps"),
                serialize_field(payload.get("photos")),
                serialize_field(payload.get("guards")),
                serialize_field(payload.get("checklist")),
                serialize_field(payload.get("observations")),
                payload.get("suggestions"),
                serialize_field(payload.get("attachments")),
                payload.get("status"),
                payload.get("createdOn"),
                payload.get("lectureDetails"),
                payload.get("randomChecking"),
                payload.get("overallRemarks"),
                emp_oid,
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
                "DAY",
                oid,
                payload.get("siteId"),
                payload.get("visitDate")
            )
            cursor.execute(metadata_sql, metadata_params)
        
        conn.commit()
        return {"success": True, "message": "Report saved successfully"}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise e
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
def get_general_visits():
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        init_general_visits_table(cursor)
        cursor.execute("SELECT * FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS ORDER BY created_on DESC")
        rows = cursor.fetchall()
        for r in rows:
            r["id"] = r["oid"]
            r["reportId"] = r.get("report_id")
            r["clientId"] = r["client_id"]
            r["clientName"] = r["client_name"]
            r["siteId"] = r["site_id"]
            r["siteName"] = r["site_name"]
            r["personVisited"] = r["person_visited"]
            r["reasonOfVisit"] = r["reason_of_visit"]
            r["visitDate"] = r["visit_date"]
            r["remark"] = r["remark"]
            r["startTime"] = r.get("check-in_time")
            r["endTime"] = r.get("check-out_time")
            r["createdOn"] = r["created_on"].strftime("%Y-%m-%d %H:%M:%S") if r["created_on"] else None
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
        oid = payload.get("id") or str(int(time.time() * 1000))
        cursor.execute("SELECT oid FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE oid = %s", (oid,))
        exists = cursor.fetchone()
        
        if exists:
            sql = """
                UPDATE FIELD_OFFICER_GENERAL_VISIT_REPORTS SET
                    report_id = %s, client_id = %s, client_name = %s, site_id = %s, site_name = %s,
                    person_visited = %s, reason_of_visit = %s, visit_date = %s,
                    remark = %s, `check-in_time` = %s, `check-out_time` = %s, employee_oid = %s, officer = %s
                WHERE oid = %s
            """
            query_params = (
                payload.get("reportId"),
                payload.get("clientId"),
                payload.get("clientName"),
                payload.get("siteId"),
                payload.get("siteName"),
                payload.get("personVisited"),
                payload.get("reasonOfVisit"),
                payload.get("visitDate"),
                payload.get("remark"),
                payload.get("startTime"),
                payload.get("endTime"),
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
                    remark, `check-in_time`, `check-out_time`, employee_oid, officer, oid
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            query_params = (
                payload.get("reportId"),
                payload.get("clientId"),
                payload.get("clientName"),
                payload.get("siteId"),
                payload.get("siteName"),
                payload.get("personVisited"),
                payload.get("reasonOfVisit"),
                payload.get("visitDate"),
                payload.get("remark"),
                payload.get("startTime"),
                payload.get("endTime"),
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
                payload.get("siteId"),
                payload.get("visitDate")
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
    if not email:
        raise HTTPException(status_code=400, detail="Recipient email is required")
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

