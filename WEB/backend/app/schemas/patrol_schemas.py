from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional, Any

class ShiftStart(BaseModel):
    start_latitude: float
    start_longitude: float
    site_id: Optional[int] = 1

class ShiftEnd(BaseModel):
    end_latitude: float
    end_longitude: float

class PatrolLogRequest(BaseModel):
    site_id: int
    latitude: float
    longitude: float
    scan_type: str = "QR"

class IncidentReportRequest(BaseModel):
    incident_type: str
    risk_category: Optional[str] = None
    latitude: float
    longitude: float
    site_id: Optional[int] = 1
    media_urls: Optional[str] = None
    incident_date: Optional[str] = None
    incident_time: Optional[str] = None
    location_text: Optional[str] = None
    brief_description: Optional[str] = None
    damage_loss: Optional[str] = None
    tentative_costing: Optional[str] = None
    injury_caused: Optional[str] = None
    corrective_action: Optional[str] = None
    remarks: Optional[str] = None

class SOSRequest(BaseModel):
    latitude: float
    longitude: float

class QuestionAnswerRequest(BaseModel):
    question_link_id: int
    answer_value: str
    comment: Optional[str] = None
    media_urls: Optional[str] = None

class ChecklistSubmitRequest(BaseModel):
    latitude: float
    longitude: float
    signature_url: Optional[str] = None

class DashboardResponse(BaseModel):
    officer_status: str
    active_shift_id: Optional[int]
    recent_activities: List[Any]
    pending_checklists: int

class CheckpointVerifyRequest(BaseModel):
    qr_code: str
    checkpoint_id: int
    tour_name: str
    latitude: float
    longitude: float
    site_id: Optional[int] = None

class QuestionAnswerItem(BaseModel):
    link_id: Optional[int] = None
    question_id: int
    answer_value: str
    comment: Optional[str] = None
    photo_base64: Optional[str] = None
    photo_url: Optional[str] = None

class CheckpointChecklistSubmitRequest(BaseModel):
    tour_name: str
    latitude: float
    longitude: float
    site_id: Optional[int] = None
    answers: List[QuestionAnswerItem] = []

class PassBatonRequest(BaseModel):
    tour_name: str
    forwarded_to: int
    reason: str
    latitude: float
    longitude: float
    site_id: Optional[int] = None

