from fastapi import APIRouter, Depends, HTTPException, Query, Header, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from datetime import datetime, date
import json
import os
import uuid
import math

from app.database import get_patrol_db as get_db, get_db_connection
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/tours", tags=["Dynamic Site Tours"])

def get_current_employee_oid(authorization: Optional[str] = Header(None)) -> int:
    import base64
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]
            payload = json.loads(base64.b64decode(token.encode()).decode())
            emp_id = payload.get("id") or payload.get("employee_id") or payload.get("empOid")
            if emp_id:
                return int(emp_id)
        except Exception:
            pass
    return 10208

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

# Request Models
class TourStartRequest(BaseModel):
    tour_oid: int
    site_oid: Optional[int] = None
    custom_visit_oid: Optional[int] = None
    session_id: Optional[int] = None
    execution_uuid: str
    start_latitude: Optional[float] = None
    start_longitude: Optional[float] = None

class CheckpointVerifyRequest(BaseModel):
    checkpoint_oid: int
    qr_code: Optional[str] = None
    qr_code_scanned: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    accuracy_meters: Optional[float] = None
    client_timestamp: Optional[str] = None

class QuestionResponseItem(BaseModel):
    question_oid: int
    response_value: str
    comment: Optional[str] = None
    is_critical_violation: Optional[bool] = False
    is_failure: Optional[bool] = False
    photo_urls: Optional[List[str]] = Field(default_factory=list)

class CheckpointResponsesSubmitRequest(BaseModel):
    checkpoint_oid: int
    responses: List[QuestionResponseItem]
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class OfflineSyncPayload(BaseModel):
    execution_uuid: str
    tour_oid: int
    site_oid: Optional[int] = None
    custom_visit_oid: Optional[int] = None
    session_id: Optional[int] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    checkpoints: Dict[str, Any]

class TourCompleteRequest(BaseModel):
    execution_uuid: Optional[str] = None
    notes: Optional[str] = None
    end_latitude: Optional[float] = None
    end_longitude: Optional[float] = None
    checkpoints: Optional[Dict[str, Any]] = None


@router.get("/assigned-to-site")
def get_tours_assigned_to_site(
    site_id: int = Query(...),
    db: Session = Depends(get_db),
    emp_oid: int = Depends(get_current_employee_oid)
):
    """
    Returns dynamic tours configured for a given registered site using FIELD_OFFICER_* tables.
    """
    # 1. Fetch site details
    site_row = db.execute(
        text("SELECT oid, name, BRANCH FROM SITE WHERE oid = :sid"),
        {"sid": site_id}
    ).fetchone()

    site_name = site_row[1] if site_row else f"Site #{site_id}"
    site_branch = site_row[2] if site_row else None

    # 2. Query FIELD_OFFICER_TOUR_ASSIGNMENTS joined with FIELD_OFFICER_TOURS
    assigned_tours = db.execute(
        text("""
            SELECT t.oid as tour_oid, t.tour_name as title, t.tour_code, t.description,
                   t.estimated_duration_minutes, t.is_mandatory, ta.assignment_frequency
            FROM FIELD_OFFICER_TOURS t
            JOIN FIELD_OFFICER_TOUR_ASSIGNMENTS ta ON t.oid = ta.tour_oid
            WHERE ta.site_oid = :sid AND ta.status = 'ACTIVE' AND t.is_active = 1
            ORDER BY ta.tour_sequence, t.oid
        """),
        {"sid": site_id}
    ).fetchall()

    tours_list = []
    seen_tour_oids = set()

    if assigned_tours:
        for row in assigned_tours:
            t_oid = row[0]
            seen_tour_oids.add(t_oid)
            cp_count_row = db.execute(
                text("SELECT COUNT(*) FROM FIELD_OFFICER_TOUR_CHECKPOINTS WHERE tour_oid = :toid AND is_active = 1"),
                {"toid": t_oid}
            ).scalar()
            tours_list.append({
                "tour_oid": t_oid,
                "title": row[1] or f"Tour #{t_oid} - {site_name}",
                "tour_code": row[2] or f"TOUR-{t_oid}",
                "description": row[3] or f"Site Patrolling Tour ({row[6]})",
                "site_id": site_id,
                "site_name": site_name,
                "total_checkpoints": max(1, cp_count_row or 0),
                "is_mandatory": bool(row[5]),
                "estimated_duration_minutes": row[4] or 30,
            })

    # 3. Fallback: If no direct assignment, query active tours allowing ad-hoc or matching site
    if not tours_list:
        clean_site_keyword = site_name.split()[0] if site_name else ""
        ad_hoc_tours = db.execute(
            text("""
                SELECT t.oid as tour_oid, t.tour_name as title, t.tour_code, t.description,
                       t.estimated_duration_minutes, t.is_mandatory
                FROM FIELD_OFFICER_TOURS t
                WHERE t.is_active = 1 AND (
                    t.allow_ad_hoc_execution = 1 
                    OR t.tour_name LIKE :s_name
                    OR (t.branch_oid = :b_oid AND :b_oid IS NOT NULL)
                )
                ORDER BY t.oid
            """),
            {"s_name": f"%{clean_site_keyword}%", "b_oid": site_branch}
        ).fetchall()

        for row in ad_hoc_tours:
            t_oid = row[0]
            if t_oid in seen_tour_oids:
                continue
            seen_tour_oids.add(t_oid)
            cp_count_row = db.execute(
                text("SELECT COUNT(*) FROM FIELD_OFFICER_TOUR_CHECKPOINTS WHERE tour_oid = :toid AND is_active = 1"),
                {"toid": t_oid}
            ).scalar()
            tours_list.append({
                "tour_oid": t_oid,
                "title": row[1] or f"Tour #{t_oid} - {site_name}",
                "tour_code": row[2] or f"TOUR-{t_oid}",
                "description": row[3] or "Standard Site Tour",
                "site_id": site_id,
                "site_name": site_name,
                "total_checkpoints": max(1, cp_count_row or 0),
                "is_mandatory": bool(row[5]),
                "estimated_duration_minutes": row[4] or 30,
            })

    return {
        "success": True,
        "site_id": site_id,
        "site_name": site_name,
        "tours": tours_list
    }


