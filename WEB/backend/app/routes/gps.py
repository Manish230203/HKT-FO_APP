from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, Query, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Any, Union
from pydantic import BaseModel
from datetime import datetime

from app.database import get_patrol_db, get_db_cursor
from app.models.patrol_models import PlannedVisitSchedule
from app.services.gps_service import (
    ingest_gps_locations_service,
    get_live_manager_gps_service,
    get_track_history_service,
    get_planned_vs_actual_visits_service,
    get_active_site_visit_session_service,
    manual_site_check_in_service,
    manual_site_check_out_service,
    GPSManager
)

router = APIRouter(tags=["GPS Tracking & Site Visits"])

class GPSPointInput(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    battery_level: Optional[float] = None
    is_mock: Optional[bool] = False
    recorded_at: Optional[str] = None

class GPSIngestBatchRequest(BaseModel):
    employee_id: int
    shift_id: Optional[int] = None
    points: List[GPSPointInput]

class PlannedVisitCreateRequest(BaseModel):
    employee_id: int
    site_id: int
    site_name: Optional[str] = None
    planned_date: str
    required_frequency: Optional[int] = 1
    min_duration_minutes: Optional[int] = 15

class SiteCheckInRequest(BaseModel):
    employee_id: int
    site_id: int
    site_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class SiteCheckOutRequest(BaseModel):
    employee_id: int
    site_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.get("/site-visit/active")
def get_active_site_visit_session(
    employee_id: int = Query(...),
    db: Session = Depends(get_patrol_db)
):
    session = get_active_site_visit_session_service(db, employee_id)
    return {"success": True, "active_session": session}


@router.post("/site-visit/check-in")
def manual_site_check_in(
    payload: SiteCheckInRequest,
    db: Session = Depends(get_patrol_db)
):
    res = manual_site_check_in_service(
        db=db,
        employee_id=payload.employee_id,
        site_id=payload.site_id,
        site_name=payload.site_name,
        latitude=payload.latitude,
        longitude=payload.longitude
    )
    if not res.get("success") and res.get("has_active_session"):
        return JSONResponse(status_code=400, content=res)
    return res


@router.post("/site-visit/check-out")
def manual_site_check_out(
    payload: SiteCheckOutRequest,
    db: Session = Depends(get_patrol_db)
):
    res = manual_site_check_out_service(
        db=db,
        employee_id=payload.employee_id,
        site_id=payload.site_id,
        latitude=payload.latitude,
        longitude=payload.longitude
    )
    if not res.get("success"):
        return JSONResponse(status_code=400, content=res)
    return res


@router.post("/gps/ingest")
@router.post("/_AIP_gpsIngest")
async def ingest_gps_locations(
    payload: GPSIngestBatchRequest,
    db: Session = Depends(get_patrol_db)
):
    points_dict = [pt.model_dump() if hasattr(pt, 'model_dump') else pt.dict() for pt in payload.points]
    result = ingest_gps_locations_service(db, payload.employee_id, points_dict, payload.shift_id)

    # Broadcast update to connected Area Manager WebSockets
    if result.get("latest_location"):
        broadcast_payload = {
            "type": "LOCATION_UPDATE",
            "employee_id": payload.employee_id,
            "location": result["latest_location"]
        }
        await GPSManager.broadcast_location(broadcast_payload)

    return result


@router.get("/gps/live")
@router.get("/_AIP_gpsLive")
def get_live_officer_locations(db: Session = Depends(get_patrol_db)):
    data = get_live_manager_gps_service(db)
    return {"success": True, "officers": data}


@router.get("/gps/history")
def get_track_history(
    employee_id: int = Query(...),
    date: str = Query(...),
    db: Session = Depends(get_patrol_db)
):
    return get_track_history_service(db, employee_id, date)


@router.get("/gps/planned-vs-actual")
def get_planned_vs_actual_report(
    date: Optional[str] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_patrol_db)
):
    report = get_planned_vs_actual_visits_service(db, date, employee_id)
    return {"success": True, "report": report}


