from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from app.database import get_db_connection
import json
from typing import Dict, Any, List

router = APIRouter()

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
    r["reportNo"] = r.get("report_no")
    r["visitDate"] = r.get("visit_date")
    r["visitType"] = r.get("visit_type")
    r["createdOn"] = r.get("created_on")
    r["clientId"] = r.get("client_id")
    r["siteId"] = r.get("site_id")
    r["officerSignature"] = r.get("officer_signature")
    r["lectureDetails"] = r.get("lecture_details")
    r["randomChecking"] = r.get("random_checking")
    r["overallRemarks"] = r.get("overall_remarks")
    
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
        cursor.execute("SELECT * FROM PATROL_OFFICER_NIGHT_ROUND_REPORTS")
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
        cursor.execute("SELECT * FROM PATROL_OFFICER_NIGHT_ROUND_REPORTS WHERE oid = %s", (id,))
        r = cursor.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Report not found")
        return map_db_row_to_frontend(r)
    finally:
        cursor.close()
        conn.close()

@router.post("/officer-rounds/reports")
def save_round_report(payload: Dict[str, Any]):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        oid = payload.get("id")
        # Check if exists
        cursor.execute("SELECT oid FROM PATROL_OFFICER_NIGHT_ROUND_REPORTS WHERE oid = %s", (oid,))
        exists = cursor.fetchone()

        query_params = (
            payload.get("reportNo"),
            payload.get("unit"),
            payload.get("clientId"),
            payload.get("siteId"),
            payload.get("visitDate"),
            payload.get("visitType"),
            payload.get("officer"),
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
            oid
        )

        if exists:
            sql = """
                UPDATE PATROL_OFFICER_NIGHT_ROUND_REPORTS SET
                    report_no = %s, unit = %s, client_id = %s, site_id = %s, visit_date = %s,
                    visit_type = %s, officer = %s, shift = %s, start_time = %s, end_time = %s,
                    gps = %s, photos = %s, guards = %s, checklist = %s, observations = %s,
                    suggestions = %s, attachments = %s, officer_signature = %s, status = %s,
                    created_on = COALESCE(created_on, %s), lecture_details = %s, random_checking = %s,
                    overall_remarks = %s
                WHERE oid = %s
            """
            # Extract createdOn value to pass, or omit to preserve
            query_params = (
                payload.get("reportNo"),
                payload.get("unit"),
                payload.get("clientId"),
                payload.get("siteId"),
                payload.get("visitDate"),
                payload.get("visitType"),
                payload.get("officer"),
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
                oid
            )
            cursor.execute(sql, query_params)
        else:
            sql = """
                INSERT INTO PATROL_OFFICER_NIGHT_ROUND_REPORTS (
                    report_no, unit, client_id, site_id, visit_date,
                    visit_type, officer, shift, start_time, end_time,
                    gps, photos, guards, checklist, observations,
                    suggestions, attachments, officer_signature, status,
                    created_on, lecture_details, random_checking, overall_remarks, oid
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, query_params)
        
        conn.commit()
        return {"success": True, "message": "Report saved successfully"}
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
        cursor.execute("DELETE FROM PATROL_OFFICER_NIGHT_ROUND_REPORTS WHERE oid = %s", (id,))
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
        cursor.execute("SELECT * FROM PATROL_OFFICER_VISIT_REPORTS")
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
        cursor.execute("SELECT * FROM PATROL_OFFICER_VISIT_REPORTS WHERE oid = %s", (id,))
        r = cursor.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Report not found")
        return map_db_row_to_frontend(r)
    finally:
        cursor.close()
        conn.close()

@router.post("/officer-visits/reports")
def save_visit_report(payload: Dict[str, Any]):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        oid = payload.get("id")
        cursor.execute("SELECT oid FROM PATROL_OFFICER_VISIT_REPORTS WHERE oid = %s", (oid,))
        exists = cursor.fetchone()

        query_params = (
            payload.get("reportNo"),
            payload.get("unit"),
            payload.get("clientId"),
            payload.get("siteId"),
            payload.get("visitDate"),
            payload.get("visitType"),
            payload.get("officer"),
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
            oid
        )

        if exists:
            sql = """
                UPDATE PATROL_OFFICER_VISIT_REPORTS SET
                    report_no = %s, unit = %s, client_id = %s, site_id = %s, visit_date = %s,
                    visit_type = %s, officer = %s, shift = %s, start_time = %s, end_time = %s,
                    gps = %s, photos = %s, guards = %s, checklist = %s, observations = %s,
                    suggestions = %s, attachments = %s, status = %s, created_on = COALESCE(created_on, %s),
                    lecture_details = %s, random_checking = %s, overall_remarks = %s
                WHERE oid = %s
            """
            cursor.execute(sql, query_params)
        else:
            sql = """
                INSERT INTO PATROL_OFFICER_VISIT_REPORTS (
                    report_no, unit, client_id, site_id, visit_date,
                    visit_type, officer, shift, start_time, end_time,
                    gps, photos, guards, checklist, observations,
                    suggestions, attachments, status, created_on,
                    lecture_details, random_checking, overall_remarks, oid
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, query_params)
        
        conn.commit()
        return {"success": True, "message": "Report saved successfully"}
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
        cursor.execute("DELETE FROM PATROL_OFFICER_VISIT_REPORTS WHERE oid = %s", (id,))
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
        cursor.execute("SELECT * FROM PATROL_OFFICER_NIGHT_ROUND_TEMPLATES")
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
        cursor.execute("SELECT oid FROM PATROL_OFFICER_NIGHT_ROUND_TEMPLATES WHERE oid = %s", (oid,))
        exists = cursor.fetchone()

        query_params = (
            payload.get("name"),
            serialize_field(payload.get("sections")),
            serialize_field(payload.get("questions")),
            oid
        )

        if exists:
            sql = "UPDATE PATROL_OFFICER_NIGHT_ROUND_TEMPLATES SET name = %s, sections = %s, questions = %s WHERE oid = %s"
            cursor.execute(sql, query_params)
        else:
            sql = "INSERT INTO PATROL_OFFICER_NIGHT_ROUND_TEMPLATES (name, sections, questions, oid) VALUES (%s, %s, %s, %s)"
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
        cursor.execute("DELETE FROM PATROL_OFFICER_NIGHT_ROUND_TEMPLATES WHERE oid = %s", (id,))
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
        cursor.execute("SELECT * FROM PATROL_OFFICER_VISIT_TEMPLATES")
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
        cursor.execute("SELECT oid FROM PATROL_OFFICER_VISIT_TEMPLATES WHERE oid = %s", (oid,))
        exists = cursor.fetchone()

        query_params = (
            payload.get("name"),
            serialize_field(payload.get("sections")),
            serialize_field(payload.get("questions")),
            oid
        )

        if exists:
            sql = "UPDATE PATROL_OFFICER_VISIT_TEMPLATES SET name = %s, sections = %s, questions = %s WHERE oid = %s"
            cursor.execute(sql, query_params)
        else:
            sql = "INSERT INTO PATROL_OFFICER_VISIT_TEMPLATES (name, sections, questions, oid) VALUES (%s, %s, %s, %s)"
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
        cursor.execute("DELETE FROM PATROL_OFFICER_VISIT_TEMPLATES WHERE oid = %s", (id,))
        conn.commit()
        return {"success": True, "message": "Template deleted successfully"}
    finally:
        cursor.close()
        conn.close()