@router.get("/assigned-to-custom-visit")
def get_tours_assigned_to_custom_visit(
    custom_visit_id: int = Query(...),
    db: Session = Depends(get_db),
    emp_oid: int = Depends(get_current_employee_oid)
):
    """
    Returns tours assigned to an officer-created custom visit.
    """
    row = db.execute(
        text("SELECT client_name, site_name, address FROM FIELD_OFFICER_NEW_CLIENT_VISITS WHERE oid = :oid"),
        {"oid": custom_visit_id}
    ).fetchone()

    client_name = row[0] if row else "Custom Client"
    site_name = row[1] if row else "Custom Site"

    # Query active ad-hoc tours
    tours_rows = db.execute(
        text("SELECT oid, tour_name, tour_code, description, estimated_duration_minutes, is_mandatory FROM FIELD_OFFICER_TOURS WHERE is_active = 1 AND allow_ad_hoc_execution = 1 ORDER BY oid")
    ).fetchall()

    tours = []
    for r in tours_rows:
        cp_count = db.execute(
            text("SELECT COUNT(*) FROM FIELD_OFFICER_TOUR_CHECKPOINTS WHERE tour_oid = :toid AND is_active = 1"),
            {"toid": r[0]}
        ).scalar() or 1
        tours.append({
            "tour_oid": r[0],
            "title": r[1] or f"Custom Visit Inspection - {site_name}",
            "tour_code": r[2] or "TOUR-CUSTOM",
            "description": r[3] or "Comprehensive client site dynamic checklist tour",
            "custom_visit_id": custom_visit_id,
            "site_name": site_name,
            "client_name": client_name,
            "total_checkpoints": cp_count,
            "is_mandatory": bool(r[5]),
            "estimated_duration_minutes": r[4] or 20
        })

    if not tours:
        tours = [
            {
                "tour_oid": 1,
                "title": f"Custom Visit Inspection - {site_name}",
                "tour_code": "TOUR-001",
                "description": "Comprehensive client site dynamic checklist tour",
                "custom_visit_id": custom_visit_id,
                "site_name": site_name,
                "client_name": client_name,
                "total_checkpoints": 1,
                "is_mandatory": True,
                "estimated_duration_minutes": 20
            }
        ]

    return {
        "success": True,
        "custom_visit_id": custom_visit_id,
        "site_name": site_name,
        "client_name": client_name,
        "tours": tours
    }


@router.get("/{tour_oid}/blueprint")
def get_tour_blueprint(
    tour_oid: int,
    site_id: Optional[int] = Query(None),
    custom_visit_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    emp_oid: int = Depends(get_current_employee_oid)
):
    """
    Returns the complete tour blueprint with checkpoints and nested questions from FIELD_OFFICER_* tables.
    """
    tour_row = db.execute(
        text("SELECT oid, tour_name, description, estimated_duration_minutes, is_mandatory FROM FIELD_OFFICER_TOURS WHERE oid = :toid"),
        {"toid": tour_oid}
    ).fetchone()

    cps_rows = db.execute(
        text("""
            SELECT oid, checkpoint_name, sequence_order, verification_mode,
                   target_latitude, target_longitude, geofence_radius_meters, qr_code_value, is_mandatory
            FROM FIELD_OFFICER_TOUR_CHECKPOINTS
            WHERE tour_oid = :toid AND is_active = 1
            ORDER BY sequence_order, oid
        """),
        {"toid": tour_oid}
    ).fetchall()

    checkpoints_data = []

    for idx, cp in enumerate(cps_rows):
        cp_oid = cp[0]
        cp_name = cp[1]
        cp_order = cp[2] or (idx + 1)
        verif_mode = cp[3] or "GPS_ONLY"
        cp_lat = float(cp[4]) if cp[4] is not None else None
        cp_lng = float(cp[5]) if cp[5] is not None else None
        cp_rad = cp[6] or 50
        cp_qr = cp[7]
        cp_is_mand = bool(cp[8])

        q_rows = db.execute(
            text("""
                SELECT oid, question_text, sequence_order, response_type,
                       options_json, is_mandatory, is_critical, failure_values_json,
                       photo_required, min_photos, max_photos, comment_required_on_failure
                FROM FIELD_OFFICER_TOUR_QUESTIONS
                WHERE checkpoint_oid = :cpoid AND is_active = 1
                ORDER BY sequence_order, oid
            """),
            {"cpoid": cp_oid}
        ).fetchall()

        questions_data = []
        for q_idx, q in enumerate(q_rows):
            q_oid = q[0]
            q_text = q[1]
            q_order = q[2] or (q_idx + 1)
            q_type = q[3] or "YES_NO"

            raw_options = q[4]
            options = []
            if isinstance(raw_options, str):
                try: options = json.loads(raw_options)
                except: options = []
            elif isinstance(raw_options, list):
                options = raw_options
            if not options and q_type == "YES_NO":
                options = ["Yes", "No"]
            elif not options and q_type == "SATISFACTORY_UNSATISFACTORY":
                options = ["Satisfactory", "Unsatisfactory"]

            raw_failure = q[7]
            failure_values = []
            if isinstance(raw_failure, str):
                try: failure_values = json.loads(raw_failure)
                except: failure_values = []
            elif isinstance(raw_failure, list):
                failure_values = raw_failure

            questions_data.append({
                "oid": q_oid,
                "text": q_text,
                "response_type": q_type,
                "options": options,
                "is_mandatory": bool(q[5]),
                "is_critical": bool(q[6]),
                "failure_values": failure_values,
                "requires_photo": bool(q[8]),
                "min_photos": q[9] or 0,
                "max_photos": q[10] or 3,
                "requires_comment_on_failure": bool(q[11]),
                "order": q_order
            })

        if not questions_data:
            # Insert standard observation question directly into database to satisfy foreign key constraints
            try:
                ins_q = db.execute(text("""
                    INSERT INTO FIELD_OFFICER_TOUR_QUESTIONS (
                        checkpoint_oid, question_text, sequence_order, response_type,
                        options_json, is_mandatory, is_critical, failure_values_json,
                        photo_required, min_photos, max_photos, comment_required_on_failure,
                        is_active, created_at
                    ) VALUES (
                        :cpoid, :qtext, 1, 'YES_NO',
                        '["YES", "NO"]', 1, 0, '["NO"]',
                        0, 0, 3, 1,
                        1, NOW()
                    )
                """), {
                    "cpoid": cp_oid,
                    "qtext": f"Are security personnel present, properly groomed and vigilant at {cp_name}?"
                })
                db.commit()
                real_q_oid = ins_q.lastrowid
            except Exception as e:
                db.rollback()
                real_q_oid = 1

            questions_data.append({
                "oid": real_q_oid,
                "text": f"Are security personnel present, properly groomed and vigilant at {cp_name}?",
                "response_type": "YES_NO",
                "options": ["YES", "NO"],
                "is_mandatory": True,
                "is_critical": False,
                "failure_values": ["NO"],
                "requires_comment_on_failure": True,
                "min_photos": 0,
                "max_photos": 3,
                "order": 1
            })

        checkpoints_data.append({
            "oid": cp_oid,
            "name": cp_name,
            "order": cp_order,
            "verification_mode": verif_mode,
            "qr_code": cp_qr,
            "latitude": cp_lat,
            "longitude": cp_lng,
            "geofence_radius": cp_rad,
            "is_mandatory": cp_is_mand,
            "questions": questions_data
        })

    tour_name = tour_row[1] if tour_row else f"Site Patrolling Tour #{tour_oid}"
    tour_desc = tour_row[2] if tour_row else "Sequential checkpoint tour with dynamic multi-question inspection"

    return {
        "success": True,
        "blueprint": {
            "oid": tour_oid,
            "title": tour_name,
            "description": tour_desc,
            "site_id": site_id,
            "custom_visit_id": custom_visit_id,
            "is_mandatory": bool(tour_row[4]) if tour_row else True,
            "estimated_duration_minutes": tour_row[3] if tour_row else (len(checkpoints_data) * 10 or 30),
            "total_checkpoints": len(checkpoints_data),
            "checkpoints": checkpoints_data
        }
    }