@router.post("/gps/planned-visits")
def create_planned_visit_schedule(
    payload: PlannedVisitCreateRequest,
    db: Session = Depends(get_patrol_db)
):
    try:
        p_date = datetime.strptime(payload.planned_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    schedule = PlannedVisitSchedule(
        employee_id=payload.employee_id,
        site_id=payload.site_id,
        site_name=payload.site_name,
        planned_date=p_date,
        required_frequency=payload.required_frequency or 1,
        min_duration_minutes=payload.min_duration_minutes or 15
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    return {"success": True, "schedule_id": schedule.id, "message": "Planned visit schedule created successfully"}


@router.websocket("/gps/ws/live")
async def websocket_live_tracking(ws: WebSocket):
    await ws.accept()
    GPSManager.register_ws(ws)
    try:
        while True:
            # Keep connection alive
            await ws.receive_text()
    except WebSocketDisconnect:
        GPSManager.unregister_ws(ws)
    except Exception:
        GPSManager.unregister_ws(ws)


from datetime import datetime, timezone, timedelta

def format_to_local_ist(ts_str: Optional[str] = None) -> str:
    ist_offset = timezone(timedelta(hours=5, minutes=30))
    if not ts_str:
        return datetime.now(ist_offset).strftime("%Y-%m-%d %H:%M:%S")
    ts_str = ts_str.strip()
    if "T" not in ts_str and "Z" not in ts_str and "+" not in ts_str:
        return ts_str[:19]
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        if dt.tzinfo:
            dt_ist = dt.astimezone(ist_offset)
        else:
            dt_ist = dt.replace(tzinfo=timezone.utc).astimezone(ist_offset)
        return dt_ist.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return ts_str[:19]

class LocationViolationRequest(BaseModel):
    employee_oid: Optional[int] = None
    employee_id: Optional[int] = None
    event_type: Optional[str] = "DUTY_LOCATION_OFF_VIOLATION"
    timestamp: Optional[str] = None
    location_off_at: Optional[str] = None
    location_restored_at: Optional[str] = None
    punch_in_id: Optional[Union[int, str]] = None
    punch_out_id: Optional[Union[int, str]] = None
    punch_out_time: Optional[str] = None
    details: Optional[str] = None


@router.post("/v1/violations/location-off")
@router.post("/v1/violations/location-restored")
@router.post("/v1/violations/punch-out-close")
@router.post("/attendance/location-violation")
@router.post("/_AIP_locationViolation")
async def report_location_violation(
    payload: LocationViolationRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_patrol_db)
):
    try:
        emp_id = payload.employee_oid or payload.employee_id

        # Auto-extract real officer OID from Bearer token if payload has fallback employee_id (<= 1)
        if (not emp_id or emp_id <= 1) and authorization:
            try:
                import base64
                import json
                token_str = authorization.replace("Bearer ", "").strip()
                token_data = json.loads(base64.b64decode(token_str).decode())
                token_emp_id = token_data.get("id") or token_data.get("oid") or token_data.get("employee_id")
                if token_emp_id:
                    emp_id = int(token_emp_id)
            except Exception as token_err:
                print(f"Warning decoding authorization header for location violation: {token_err}")

        if not emp_id or emp_id <= 0:
            emp_id = 10208  # Default to active testing officer if unknown

        ts = format_to_local_ist(payload.location_off_at or payload.timestamp)
        punch_in_id = int(payload.punch_in_id) if payload.punch_in_id and str(payload.punch_in_id).isdigit() else 0
        path = request.url.path

        with get_db_cursor(commit=True) as (conn, cursor):
            if "location-restored" in path or payload.event_type == "DUTY_LOCATION_RESTORED" or payload.location_restored_at:
                restored_ts = format_to_local_ist(payload.location_restored_at or payload.timestamp)
                cursor.execute("""
                    UPDATE FIELD_OFFICER_DUTY_LOCATION_VIOLATION
                    SET location_restored_at = %s,
                        duration = GREATEST(1, TIMESTAMPDIFF(MINUTE, location_off_at, %s))
                    WHERE employee_oid = %s AND location_restored_at IS NULL
                    ORDER BY oid DESC LIMIT 1
                """, (restored_ts, restored_ts, emp_id))
            elif "punch-out-close" in path or payload.event_type == "DUTY_LOCATION_PUNCH_OUT_CLOSE" or payload.punch_out_time:
                po_ts = format_to_local_ist(payload.punch_out_time or payload.timestamp)
                po_id = int(payload.punch_out_id) if payload.punch_out_id and str(payload.punch_out_id).isdigit() else punch_in_id
                cursor.execute("""
                    UPDATE FIELD_OFFICER_DUTY_LOCATION_VIOLATION
                    SET punch_out_id = %s,
                        duration = CASE WHEN location_restored_at IS NULL THEN GREATEST(1, TIMESTAMPDIFF(MINUTE, location_off_at, %s)) ELSE duration END
                    WHERE employee_oid = %s AND location_restored_at IS NULL
                    ORDER BY oid DESC LIMIT 1
                """, (po_id, po_ts, emp_id))
            else:
                cursor.execute("""
                    INSERT INTO FIELD_OFFICER_DUTY_LOCATION_VIOLATION (employee_oid, event_type, created_at, details, location_off_at, punch_in_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (emp_id, payload.event_type or "DUTY_LOCATION_OFF_VIOLATION", ts, payload.details or "Field officer turned off Location (GPS) during active duty shift", ts, punch_in_id))

        # Real-time WebSocket Alert broadcast directly to Area Manager Live Dashboard
        broadcast_payload = {
            "type": "LOCATION_VIOLATION",
            "employee_id": emp_id,
            "employee_oid": emp_id,
            "event_type": payload.event_type,
            "timestamp": ts,
            "message": payload.details or "Field Officer turned OFF Location (GPS) during active duty shift!"
        }
        await GPSManager.broadcast_location(broadcast_payload)

        return {"success": True, "message": "Location violation saved to DB & broadcast to Area Manager dashboard"}
    except Exception as e:
        print(f"Error handling location violation: {e}")
        return {"success": True, "message": "Violation received"}


@router.get("/v1/violations")
@router.get("/attendance/location-violations")
def get_location_violations(
    date: Optional[str] = Query(None),
    employee_id: Optional[int] = Query(None),
    employee_oid: Optional[int] = Query(None),
    empOid: Optional[int] = Query(None),
    db: Session = Depends(get_patrol_db)
):
    try:
        target_emp = employee_oid or empOid or employee_id
        with get_db_cursor(dictionary=True) as (conn, cursor):
            query = """
                SELECT v.*, v.oid, v.employee_oid as employee_id, e.name as officer_name, e.name as employee_name
                FROM FIELD_OFFICER_DUTY_LOCATION_VIOLATION v
                LEFT JOIN EMPLOYEE e ON v.employee_oid = e.oid
            """
            params = []
            conditions = []
            if date:
                conditions.append("DATE(v.created_at) = %s")
                params.append(date)
            if target_emp:
                conditions.append("v.employee_oid = %s")
                params.append(target_emp)
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
            query += " ORDER BY v.oid DESC LIMIT 100"

            cursor.execute(query, params)
            rows = cursor.fetchall()
            return {"success": True, "violations": rows or []}
    except Exception as e:
        print(f"Error fetching location violations: {e}")
        return {"success": False, "violations": []}




