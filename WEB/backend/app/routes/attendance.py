from fastapi import APIRouter, Depends, Query, Header, Response, HTTPException
from typing import Optional
from datetime import datetime
from app.services.attendance_service import (
    get_attendance_records_logic,
    submit_regularization_logic,
    get_regularizations_logic,
    approve_regularization_logic,
    reject_regularization_logic,
    export_attendance_excel_logic,
    get_attendance_shifts_logic,
    get_attendance_duty_types_logic
)
import base64
import json

def get_current_user_name(authorization: Optional[str] = Header(None)) -> str:
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]
            user_data = json.loads(base64.b64decode(token.encode()).decode())
            return user_data.get("name", "Administrator")
        except Exception:
            pass
    return "Administrator"

router = APIRouter()

@router.get("/attendance/records")
def get_attendance_records(
    date: str = Query(...),
    client_id: Optional[int] = Query(None),
    site_id: Optional[int] = Query(None),
    branch_id: Optional[int] = Query(None),
    designation: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    duty_type: Optional[str] = Query(None)
):
    return get_attendance_records_logic(date, client_id, site_id, branch_id, designation, shift, duty_type)

@router.get("/attendance/shifts")
def get_attendance_shifts(
    client_id: Optional[str] = Query(None),
    site_id: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None)
):
    return get_attendance_shifts_logic(client_id, site_id, branch_id)

@router.get("/attendance/duty-types")
def get_attendance_duty_types():
    return get_attendance_duty_types_logic()


@router.get("/attendance/export-excel")
def export_attendance_excel(
    date: str = Query(...),
    client_id: Optional[str] = Query(None),
    site_id: Optional[str] = Query(None)
):
    excel_bytes = export_attendance_excel_logic(date, client_id, site_id)
    if not excel_bytes:
        raise HTTPException(status_code=400, detail="No attendance records found to export or error generating Excel.")
    
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        filename = f"Attendance_Report_{dt.strftime('%b_%Y')}.xlsx"
    except Exception:
        filename = "Attendance_Report.xlsx"

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/attendance/regularize")
def submit_regularization(payload: dict):
    return submit_regularization_logic(payload)

@router.get("/attendance/regularizations")
def get_regularizations(
    client_id: Optional[int] = Query(None),
    site_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None)
):
    return get_regularizations_logic(client_id, site_id, status)

@router.post("/attendance/regularizations/{id}/approve")
def approve_regularization(id: int, user_name: str = Depends(get_current_user_name)):
    res = approve_regularization_logic(id, user_name)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

@router.post("/attendance/regularizations/{id}/reject")
def reject_regularization(id: int, user_name: str = Depends(get_current_user_name)):
    res = reject_regularization_logic(id, user_name)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

# --- AIP Mobile Attendance Endpoints ---

from fastapi import File, UploadFile, Form
from app.models.attendance_models import AttendanceRequest
from app.services.attendance_service import (
    mark_attendance_logic,
    get_attendance_logs_logic,
    get_today_status_logic,
    get_monthly_stats_logic,
    get_profile_logic,
    validate_selfie,
    detect_shift_logic
)

@router.post("/_AIP_markAttendance")
def mark_attendance(data: AttendanceRequest):
    return mark_attendance_logic(data)

@router.post("/selfieValidation")
async def selfie_validation_endpoint(empOid: int = Form(...), file: UploadFile = File(...)):
    return await validate_selfie(empOid, file)

@router.get("/_AIP_getAttendanceLogs")
def get_attendance_logs(empOid: int = Query(...)):
    return get_attendance_logs_logic(empOid)

@router.get("/_AIP_getTodayStatus")
def get_today_status(empOid: int = Query(...)):
    return get_today_status_logic(empOid)

@router.get("/_AIP_getMonthlyStats")
def get_monthly_stats(empOid: int = Query(...)):
    return get_monthly_stats_logic(empOid)

@router.get("/_AIP_getProfile")
def get_profile(empOid: int = Query(...)):
    return get_profile_logic(empOid)

@router.get("/_AIP_detectShift")
def detect_shift(empOid: int = Query(...), punch_type: str = Query("IN")):
    return detect_shift_logic(empOid, punch_type)

