from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.database import Base

class ResponseStatus(enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    REVIEWED = "REVIEWED"
    ARCHIVED = "ARCHIVED"

class SOSAlertStatus(enum.Enum):
    TRIGGERED = "TRIGGERED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    CANCELLED = "CANCELLED"
    RESOLVED = "RESOLVED"


class Shift(Base):
    __tablename__ = "PATROL_SHIFTS"
    id = Column("oid", Integer, primary_key=True, index=True)
    user_id = Column("Employee", Integer, index=True)
    site_id = Column(Integer, index=True)
    start_time = Column(DateTime, default=datetime.now)
    end_time = Column(DateTime, nullable=True)
    start_latitude = Column(Float)
    start_longitude = Column(Float)
    end_latitude = Column(Float, nullable=True)
    end_longitude = Column(Float, nullable=True)
    active_tour = Column(String(100), nullable=True)

class PatrolTour(Base):
    __tablename__ = "PATROL_TOURS"
    id = Column("oid", Integer, primary_key=True, index=True)
    shift_id = Column(Integer, ForeignKey("PATROL_SHIFTS.oid"))
    user_id = Column("Employee", Integer, index=True)
    site_id = Column(Integer, index=True)
    tour_name = Column(String(100))
    start_time = Column(DateTime, default=datetime.now)
    end_time = Column(DateTime, nullable=True)
    status = Column(String(50), default="ongoing") # ongoing, completed, cancelled

class PatrolLog(Base):
    __tablename__ = "PATROL_LOGS"
    id = Column("oid", Integer, primary_key=True, index=True)
    shift_id = Column(Integer, ForeignKey("PATROL_SHIFTS.oid"))
    tour_id = Column(Integer, ForeignKey("PATROL_TOURS.oid"), nullable=True)
    site_id = Column(Integer)
    checkpoint_id = Column(Integer, ForeignKey("PATROL_CHECKPOINTS.oid"), nullable=True)
    scan_time = Column(DateTime, default=datetime.now)
    latitude = Column(Float)
    longitude = Column(Float)
    scan_type = Column(String(50), default="QR") # QR, NFC, GPS
    forwarded_to = Column(Integer, nullable=True)
    reason = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)

class Incident(Base):
    __tablename__ = "PATROL_INCIDENTS"
    id = Column("oid", Integer, primary_key=True, index=True)
    user_id = Column("Employee", Integer)
    site_id = Column(Integer)
    incident_type = Column(String(100), nullable=True)
    risk_category = Column(String(50), nullable=True)
    latitude = Column(Float)
    longitude = Column(Float)
    reported_at = Column(DateTime, default=datetime.now)
    media_urls = Column(Text, nullable=True) # JSON list of URLs/Paths
    is_resolved = Column(Boolean, default=False)
    incident_date = Column(String(50), nullable=True)
    incident_time = Column(String(50), nullable=True)
    location_text = Column(Text, nullable=True)
    brief_description = Column(Text, nullable=True)
    damage_loss = Column(Text, nullable=True)
    tentative_costing = Column(Text, nullable=True)
    injury_caused = Column(Text, nullable=True)
    corrective_action = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)