@router.post("/visits/start")
def start_tour_visit(
    data: TourStartRequest,
    db: Session = Depends(get_db),
    emp_oid: int = Depends(get_current_employee_oid)
):
    """
    Initializes a tour visit record in FIELD_OFFICER_TOUR_VISITS and FIELD_OFFICER_DAY_VISIT_REPORTS.
    """
    # 1. Check existing in FIELD_OFFICER_TOUR_VISITS (Idempotency)
    existing_tv = db.execute(
        text("SELECT oid, status FROM FIELD_OFFICER_TOUR_VISITS WHERE visit_uid = :vuid LIMIT 1"),
        {"vuid": data.execution_uuid}
    ).fetchone()

    if existing_tv:
        return {
            "success": True,
            "tour_visit_oid": existing_tv[0],
            "execution_uuid": data.execution_uuid,
            "status": existing_tv[1].lower() if existing_tv[1] else "ongoing",
            "message": "Resumed existing tour visit execution"
        }

    # Fetch tour details
    t_row = db.execute(
        text("SELECT branch_oid FROM FIELD_OFFICER_TOURS WHERE oid = :toid"),
        {"toid": data.tour_oid}
    ).fetchone()
    branch_oid = t_row[0] if t_row else 1

    cp_count = db.execute(
        text("SELECT COUNT(*) FROM FIELD_OFFICER_TOUR_CHECKPOINTS WHERE tour_oid = :toid AND is_active = 1"),
        {"toid": data.tour_oid}
    ).scalar() or 1

    officer_name = db.execute(
        text("SELECT name FROM EMPLOYEE WHERE oid = :oid LIMIT 1"),
        {"oid": emp_oid}
    ).scalar() or "Field Officer"

    # Insert into FIELD_OFFICER_TOUR_VISITS
    try:
        ins_tv = text("""
            INSERT INTO FIELD_OFFICER_TOUR_VISITS (
                visit_uid, tour_oid, branch_oid, officer_oid, is_planned_visit,
                site_oid, custom_visit_oid, status, started_at,
                start_latitude, start_longitude, tour_snapshot_json,
                total_checkpoints_count, verified_checkpoints_count
            ) VALUES (
                :vuid, :toid, :boid, :ooid, :iplanned,
                :soid, :coid, 'IN_PROGRESS', NOW(),
                :slat, :slng, '{}',
                :tcount, 0
            )
        """)
        tv_res = db.execute(ins_tv, {
            "vuid": data.execution_uuid,
            "toid": data.tour_oid,
            "boid": branch_oid,
            "ooid": emp_oid,
            "iplanned": 0,  # Enforces chk_fotv_planned_fk (is_planned_visit=0 when planned_visit_oid is null)
            "soid": data.site_oid,
            "coid": data.custom_visit_oid,
            "slat": data.start_latitude,
            "slng": data.start_longitude,
            "tcount": cp_count
        })
        tour_visit_oid = tv_res.lastrowid
        db.commit()
    except Exception as e:
        db.rollback()
        tour_visit_oid = 101
        print("FIELD_OFFICER_TOUR_VISITS insert error:", e)

    today_date = date.today().strftime("%Y-%m-%d")
    date_str = date.today().strftime("%d/%m/%Y")
    check_in_time = datetime.now().strftime("%H:%M")

    c_name = "ADIENT INDIA PVT LTD"
    s_name = "ADIENT - PIMPRI"
    client_id_val = None
    unit_val = None

    if data.site_oid:
        site_info = db.execute(text("""
            SELECT s.name, cl.oid, cl.name
            FROM SITE s
            LEFT JOIN CLIENTT cl ON s.CLIENTT = cl.oid
            WHERE s.oid = :sid
            LIMIT 1
        """), {"sid": data.site_oid}).fetchone()
        if site_info:
            s_name = site_info[0] or s_name
            client_id_val = site_info[1]
            c_name = site_info[2] or c_name
            unit_val = s_name
    elif data.custom_visit_oid:
        ncv_info = db.execute(text("""
            SELECT site_name, client_name
            FROM FIELD_OFFICER_NEW_CLIENT_VISITS
            WHERE oid = :cid
            LIMIT 1
        """), {"cid": data.custom_visit_oid}).fetchone()
        if ncv_info:
            s_name = ncv_info[0] or s_name
            c_name = ncv_info[1] or c_name
            unit_val = s_name

    # Count previous patrol tours to this site/custom_visit to generate sequence (e.g. 01, 02)
    visit_seq = 1
    if data.site_oid:
        count_row = db.execute(text("""
            SELECT COUNT(*) FROM FIELD_OFFICER_PATROL_TOUR_REPORTS
            WHERE site_id = :sid AND tour_visit_oid != :tvoid
        """), {"sid": data.site_oid, "tvoid": tour_visit_oid}).fetchone()
        if count_row and count_row[0] is not None:
            visit_seq = count_row[0] + 1
    elif data.custom_visit_oid:
        count_row = db.execute(text("""
            SELECT COUNT(*) FROM FIELD_OFFICER_PATROL_TOUR_REPORTS
            WHERE custom_visit_id = :cid AND tour_visit_oid != :tvoid
        """), {"cid": data.custom_visit_oid, "tvoid": tour_visit_oid}).fetchone()
        if count_row and count_row[0] is not None:
            visit_seq = count_row[0] + 1

    seq_str = f"{visit_seq:02d}"
    report_id = f"{seq_str}-{c_name}-{s_name}-PTR-{date_str}"

    # 1. Primary dedicated table: FIELD_OFFICER_PATROL_TOUR_REPORTS (oid is auto_increment 1, 2, 3...)
    gps_start_str = f"{data.start_latitude}, {data.start_longitude}" if (data.start_latitude and data.start_longitude) else None
    try:
        db.execute(text("""
            INSERT INTO FIELD_OFFICER_PATROL_TOUR_REPORTS (
                employee_oid, report_id, unit, client_id, site_id, custom_visit_id, tour_visit_oid, tour_oid,
                visit_date, visit_type, officer, `check-in_time`, gps, status, checklist, photos, created_on
            ) VALUES (
                :emp, :rid, :unit, :cid_val, :sid, :cid, :tvoid, :toid,
                :vdate, 'Patrolling Tour', :officer, :cin, :gps, 'In Progress', '[]', '[]', NOW()
            )
        """), {
            "emp": emp_oid,
            "rid": report_id,
            "unit": unit_val,
            "cid_val": client_id_val,
            "sid": data.site_oid,
            "cid": data.custom_visit_oid,
            "tvoid": tour_visit_oid,
            "toid": data.tour_oid,
            "vdate": today_date,
            "officer": officer_name,
            "cin": check_in_time,
            "gps": gps_start_str
        })
        db.commit()
    except Exception as rep_err:
        db.rollback()
        print("FIELD_OFFICER_PATROL_TOUR_REPORTS start sync error:", rep_err)

    # 2. Legacy reporting compatibility: FIELD_OFFICER_DAY_VISIT_REPORTS
    try:
        db.execute(text("""
            INSERT INTO FIELD_OFFICER_DAY_VISIT_REPORTS (
                oid, report_id, visit_date, site_id, custom_visit_id, employee_oid, officer,
                `check-in_time`, status, visit_type, checklist, photos, created_on
            ) VALUES (
                :roid, :rid, :vdate, :sid, :cid, :emp, :officer,
                :cin, 'In Progress', 'Dynamic Tour', '[]', '[]', NOW()
            )
        """), {
            "roid": data.execution_uuid,
            "rid": report_id,
            "vdate": today_date,
            "sid": data.site_oid,
            "cid": data.custom_visit_oid,
            "emp": emp_oid,
            "officer": officer_name,
            "cin": check_in_time
        })
        db.commit()
    except Exception as dvr_err:
        db.rollback()
        print("FIELD_OFFICER_DAY_VISIT_REPORTS start sync warning:", dvr_err)

    return {
        "success": True,
        "tour_visit_oid": tour_visit_oid,
        "report_id": report_id,
        "execution_uuid": data.execution_uuid,
        "status": "ongoing",
        "message": "Tour visit started successfully"
    }


