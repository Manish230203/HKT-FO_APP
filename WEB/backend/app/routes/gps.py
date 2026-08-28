from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from pydantic import BaseModel
from datetime import datetime

from app.database import get_patrol_db
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