# --- GENERAL VISITS ---

def init_general_visits_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS PATROL_OFFICER_GENERAL_VISITS (
            oid VARCHAR(255) PRIMARY KEY,
            client_id INT,
            client_name VARCHAR(255),
            site_id INT,
            site_name VARCHAR(255),
            person_visited TEXT,
            reason_of_visit TEXT,
            visit_date VARCHAR(50),
            remark TEXT,
            start_time VARCHAR(50),
            end_time VARCHAR(50),
            created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # To handle existing table without these columns, alter them safely:
    try:
        cursor.execute("ALTER TABLE PATROL_OFFICER_GENERAL_VISITS ADD COLUMN visit_date VARCHAR(50)")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE PATROL_OFFICER_GENERAL_VISITS ADD COLUMN remark TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE PATROL_OFFICER_GENERAL_VISITS ADD COLUMN start_time VARCHAR(50)")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE PATROL_OFFICER_GENERAL_VISITS ADD COLUMN end_time VARCHAR(50)")
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
        cursor.execute("SELECT * FROM PATROL_OFFICER_GENERAL_VISITS ORDER BY created_on DESC")
        rows = cursor.fetchall()
        for r in rows:
            r["id"] = r["oid"]
            r["clientId"] = r["client_id"]
            r["clientName"] = r["client_name"]
            r["siteId"] = r["site_id"]
            r["siteName"] = r["site_name"]
            r["personVisited"] = r["person_visited"]
            r["reasonOfVisit"] = r["reason_of_visit"]
            r["visitDate"] = r["visit_date"]
            r["remark"] = r["remark"]
            r["startTime"] = r["start_time"]
            r["endTime"] = r["end_time"]
            r["createdOn"] = r["created_on"].strftime("%Y-%m-%d %H:%M:%S") if r["created_on"] else None
        return rows
    finally:
        cursor.close()
        conn.close()

@router.post("/general-visits")
def save_general_visit(payload: Dict[str, Any]):
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = conn.cursor(dictionary=True)
    try:
        init_general_visits_table(cursor)
        oid = payload.get("id") or f"gv-{int(payload.get('created_on', 0) or 0) or Date.now()}"
        cursor.execute("SELECT oid FROM PATROL_OFFICER_GENERAL_VISITS WHERE oid = %s", (oid,))
        exists = cursor.fetchone()
        
        query_params = (
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
            oid
        )
        
        if exists:
            sql = """
                UPDATE PATROL_OFFICER_GENERAL_VISITS SET
                    client_id = %s, client_name = %s, site_id = %s, site_name = %s,
                    person_visited = %s, reason_of_visit = %s, visit_date = %s,
                    remark = %s, start_time = %s, end_time = %s
                WHERE oid = %s
            """
            cursor.execute(sql, query_params)
        else:
            sql = """
                INSERT INTO PATROL_OFFICER_GENERAL_VISITS (
                    client_id, client_name, site_id, site_name,
                    person_visited, reason_of_visit, visit_date,
                    remark, start_time, end_time, oid
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, query_params)
        
        conn.commit()
        return {"success": True, "message": "General Visit saved successfully"}
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
        cursor.execute("DELETE FROM PATROL_OFFICER_GENERAL_VISITS WHERE oid = %s", (id,))
        conn.commit()
        return {"success": True, "message": "General Visit deleted successfully"}
    finally:
        cursor.close()
        conn.close()