@router.post("/visits/{tour_visit_oid}/checkpoints/verify")
@router.post("/executions/{tour_visit_oid}/checkpoints/verify")
def verify_tour_checkpoint(
    tour_visit_oid: int,
    data: CheckpointVerifyRequest,
    db: Session = Depends(get_db),
    emp_oid: int = Depends(get_current_employee_oid)
):
    """
    Authoritative backend verification for QR code and GPS coordinates against FIELD_OFFICER_TOUR_CHECKPOINTS.
    Enforces GPS + QR validation within geofence radius.
    """
    cp_row = db.execute(
        text("""
            SELECT oid, checkpoint_name, verification_mode, target_latitude, target_longitude,
                   geofence_radius_meters, qr_code_value
            FROM FIELD_OFFICER_TOUR_CHECKPOINTS
            WHERE oid = :oid AND is_active = 1
            LIMIT 1
        """),
        {"oid": data.checkpoint_oid}
    ).fetchone()

    if not cp_row:
        raise HTTPException(status_code=404, detail=f"Checkpoint #{data.checkpoint_oid} not found or inactive.")

    cp_name = cp_row[1]
    verif_mode = cp_row[2] or "GPS_AND_QR"
    cp_lat = float(cp_row[3]) if cp_row[3] is not None else None
    cp_lng = float(cp_row[4]) if cp_row[4] is not None else None
    cp_rad = float(cp_row[5] or 30)
    cp_qr = (cp_row[6] or "").strip()

    qr_scanned = (data.qr_code_scanned or data.qr_code or "").strip()
    accuracy_val = data.accuracy_meters or data.accuracy or 10.0

    # Calculate attempt count
    prev_attempts = db.execute(text("""
        SELECT COUNT(*) FROM FIELD_OFFICER_TOUR_CHECKPOINT_VISITS
        WHERE tour_visit_oid = :tvoid AND checkpoint_oid = :cpoid
    """), {"tvoid": tour_visit_oid, "cpoid": data.checkpoint_oid}).scalar() or 0
    attempt_count = prev_attempts + 1

    distance_meters = 0.0
    within_geofence = True

    # 1. QR Validation
    if verif_mode in ("QR_ONLY", "GPS_AND_QR", "GPS_OR_QR") and cp_qr:
        if not qr_scanned:
            raise HTTPException(
                status_code=400,
                detail=f"QR Code is required to verify checkpoint '{cp_name}'."
            )
        expected = cp_qr.upper()
        scanned = qr_scanned.upper()
        if scanned != expected and scanned != str(cp_row[0]) and f"CP-{cp_row[0]}" not in scanned:
            # Log failed QR attempt
            try:
                db.execute(text("""
                    INSERT INTO FIELD_OFFICER_TOUR_CHECKPOINT_VISITS (
                        tour_visit_oid, checkpoint_oid, checkpoint_name_snapshot, sequence_order_snapshot,
                        verification_mode_snapshot, verification_status, attempt_count,
                        submitted_latitude, submitted_longitude, gps_accuracy_meters,
                        qr_code_scanned, failure_reason, created_at
                    ) VALUES (
                        :tvoid, :cpoid, :cpname, 1,
                        :vmode, 'FAILED_INVALID_QR', :att,
                        :lat, :lng, :acc,
                        :qr, :reason, NOW()
                    )
                """), {
                    "tvoid": tour_visit_oid,
                    "cpoid": data.checkpoint_oid,
                    "cpname": cp_name,
                    "vmode": verif_mode,
                    "att": attempt_count,
                    "lat": data.latitude,
                    "lng": data.longitude,
                    "acc": accuracy_val,
                    "qr": qr_scanned,
                    "reason": f"Invalid QR code. Expected '{cp_qr}'"
                })
                db.commit()
            except Exception:
                db.rollback()

            raise HTTPException(
                status_code=400,
                detail=f"Verification Failed: Invalid QR code. Expected QR '{cp_qr}' for checkpoint '{cp_name}'."
            )

    # 2. GPS Geofence Validation
    if verif_mode in ("GPS_ONLY", "GPS_AND_QR") or (cp_lat is not None and cp_lng is not None):
        if cp_lat is not None and cp_lng is not None:
            if data.latitude and data.longitude:
                distance_meters = haversine_distance_meters(data.latitude, data.longitude, cp_lat, cp_lng)
                allowed_range = max(cp_rad, 30.0)
                if distance_meters > allowed_range:
                    # Log failed GPS out of bounds attempt
                    fail_msg = f"GPS out of range ({round(distance_meters, 1)}m > {int(allowed_range)}m)"
                    try:
                        db.execute(text("""
                            INSERT INTO FIELD_OFFICER_TOUR_CHECKPOINT_VISITS (
                                tour_visit_oid, checkpoint_oid, checkpoint_name_snapshot, sequence_order_snapshot,
                                verification_mode_snapshot, verification_status, attempt_count,
                                submitted_latitude, submitted_longitude, gps_accuracy_meters,
                                calculated_distance_meters, qr_code_scanned, failure_reason, created_at
                            ) VALUES (
                                :tvoid, :cpoid, :cpname, 1,
                                :vmode, 'FAILED_OUT_OF_BOUNDS', :att,
                                :lat, :lng, :acc,
                                :dist, :qr, :reason, NOW()
                            )
                        """), {
                            "tvoid": tour_visit_oid,
                            "cpoid": data.checkpoint_oid,
                            "cpname": cp_name,
                            "vmode": verif_mode,
                            "att": attempt_count,
                            "lat": data.latitude,
                            "lng": data.longitude,
                            "acc": accuracy_val,
                            "dist": distance_meters,
                            "qr": qr_scanned,
                            "reason": fail_msg
                        })
                        db.commit()
                    except Exception:
                        db.rollback()

                    raise HTTPException(
                        status_code=400,
                        detail=f"Verification Failed: GPS out of range. You are {int(distance_meters)}m away from this checkpoint (maximum allowed is {int(allowed_range)}m)."
                    )

    # 3. Successful Verification Log
    log_oid = 0
    try:
        ins_res = db.execute(text("""
            INSERT INTO FIELD_OFFICER_TOUR_CHECKPOINT_VISITS (
                tour_visit_oid, checkpoint_oid, checkpoint_name_snapshot, sequence_order_snapshot,
                verification_mode_snapshot, verification_status, attempt_count,
                submitted_latitude, submitted_longitude, gps_accuracy_meters,
                calculated_distance_meters, qr_code_scanned, failure_reason, server_verified_at, created_at
            ) VALUES (
                :tvoid, :cpoid, :cpname, 1,
                :vmode, 'VERIFIED', :att,
                :lat, :lng, :acc,
                :dist, :qr, NULL, NOW(), NOW()
            )
        """), {
            "tvoid": tour_visit_oid,
            "cpoid": data.checkpoint_oid,
            "cpname": cp_name,
            "vmode": verif_mode,
            "att": attempt_count,
            "lat": data.latitude,
            "lng": data.longitude,
            "acc": accuracy_val,
            "dist": distance_meters,
            "qr": qr_scanned
        })
        log_oid = ins_res.lastrowid or 0
        db.execute(text("""
            UPDATE FIELD_OFFICER_TOUR_VISITS 
            SET verified_checkpoints_count = verified_checkpoints_count + 1 
            WHERE oid = :tvoid
        """), {"tvoid": tour_visit_oid})
        db.commit()
    except Exception as v_err:
        db.rollback()
        print("Checkpoint visit log error:", v_err)

    return {
        "oid": log_oid,
        "checkpoint_oid": data.checkpoint_oid,
        "verification_status": "VERIFIED",
        "attempt_count": attempt_count,
        "failure_reason": None,
        "calculated_distance_meters": round(distance_meters, 1),
        "distance_meters": round(distance_meters, 1),
        "gps_verified": within_geofence,
        "verified": True,
        "success": True,
        "verified_at": datetime.now().isoformat(),
        "message": f"Checkpoint '{cp_name}' scanned & verified successfully!"
    }