class Checkpoint(Base):
    __tablename__ = "PATROL_CHECKPOINTS"
    id = Column("oid", Integer, primary_key=True, index=True)
    site_id = Column(Integer, index=True)
    name = Column(String(255), nullable=False)
    qr_code = Column(String(255), unique=True, index=True, nullable=False)
    order = Column(Integer, default=0, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    radius = Column(Integer, default=30)
    created_at = Column(DateTime, default=datetime.now)

class Checklist(Base):
    __tablename__ = "PATROL_CHECKLISTS"
    id = Column("oid", Integer, primary_key=True, index=True)
    title = Column(String(255))
    description = Column(Text)
    industry = Column(String(100))
    company_id = Column(Integer, nullable=True)
    site_ids = Column(Text, nullable=True) # JSON list of site IDs
    required_roles = Column(Text, nullable=True) # JSON list of roles
    is_active = Column(Boolean, default=True)
    checkpoint_id = Column(Integer, ForeignKey("PATROL_CHECKPOINTS.oid"), nullable=True)
    status = Column(String(50), default="INACTIVE", nullable=False)
    loop_type = Column(String(50), default="Return Patrol")
    created_at = Column(DateTime, default=datetime.now)


class Question(Base):
    __tablename__ = "PATROL_QUESTIONS"
    id = Column("oid", Integer, primary_key=True, index=True)
    text = Column(Text)
    response_type = Column(String(50)) # yes_no, text, number
    industry = Column(String(100), nullable=True)
    category = Column(String(100), nullable=True)
    options = Column(Text, nullable=True) # JSON string of options

class ChecklistQuestionLink(Base):
    __tablename__ = "PATROL_CHECKLIST_QUESTION_LINKS"
    id = Column("oid", Integer, primary_key=True, index=True)
    checklist_id = Column(Integer, ForeignKey("PATROL_CHECKLISTS.oid"))
    question_id = Column(Integer, ForeignKey("PATROL_QUESTIONS.oid"))
    order = Column(Integer, default=0)
    is_critical = Column(Boolean, default=False)
    requires_photo = Column(Boolean, default=False)
    requires_video = Column(Boolean, default=False)
    requires_doc = Column(Boolean, default=False)
    requires_comment = Column(Boolean, default=False)

class ChecklistResponse(Base):
    __tablename__ = "PATROL_CHECKLIST_RESPONSES"
    id = Column("oid", Integer, primary_key=True, index=True)
    checklist_id = Column(Integer, ForeignKey("PATROL_CHECKLISTS.oid"))
    user_id = Column("Employee", Integer)
    shift_id = Column(Integer, ForeignKey("PATROL_SHIFTS.oid"), nullable=True)
    site_id = Column(Integer)
    status = Column(SQLEnum(ResponseStatus), default=ResponseStatus.DRAFT)
    created_at = Column(DateTime, default=datetime.now)
    submitted_at = Column(DateTime, nullable=True)
    latitude = Column(Float)
    longitude = Column(Float)

class QuestionAnswer(Base):
    __tablename__ = "PATROL_QUESTION_ANSWERS"
    id = Column("oid", Integer, primary_key=True, index=True)
    response_id = Column(Integer, ForeignKey("PATROL_CHECKLIST_RESPONSES.oid"))
    question_link_id = Column(Integer, ForeignKey("PATROL_CHECKLIST_QUESTION_LINKS.oid"))
    answer_value = Column(Text)
    comment = Column(Text, nullable=True)
    media_urls = Column(Text, nullable=True) # JSON list of URLs/Paths
    answered_at = Column(DateTime, default=datetime.now)

class SOSAlert(Base):
    __tablename__ = "PATROL_SOS_ALERTS"
    id = Column("oid", Integer, primary_key=True, index=True)
    user_id = Column("Employee", Integer)
    shift_id = Column(Integer, ForeignKey("PATROL_SHIFTS.oid"), nullable=True)
    latitude = Column(Float)
    longitude = Column(Float)
    status = Column(SQLEnum(SOSAlertStatus), default=SOSAlertStatus.TRIGGERED)
    triggered_at = Column(DateTime, default=datetime.now)
    resolved_at = Column(DateTime, nullable=True)

class GPSLocationLog(Base):
    __tablename__ = "GPS_LOCATION_LOGS"
    id = Column("oid", Integer, primary_key=True, index=True)
    employee_id = Column("Employee", Integer, index=True, nullable=False)
    shift_id = Column(Integer, ForeignKey("PATROL_SHIFTS.oid"), nullable=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)
    battery_level = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=datetime.now, index=True)

class SiteVisitSession(Base):
    __tablename__ = "SITE_VISIT_SESSIONS"
    id = Column("oid", Integer, primary_key=True, index=True)
    employee_id = Column("Employee", Integer, index=True, nullable=False)
    site_id = Column(Integer, index=True, nullable=True)
    site_name = Column(String(255), nullable=True)
    start_time = Column("check_in_time", DateTime, default=datetime.now, index=True)
    end_time = Column("check_out_time", DateTime, nullable=True)
    duration_minutes = Column(Float, default=0.0)
    status = Column(String(50), default="IN_PROGRESS", nullable=False) # IN_PROGRESS, COMPLETED
    raw_points_count = Column(Integer, default=1, nullable=False)
    entry_latitude = Column(Float, nullable=False)
    entry_longitude = Column(Float, nullable=False)
    exit_latitude = Column(Float, nullable=True)
    exit_longitude = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

class PlannedVisitSchedule(Base):
    __tablename__ = "PLANNED_VISIT_SCHEDULES"
    id = Column("oid", Integer, primary_key=True, index=True)
    employee_id = Column("Employee", Integer, index=True, nullable=False)
    site_id = Column(Integer, index=True, nullable=False)
    site_name = Column(String(255), nullable=True)
    planned_date = Column(DateTime, nullable=False, index=True)
    required_frequency = Column(Integer, default=1, nullable=False)
    min_duration_minutes = Column(Integer, default=15, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
