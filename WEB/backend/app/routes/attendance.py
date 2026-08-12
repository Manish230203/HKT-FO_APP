from fastapi import APIRouter, Depends, Query, Header
from typing import Optional
from app.services.attendance_service import (
    get_attendance_records_logic,
    submit_regularization_logic,
    get_regularizations_logic,
    approve_regularization_logic,
    reject_regularization_logic
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
    site_id: Optional[int] = Query(None)
):
    return get_attendance_records_logic(date, client_id, site_id)

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
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

@router.post("/attendance/regularizations/{id}/reject")
def reject_regularization(id: int, user_name: str = Depends(get_current_user_name)):
    res = reject_regularization_logic(id, user_name)
    if not res.get("success"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res