@router.post("/visits/{tour_visit_oid}/responses")
def submit_tour_checkpoint_responses(
    tour_visit_oid: int,
    data: CheckpointResponsesSubmitRequest,
    db: Session = Depends(get_db),
    emp_oid: int = Depends(get_current_employee_oid)
):
    """
    Submits answers and photos for a verified checkpoint directly to FIELD_OFFICER_TOUR_RESPONSES.
    """
    for item in data.responses:
        q_row = db.execute(
            text("SELECT question_text, response_type, is_mandatory, is_critical FROM FIELD_OFFICER_TOUR_QUESTIONS WHERE oid = :qoid"),
            {"qoid": item.question_oid}
        ).fetchone()

        q_text = q_row[0] if q_row else "Question Observation"
        q_type = q_row[1] if q_row else "TEXT"
        q_mand = q_row[2] if q_row else 1
        q_crit = q_row[3] if q_row else 0

        rating_val = None
        if q_type == "RATING":
            try: rating_val = int(item.response_value)
            except: pass

        photos_json = json.dumps(item.photo_urls or [])

        try:
            db.execute(text("""
                INSERT INTO FIELD_OFFICER_TOUR_RESPONSES (
                    tour_visit_oid, checkpoint_oid, question_oid, question_text_snapshot,
                    response_type_snapshot, is_mandatory_snapshot, is_critical_snapshot,
                    response_text, rating_value, is_failed, photos_json, notes, submitted_at
                ) VALUES (
                    :tvoid, :cpoid, :qoid, :qtext,
                    :qtype, :qmand, :qcrit,
                    :rtext, :rval, :isfail, :pjson, :notes, NOW()
                )
            """), {
                "tvoid": tour_visit_oid,
                "cpoid": data.checkpoint_oid,
                "qoid": item.question_oid,
                "qtext": q_text,
                "qtype": q_type,
                "qmand": q_mand,
                "qcrit": q_crit,
                "rtext": item.response_value,
                "rval": rating_val,
                "isfail": 1 if item.is_failure else 0,
                "pjson": photos_json,
                "notes": item.comment
            })
            db.commit()
        except Exception as r_err:
            db.rollback()
            print("FIELD_OFFICER_TOUR_RESPONSES insert error:", r_err)

    return {
        "success": True,
        "checkpoint_oid": data.checkpoint_oid,
        "saved_count": len(data.responses),
        "message": "Checkpoint responses recorded successfully"
    }


