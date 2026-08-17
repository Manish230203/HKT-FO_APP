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
