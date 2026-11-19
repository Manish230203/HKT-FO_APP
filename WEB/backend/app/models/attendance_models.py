from pydantic import BaseModel
from typing import Optional

class AttendanceRequest(BaseModel):
    empOid: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    siteOid: Optional[int] = None
    timestamp: Optional[str] = None

class VerificationRequest(BaseModel):
    empOid: int