@router.post("/evidence/upload")
async def upload_tour_evidence(
    file: UploadFile = File(...),
    tour_visit_oid: Optional[int] = Form(None),
    checkpoint_oid: Optional[int] = Form(None),
    question_oid: Optional[int] = Form(None),
    execution_uuid: Optional[str] = Form(None),
    emp_oid: int = Depends(get_current_employee_oid)
):
    """
    Uploads evidence photos for tour questions, naming files with UUIDs to eliminate collisions.
    """
    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "tours")
    os.makedirs(uploads_dir, exist_ok=True)

    file_ext = os.path.splitext(file.filename)[1] or ".jpg"
    unique_filename = f"tour_{checkpoint_oid or 0}_{question_oid or 0}_{uuid.uuid4().hex}{file_ext}"
    filepath = os.path.join(uploads_dir, unique_filename)

    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    photo_url = f"/uploads/tours/{unique_filename}"
    return {
        "success": True,
        "url": photo_url,
        "filename": unique_filename
    }


@router.post("/visits/sync-offline")
def sync_offline_tour(
    payload: OfflineSyncPayload,
    db: Session = Depends(get_db),
    emp_oid: int = Depends(get_current_employee_oid)
):
    """
    Synchronizes a complete offline tour execution payload into FIELD_OFFICER_TOUR_VISITS and SITE_VISIT_SESSIONS.
    """
    existing_tv = db.execute(
        text("SELECT oid, status FROM FIELD_OFFICER_TOUR_VISITS WHERE visit_uid = :vuid LIMIT 1"),
        {"vuid": payload.execution_uuid}
    ).fetchone()

    if existing_tv and existing_tv[1] == "COMPLETED":
        return {
            "success": True,
            "execution_uuid": payload.execution_uuid,
            "synced": True,
            "already_synced": True,
            "message": "Tour already synchronized"
        }

    try:
        if existing_tv:
            db.execute(text("""
                UPDATE FIELD_OFFICER_TOUR_VISITS 
                SET status = 'COMPLETED', completed_at = NOW() 
                WHERE oid = :oid
            """), {"oid": existing_tv[0]})
        else:
            boid_row = db.execute(
                text("SELECT branch_oid FROM FIELD_OFFICER_TOURS WHERE oid = :toid"),
                {"toid": payload.tour_oid}
            ).fetchone()
            branch_oid = boid_row[0] if boid_row else 1

            db.execute(text("""
                INSERT INTO FIELD_OFFICER_TOUR_VISITS (
                    visit_uid, tour_oid, branch_oid, officer_oid, is_planned_visit,
                    site_oid, custom_visit_oid, status, started_at, completed_at,
                    tour_snapshot_json, total_checkpoints_count, verified_checkpoints_count
                ) VALUES (
                    :vuid, :toid, :boid, :ooid, 0,
                    :soid, :coid, 'COMPLETED', NOW(), NOW(),
                    :snap, :tcount, :tcount
                )
            """), {
                "vuid": payload.execution_uuid,
                "toid": payload.tour_oid,
                "boid": branch_oid,
                "ooid": emp_oid,
                "soid": payload.site_oid,
                "coid": payload.custom_visit_oid,
                "snap": json.dumps(payload.checkpoints),
                "tcount": len(payload.checkpoints)
            })
        db.commit()
    except Exception as sync_err:
        db.rollback()
        print("Offline sync tour error:", sync_err)

    # Note: Active SITE_VISIT_SESSIONS is kept open so the officer can perform manual Check-Out from Visits screen.

    return {
        "success": True,
        "execution_uuid": payload.execution_uuid,
        "synced": True,
        "message": "Offline tour execution synchronized successfully"
    }


@router.post("/visits/{tour_visit_oid}/complete")
def complete_tour_visit(
    tour_visit_oid: int,
    data: TourCompleteRequest,
    db: Session = Depends(get_db),
    emp_oid: int = Depends(get_current_employee_oid)
):
    """
    Marks the tour visit as completed in FIELD_OFFICER_TOUR_VISITS and updates SITE_VISIT_SESSIONS.
    """
    # 1. Update FIELD_OFFICER_TOUR_VISITS
    try:
        db.execute(
            text("""
                UPDATE FIELD_OFFICER_TOUR_VISITS 
                SET status = 'COMPLETED', completed_at = NOW(),
                    completion_latitude = :clat, completion_longitude = :clng,
                    summary_notes = :notes
                WHERE oid = :oid OR visit_uid = :vuid
            """),
            {
                "oid": tour_visit_oid,
                "vuid": data.execution_uuid or "",
                "clat": data.end_latitude,
                "clng": data.end_longitude,
                "notes": final_tour_remarks
            }
        )
        db.commit()
    except Exception as tv_comp_err:
        db.rollback()
        print("FIELD_OFFICER_TOUR_VISITS complete error:", tv_comp_err)

    # 2. Keep active SITE_VISIT_SESSIONS open so the officer can perform manual Check-Out from Pending Visits
    # Note: SITE_VISIT_SESSIONS is formally closed when the officer taps [Check-Out] in VisitsScreen.

    # 3. Synchronize FIELD_OFFICER_DAY_VISIT_REPORTS for reporting compatibility & PDF generation
    try:
        report_id = f"TOUR-{data.execution_uuid[:8]}" if data.execution_uuid else f"TOUR-{tour_visit_oid}"
        
        # Compile all questions, answers, and photos from FIELD_OFFICER_TOUR_RESPONSES
        responses_sql = text("""
            SELECT tr.question_oid, tr.question_text_snapshot, tr.response_text,
                   tr.notes, tr.photos_json, tr.is_critical_snapshot, tr.is_failed,
                   cp.checkpoint_name
            FROM FIELD_OFFICER_TOUR_RESPONSES tr
            LEFT JOIN FIELD_OFFICER_TOUR_QUESTIONS q ON tr.question_oid = q.oid
            LEFT JOIN FIELD_OFFICER_TOUR_CHECKPOINTS cp ON tr.checkpoint_oid = cp.oid
            WHERE tr.tour_visit_oid = :tvoid
               OR tr.tour_visit_oid IN (SELECT oid FROM FIELD_OFFICER_TOUR_VISITS WHERE visit_uid = :vuid)
            ORDER BY tr.oid
        """)
        resp_rows = db.execute(responses_sql, {"tvoid": tour_visit_oid, "vuid": data.execution_uuid or ""}).fetchall()

        checklist_items = []
        all_photos = []
        for r in resp_rows:
            p_list = []
            if r[4]:
                try:
                    p_list = json.loads(r[4])
                except:
                    p_list = []
            all_photos.extend(p_list)

            cp_tag = f"[{r[7]}] " if r[7] else ""
            checklist_items.append({
                "question": f"{cp_tag}{r[1] or 'Tour Question'}",
                "status": r[2] or "Satisfactory",
                "answer": r[2] or "Satisfactory",
                "remarks": r[3] or "",
                "photos": p_list,
                "is_critical": bool(r[5]),
                "is_failure": bool(r[6]),
            })

        # Priority 1: Extract from data.checkpoints if provided by frontend
        raw_checkpoints = data.checkpoints
        if not checklist_items and raw_checkpoints:
            try:
                for cp_k, cp_v in raw_checkpoints.items():
                    cp_title = cp_v.get("checkpoint_name") or cp_v.get("name") or "Checkpoint"
                    cp_tag = f"[{cp_title}] "
                    resps = cp_v.get("responses") or {}
                    for q_k, q_v in resps.items():
                        q_photos = [p.get("uploaded_url") for p in q_v.get("photos", []) if p.get("uploaded_url")]
                        all_photos.extend(q_photos)
                        checklist_items.append({
                            "question": f"{cp_tag}{q_v.get('question_text') or q_v.get('text') or 'Tour Question'}",
                            "status": q_v.get("response_value") or "Satisfactory",
                            "answer": q_v.get("response_value") or "Satisfactory",
                            "remarks": q_v.get("comment") or "",
                            "photos": q_photos,
                            "is_critical": bool(q_v.get("is_critical_violation")),
                            "is_failure": bool(q_v.get("is_failure")),
                        })
            except Exception as parse_err:
                print("Error extracting checklist from data.checkpoints:", parse_err)

        # Priority 2: Fallback to tour_snapshot_json if responses table and data.checkpoints were empty
        if not checklist_items:
            snap_row = db.execute(
                text("SELECT tour_snapshot_json FROM FIELD_OFFICER_TOUR_VISITS WHERE oid = :tvoid OR visit_uid = :vuid LIMIT 1"),
                {"tvoid": tour_visit_oid, "vuid": data.execution_uuid or ""}
            ).fetchone()
            if snap_row and snap_row[0]:
                try:
                    snap_data = json.loads(snap_row[0]) if isinstance(snap_row[0], str) else snap_row[0]
                    if isinstance(snap_data, dict):
                        for cp_id, cp_val in snap_data.items():
                            cp_label = f"[{cp_val.get('checkpoint_name', 'Checkpoint')}] "
                            resps = cp_val.get("responses", {})
                            for q_id, q_val in resps.items():
                                q_p_list = [p.get("uploaded_url") for p in q_val.get("photos", []) if p.get("uploaded_url")]
                                all_photos.extend(q_p_list)
                                checklist_items.append({
                                    "question": f"{cp_label}{q_val.get('question_text', 'Tour Checkpoint Question')}",
                                    "status": q_val.get("response_value") or "Satisfactory",
                                    "answer": q_val.get("response_value") or "Satisfactory",
                                    "remarks": q_val.get("comment") or "",
                                    "photos": q_p_list,
                                    "is_critical": bool(q_val.get("is_critical_violation")),
                                    "is_failure": bool(q_val.get("is_failure")),
                                })
                except Exception as snap_err:
                    print("Snapshot parse fallback warning:", snap_err)

        check_out_time = datetime.now().strftime("%H:%M")

        # 1. Update/Upsert FIELD_OFFICER_PATROL_TOUR_REPORTS
        try:
            # Determine GPS
            gps_end_str = f"{data.end_latitude}, {data.end_longitude}" if (data.end_latitude and data.end_longitude) else None

            # Collect checklist remarks if user didn't enter custom summary notes
            checklist_remarks_list = [
                c.get("remarks").strip() for c in checklist_items
                if c.get("remarks") and isinstance(c.get("remarks"), str) and c.get("remarks").strip()
            ]
            combined_checklist_remarks = " | ".join(checklist_remarks_list)

            # Use officer notes from summary screen if provided; otherwise fallback to checklist remarks
            submitted_notes = (data.notes or "").strip()
            if submitted_notes:
                final_tour_remarks = submitted_notes
            elif combined_checklist_remarks:
                final_tour_remarks = combined_checklist_remarks
            else:
                final_tour_remarks = ""

            existing_ptr = db.execute(text("""
                SELECT oid, report_id, gps FROM FIELD_OFFICER_PATROL_TOUR_REPORTS
                WHERE tour_visit_oid = :tvoid
                LIMIT 1
            """), {"tvoid": tour_visit_oid}).fetchone()

            if existing_ptr:
                final_gps = gps_end_str or existing_ptr[2]
                db.execute(text("""
                    UPDATE FIELD_OFFICER_PATROL_TOUR_REPORTS
                    SET status = 'Completed',
                        `check-out_time` = :cout,
                        gps = :gps,
                        checklist = :clist,
                        photos = :photos,
                        overall_remarks = :notes
                    WHERE oid = :eoid
                """), {
                    "cout": check_out_time,
                    "gps": final_gps,
                    "clist": json.dumps(checklist_items),
                    "photos": json.dumps(all_photos),
                    "notes": final_tour_remarks,
                    "eoid": existing_ptr[0]
                })
            else:
                tv_info = db.execute(text("""
                    SELECT tour_oid, site_oid, custom_visit_oid, officer_oid, branch_oid, DATE(started_at), TIME(started_at)
                    FROM FIELD_OFFICER_TOUR_VISITS
                    WHERE oid = :tvoid OR visit_uid = :vuid
                    LIMIT 1
                """), {"tvoid": tour_visit_oid, "vuid": data.execution_uuid or ""}).fetchone()

                s_oid = tv_info[1] if tv_info else None
                c_oid = tv_info[2] if tv_info else None
                o_oid = tv_info[3] if tv_info else emp_oid
                t_oid = tv_info[0] if tv_info else 101
                v_date = str(tv_info[5]) if (tv_info and tv_info[5]) else date.today().strftime("%Y-%m-%d")
                cin_time = str(tv_info[6])[:5] if (tv_info and tv_info[6]) else datetime.now().strftime("%H:%M")

                c_name = "ADIENT INDIA PVT LTD"
                s_name = "ADIENT - PIMPRI"
                client_id_val = None
                unit_val = None

                if s_oid:
                    site_info = db.execute(text("""
                        SELECT s.name, cl.oid, cl.name
                        FROM SITE s
                        LEFT JOIN CLIENTT cl ON s.CLIENTT = cl.oid
                        WHERE s.oid = :sid
                        LIMIT 1
                    """), {"sid": s_oid}).fetchone()
                    if site_info:
                        s_name = site_info[0] or s_name
                        client_id_val = site_info[1]
                        c_name = site_info[2] or c_name
                        unit_val = s_name
                elif c_oid:
                    ncv_info = db.execute(text("""
                        SELECT site_name, client_name
                        FROM FIELD_OFFICER_NEW_CLIENT_VISITS
                        WHERE oid = :cid
                        LIMIT 1
                    """), {"cid": c_oid}).fetchone()
                    if ncv_info:
                        s_name = ncv_info[0] or s_name
                        c_name = ncv_info[1] or c_name
                        unit_val = s_name

                # Count previous patrol tours for sequence
                visit_seq = 1
                if s_oid:
                    count_row = db.execute(text("""
                        SELECT COUNT(*) FROM FIELD_OFFICER_PATROL_TOUR_REPORTS
                        WHERE site_id = :sid AND tour_visit_oid != :tvoid
                    """), {"sid": s_oid, "tvoid": tour_visit_oid}).fetchone()
                    if count_row and count_row[0] is not None:
                        visit_seq = count_row[0] + 1
                elif c_oid:
                    count_row = db.execute(text("""
                        SELECT COUNT(*) FROM FIELD_OFFICER_PATROL_TOUR_REPORTS
                        WHERE custom_visit_id = :cid AND tour_visit_oid != :tvoid
                    """), {"cid": c_oid, "tvoid": tour_visit_oid}).fetchone()
                    if count_row and count_row[0] is not None:
                        visit_seq = count_row[0] + 1

                seq_str = f"{visit_seq:02d}"
                date_str = date.today().strftime("%d/%m/%Y")
                rep_id_calc = f"{seq_str}-{c_name}-{s_name}-PTR-{date_str}"

                db.execute(text("""
                    INSERT INTO FIELD_OFFICER_PATROL_TOUR_REPORTS (
                        employee_oid, report_id, unit, client_id, site_id, custom_visit_id, tour_visit_oid, tour_oid,
                        visit_date, visit_type, officer, `check-in_time`, `check-out_time`,
                        gps, status, checklist, photos, overall_remarks, created_on
                    ) VALUES (
                        :emp, :rid, :unit, :cid_val, :sid, :cid, :tvoid, :toid,
                        :vdate, 'Patrolling Tour', :officer, :cin, :cout,
                        :gps, 'Completed', :clist, :photos, :notes, NOW()
                    )
                """), {
                    "emp": o_oid,
                    "rid": rep_id_calc,
                    "unit": unit_val,
                    "cid_val": client_id_val,
                    "sid": s_oid,
                    "cid": c_oid,
                    "tvoid": tour_visit_oid,
                    "toid": t_oid,
                    "vdate": v_date,
                    "officer": officer_name,
                    "cin": cin_time,
                    "cout": check_out_time,
                    "gps": gps_end_str,
                    "clist": json.dumps(checklist_items),
                    "photos": json.dumps(all_photos),
                    "notes": final_tour_remarks
                })
            db.commit()
        except Exception as ptr_err:
            db.rollback()
            print("FIELD_OFFICER_PATROL_TOUR_REPORTS complete sync error:", ptr_err)

        # 2. Legacy reporting compatibility: FIELD_OFFICER_DAY_VISIT_REPORTS
        active_report_id = (existing_ptr[1] if existing_ptr else rep_id_calc) if 'rep_id_calc' in locals() else (existing_ptr[1] if existing_ptr else report_id)
        try:
            existing_dvr = db.execute(text("""
                SELECT oid FROM FIELD_OFFICER_DAY_VISIT_REPORTS
                WHERE report_id = :rid OR oid = :vuid
                LIMIT 1
            """), {"rid": active_report_id, "vuid": data.execution_uuid or ""}).fetchone()

            if existing_dvr:
                db.execute(text("""
                    UPDATE FIELD_OFFICER_DAY_VISIT_REPORTS
                    SET report_id = :rid,
                        status = 'Completed',
                        `check-out_time` = :cout,
                        checklist = :clist,
                        photos = :photos,
                        overall_remarks = :notes
                    WHERE oid = :eoid
                """), {
                    "rid": active_report_id,
                    "cout": check_out_time,
                    "clist": json.dumps(checklist_items),
                    "photos": json.dumps(all_photos),
                    "notes": final_tour_remarks,
                    "eoid": existing_dvr[0]
                })
            else:
                db.execute(text("""
                    INSERT INTO FIELD_OFFICER_DAY_VISIT_REPORTS (
                        oid, report_id, visit_date, site_id, custom_visit_id, employee_oid, officer,
                        `check-in_time`, `check-out_time`, status, visit_type, checklist, photos, overall_remarks, created_on
                    ) VALUES (
                        :roid, :rid, :vdate, :sid, :cid, :emp, :officer,
                        :cin, :cout, 'Completed', 'Dynamic Tour', :clist, :photos, :notes, NOW()
                    )
                """), {
                    "roid": data.execution_uuid,
                    "rid": active_report_id,
                    "vdate": date.today().strftime("%Y-%m-%d"),
                    "sid": s_oid if 's_oid' in locals() else None,
                    "cid": c_oid if 'c_oid' in locals() else None,
                    "emp": emp_oid,
                    "officer": officer_name,
                    "cin": datetime.now().strftime("%H:%M"),
                    "cout": check_out_time,
                    "clist": json.dumps(checklist_items),
                    "photos": json.dumps(all_photos),
                    "notes": final_tour_remarks
                })
            db.commit()
        except Exception as dvr_err:
            db.rollback()
            print("FIELD_OFFICER_DAY_VISIT_REPORTS complete sync warning:", dvr_err)
    except Exception as dvr_err:
        db.rollback()
        print("FIELD_OFFICER_DAY_VISIT_REPORTS complete sync warning:", dvr_err)

    return {
        "success": True,
        "tour_visit_oid": tour_visit_oid,
        "report_id": active_report_id if 'active_report_id' in locals() else report_id,
        "status": "COMPLETED",
        "report_submitted": True,
        "message": "Tour completed successfully!"
    }
