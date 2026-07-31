from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from ...patrol_db import get_patrol_db
from ..models.patrol_models import Shift, PatrolTour, PatrolLog, Incident, Checklist, ChecklistResponse, SOSAlert, ResponseStatus, Question, ChecklistQuestionLink, QuestionAnswer, Checkpoint
from typing import List, Optional
from sqlalchemy import text, func
import json
import io
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

def filter_checklists_by_site(checklists, emp_site_id):
    """Helper to filter checklists based on site assignment"""
    result = []
    for c in checklists:
        # If no site_ids specified, it's global (allocated for all sites/sides)
        if not c.site_ids or c.site_ids.strip() == "" or c.site_ids.strip() == "[]" or c.site_ids == "null":
            result.append(c)
            continue
            
        try:
            s_ids = json.loads(c.site_ids)
            
            # Ensure s_ids is a list
            if isinstance(s_ids, list):
                if not s_ids: # Empty list is global
                    result.append(c)
                elif emp_site_id:
                    # Convert both to int for comparison to be safe
                    try:
                        emp_site_id_int = int(emp_site_id)
                        s_ids_ints = [int(sid) for sid in s_ids if str(sid).isdigit() or isinstance(sid, int)]
                        if emp_site_id_int in s_ids_ints:
                            result.append(c)
                    except (ValueError, TypeError):
                        # If conversion fails, try direct membership
                        if emp_site_id in s_ids:
                            result.append(c)
            elif isinstance(s_ids, (int, str)):
                # Handle case where it's a single value instead of a list
                if str(emp_site_id) == str(s_ids):
                    result.append(c)
        except Exception:
            pass
    return result

router = APIRouter(tags=["Patrolling Admin"])

def get_current_user(authorization: Optional[str] = Header(None)):
    import base64
    import json
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]
            return json.loads(base64.b64decode(token.encode()).decode())
        except Exception:
            pass
    return {
        "id": 1,
        "name": "Administrator",
        "role": "Admin",
        "employee_id": "ADM001",
        "site_id": None
    }

@router.get("/patrol/dashboard/stats")
def get_admin_stats(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    now = datetime.now()
    today_start = datetime.combine(now.date(), datetime.min.time())
    last_24h = now - timedelta(hours=24)
    
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    active_officers_query = db.query(Shift).filter(Shift.end_time == None)
    sites_patrolled_query = db.query(PatrolLog).filter(PatrolLog.scan_time >= today_start)
    critical_incidents_query = db.query(Incident).filter(Incident.reported_at >= last_24h, Incident.is_resolved == False)
    
    four_hours_ago = now - timedelta(hours=4)
    missed_checkpoints_query = db.query(Shift).filter(
        Shift.start_time <= four_hours_ago,
        Shift.end_time == None
    )
    
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            active_officers_query = active_officers_query.filter(Shift.site_id == user_site_id)
            sites_patrolled_query = sites_patrolled_query.filter(PatrolLog.site_id == user_site_id)
            critical_incidents_query = critical_incidents_query.filter(Incident.site_id == user_site_id)
            missed_checkpoints_query = missed_checkpoints_query.filter(Shift.site_id == user_site_id)
        else:
            return {
                "activeOfficers": 0,
                "sitesPatrolled": 0,
                "criticalIncidents": 0,
                "missedCheckpoints": 0
            }
            
    active_officers = active_officers_query.count()
    sites_patrolled = sites_patrolled_query.distinct(PatrolLog.site_id).count()
    critical_incidents = critical_incidents_query.count()
    missed_checkpoints = missed_checkpoints_query.filter(~Shift.id.in_(db.query(PatrolLog.shift_id))).count()
    
    return {
        "activeOfficers": active_officers,
        "sitesPatrolled": sites_patrolled,
        "criticalIncidents": critical_incidents,
        "missedCheckpoints": missed_checkpoints
    }

@router.get("/incident/", response_model=List[dict])
def get_all_incidents(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    incidents_query = db.query(Incident)
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            incidents_query = incidents_query.filter(Incident.site_id == user_site_id)
        else:
            return []
            
    incidents = incidents_query.order_by(Incident.reported_at.desc()).all()
    result = []
    for inc in incidents:
        media = []
        if inc.media_urls:
            try:
                media = json.loads(inc.media_urls)
            except:
                media = [inc.media_urls] if inc.media_urls else []
        
        # Fetch site, client and employee names
        sql = text("""
            SELECT s.name as site_name, c.name as client_name 
            FROM SITE s 
            LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid 
            WHERE s.oid = :oid
        """)
        site_info = db.execute(sql, {"oid": inc.site_id}).mappings().first() if inc.site_id else None
        site_name = site_info["site_name"] if site_info else "Unknown Site"
        client_name = site_info["client_name"] if site_info else "N/A"
        
        emp_row = db.execute(text("SELECT name, emp_code FROM EMPLOYEE WHERE oid = :oid"), {"oid": inc.user_id}).mappings().first() if inc.user_id else None
        emp_name = emp_row["name"] if emp_row else "Unknown Officer"
        emp_code = emp_row["emp_code"] if emp_row else "Unknown"
                
        result.append({
            "id": inc.id,
            "user_id": inc.user_id,
            "employee_name": emp_name,
            "employee_code": emp_code,
            "site_name": site_name,
            "client_name": client_name,
            "category": inc.incident_type,
            "incident_type": inc.incident_type,
            "fact_found": inc.brief_description,
            "observation": inc.injury_caused,
            "suggestions": inc.corrective_action,
            "want_reminder": False,
            "expected_resolve_time": None,
            "risk_category": inc.risk_category,
            "latitude": inc.latitude,
            "longitude": inc.longitude,
            "reported_at": inc.reported_at,
            "media_urls": media,
            "photo_url": media[0] if media else None,
            "is_resolved": inc.is_resolved,
            "incident_date": inc.incident_date,
            "incident_time": inc.incident_time,
            "location_text": inc.location_text,
            "brief_description": inc.brief_description,
            "damage_loss": inc.damage_loss,
            "tentative_costing": inc.tentative_costing,
            "injury_caused": inc.injury_caused,
            "corrective_action": inc.corrective_action,
            "remarks": inc.remarks
        })
    
    # Also include SOS Alerts
    sos_query = db.query(SOSAlert)
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            sos_query = sos_query.join(Shift, SOSAlert.shift_id == Shift.id).filter(Shift.site_id == user_site_id)
        else:
            sos_query = None
            
    if sos_query:
        sos_alerts = sos_query.order_by(SOSAlert.triggered_at.desc()).all()
        for sos in sos_alerts:
            site_name = "Emergency Location"
            # Try to find site from an active shift if available
            active_shift = db.query(Shift).filter(Shift.id == sos.shift_id).first()
            if active_shift:
                site_name = db.execute(text("SELECT name FROM SITE WHERE oid = :oid"), {"oid": active_shift.site_id}).scalar() or "Emergency Location"
                
            emp_row_sos = db.execute(text("SELECT name, emp_code FROM EMPLOYEE WHERE oid = :oid"), {"oid": sos.user_id}).mappings().first() if sos.user_id else None
            emp_name = emp_row_sos["name"] if emp_row_sos else "Unknown Officer"
            emp_code = emp_row_sos["emp_code"] if emp_row_sos else "Unknown"
     
            result.append({
                "id": f"sos_{sos.id}",
                "user_id": sos.user_id,
                "employee_name": emp_name,
                "employee_code": emp_code,
                "site_name": site_name,
                "category": "EMERGENCY_SOS",
                "incident_type": "EMERGENCY_SOS",
                "fact_found": "SOS Triggered by Officer",
                "brief_description": "SOS Triggered by Officer",
                "latitude": sos.latitude,
                "longitude": sos.longitude,
                "reported_at": sos.triggered_at,
                "is_resolved": sos.status.value == "resolved"
            })
        
    result.sort(key=lambda x: x["reported_at"], reverse=True)
    return result[:50]

@router.patch("/incident/{incident_id}/resolve")
def resolve_incident(incident_id: str, db: Session = Depends(get_patrol_db)):
    if incident_id.startswith("sos_"):
        sos_id = int(incident_id.replace("sos_", ""))
        sos = db.query(SOSAlert).filter(SOSAlert.id == sos_id).first()
        if not sos:
            raise HTTPException(status_code=404, detail="SOS Alert not found")
        from ..models.patrol_models import SOSAlertStatus
        sos.status = SOSAlertStatus.RESOLVED
        sos.resolved_at = datetime.now()
    else:
        inc = db.query(Incident).filter(Incident.id == int(incident_id)).first()
        if not inc:
            raise HTTPException(status_code=404, detail="Incident not found")
        inc.is_resolved = True
    
    db.commit()
    return {"message": "Incident resolved successfully"}

@router.get("/checklist/submissions")
def get_checklist_submissions(db: Session = Depends(get_patrol_db)):
    subs = db.query(ChecklistResponse).filter(ChecklistResponse.status == ResponseStatus.SUBMITTED).order_by(ChecklistResponse.submitted_at.desc()).all()
    result = []
    for s in subs:
        checklist = db.query(Checklist).filter(Checklist.id == s.checklist_id).first()
        # Fetch employee ID
        emp_sql = text("SELECT emp_code FROM EMPLOYEE WHERE oid = :oid")
        emp = db.execute(emp_sql, {"oid": s.user_id}).mappings().first()
        # Fetch site name
        site_sql = text("SELECT name FROM SITE WHERE oid = :oid")
        site = db.execute(site_sql, {"oid": s.site_id}).mappings().first()
        
        result.append({
            "id": s.id,
            "checklist_title": checklist.title if checklist else "Unknown",
            "user_id": s.user_id,
            "employee_id": emp["emp_code"] if emp else "Unknown",
            "submitted_at": s.submitted_at,
            "site_id": s.site_id,
            "site_name": site["name"] if site else "Unknown"
        })
    return result

@router.get("/patrol/logs")
def get_all_patrol_logs(db: Session = Depends(get_patrol_db)):
    logs = db.query(PatrolLog).order_by(PatrolLog.scan_time.desc()).limit(100).all()
    result = []
    for l in logs:
        # Fetch site and employee details
        site = db.execute(text("SELECT name FROM SITE WHERE oid = :oid"), {"oid": l.site_id}).mappings().first()
        
        # Get shift to find employee
        shift = db.query(Shift).filter(Shift.id == l.shift_id).first()
        emp_name = "Unknown"
        if shift:
            emp = db.execute(text("SELECT name FROM EMPLOYEE WHERE oid = :oid"), {"oid": shift.user_id}).mappings().first()
            emp_name = emp["name"] if emp else "Unknown Officer"
            
        result.append({
            "id": l.id,
            "scan_time": l.scan_time,
            "scan_type": l.scan_type,
            "site_name": site["name"] if site else "Unknown Site",
            "employee_name": emp_name,
            "latitude": l.latitude,
            "longitude": l.longitude
        })
    return result

@router.post("/auth/login")
def admin_login(data: dict, db: Session = Depends(get_patrol_db)):
    identifier = data.get("identifier")
    password = data.get("password")
    
    # Password checks disabled for testing purposes
    # if not password:
    #     raise HTTPException(status_code=400, detail="PASSWORD REQUIRED")
        
    # Backend password strength validation (allowing seeded 'password123' for demo/seed data compatibility)
    # if password != "password123":
    #     import re
    #     if (len(password) < 8 or 
    #         not re.search(r"[a-zA-Z]", password) or 
    #         not re.search(r"\d", password) or 
    #         not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password)):
    #         raise HTTPException(status_code=400, detail="Password must be at least 8 characters long and contain letters, numbers, and special characters.")
    
    # Try to find user by mobile, emp_code, or user_account
    try:
        sql = text("""
            SELECT e.name, d.name as role_name, e.emp_code, e.oid, e.SITE as site_id, ua.password_hash
            FROM EMPLOYEE e
            LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
            LEFT JOIN USER_ACCOUNT ua ON ua.EMPLOYEE = e.oid
            WHERE e.mobile = :id OR e.emp_code = :id OR ua.username = :id
            LIMIT 1
        """)
        user = db.execute(sql, {"id": identifier}).mappings().first()
    except Exception:
        # Fallback for backup.sql schema where USER_ACCOUNT uses user_name or doesn't have EMPLOYEE FK
        sql = text("""
            SELECT e.name, d.name as role_name, e.emp_code, e.oid, e.SITE as site_id, 'password123' as password_hash
            FROM EMPLOYEE e
            LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
            WHERE e.mobile = :id OR e.emp_code = :id
            LIMIT 1
        """)
        user = db.execute(sql, {"id": identifier}).mappings().first()
    
    if not user:
        raise HTTPException(status_code=401, detail="NO USER FOUND")
        
    # Password verification disabled for testing purposes
    # stored_password = user.get("password_hash") or "password123"
    # if stored_password != password and password != "password123":
    #     raise HTTPException(status_code=401, detail="INVALID PASSWORD")
    
    user_data = {
        "id": user["oid"],
        "name": user["name"],
        "role": user["role_name"] or "Staff",
        "employee_id": user["emp_code"],
        "site_id": user["site_id"]
    }
    
    import base64
    import json
    token = base64.b64encode(json.dumps(user_data).encode()).decode()
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_data
    }

@router.get("/auth/me")
def get_current_admin(authorization: Optional[str] = Header(None)):
    import base64
    import json
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]
            return json.loads(base64.b64decode(token.encode()).decode())
        except Exception:
            pass
    return {
        "id": 1,
        "name": "Administrator",
        "role": "Admin",
        "employee_id": "ADM001",
        "site_id": None
    }

@router.get("/patrol/search")
def global_search(q: str = "", db: Session = Depends(get_patrol_db)):
    if not q or len(q) < 2:
        return []
    
    results = []
    
    # 1. Search Sites
    sites_sql = text("""
        SELECT s.oid as id, s.name, s.latitude, s.longitude, c.name as client_name
        FROM SITE s
        LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid
        WHERE s.name LIKE :q OR c.name LIKE :q
        LIMIT 10
    """)
    sites = db.execute(sites_sql, {"q": f"%{q}%"}).mappings().all()
    for s in sites:
        results.append({
            "id": s["id"],
            "name": s["name"],
            "subtitle": s["client_name"] or "Site",
            "type": "site",
            "latitude": s["latitude"],
            "longitude": s["longitude"]
        })
        
    # 2. Search Officers
    officers_sql = text("""
        SELECT e.oid as id, e.name, e.emp_code, d.name as role
        FROM EMPLOYEE e
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        WHERE e.name LIKE :q OR e.emp_code LIKE :q
        LIMIT 10
    """)
    officers = db.execute(officers_sql, {"q": f"%{q}%"}).mappings().all()
    for o in officers:
        # Try to find last known location for the officer
        latest_log = db.execute(text("""
            SELECT l.latitude, l.longitude 
            FROM PATROL_LOGS l
            JOIN PATROL_SHIFTS s ON l.shift_id = s.oid
            WHERE s.Employee = :user_id
            ORDER BY l.scan_time DESC
            LIMIT 1
        """), {"user_id": o["id"]}).mappings().first()
        
        results.append({
            "id": o["id"],
            "name": o["name"],
            "subtitle": f"{o['role']} ({o['emp_code']})",
            "type": "officer",
            "latitude": latest_log["latitude"] if latest_log else None,
            "longitude": latest_log["longitude"] if latest_log else None
        })
        
    incidents = db.query(Incident).filter(
        (Incident.incident_type.like(f"%{q}%")) | 
        (Incident.brief_description.like(f"%{q}%"))
    ).limit(10).all()
    for inc in incidents:
        results.append({
            "id": inc.id,
            "name": inc.incident_type,
            "subtitle": inc.brief_description or "Incident",
            "type": "incident",
            "latitude": inc.latitude,
            "longitude": inc.longitude
        })
        
    return results

# --- Dashboard Shims to avoid 404s ---

@router.get("/patrol/live-locations")
def get_live_locations(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    # Fetch real active shifts
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    query = db.query(Shift).filter(Shift.end_time == None)
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            query = query.filter(Shift.site_id == user_site_id)
        else:
            return []
            
    active_shifts = query.all()
    
    locations = []
    for shift in active_shifts:
        # Get latest coordinate from PatrolLog or fallback to Shift start
        latest_log = db.query(PatrolLog).filter(PatrolLog.shift_id == shift.id).order_by(PatrolLog.scan_time.desc()).first()
        
        # Fetch employee details
        emp_sql = text("""
            SELECT e.name, d.name as role 
            FROM EMPLOYEE e 
            LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid 
            WHERE e.oid = :oid
        """)
        emp = db.execute(emp_sql, {"oid": shift.user_id}).mappings().first()
        
        locations.append({
            "officer_name": emp["name"] if emp else f"Officer {shift.user_id}",
            "role": emp["role"] if emp else "Field Officer",
            "latitude": latest_log.latitude if latest_log else shift.start_latitude,
            "longitude": latest_log.longitude if latest_log else shift.start_longitude,
            "shift_start": shift.start_time.isoformat()
        })
        
    return locations

@router.get("/assessments/checklists")
def get_checklists_admin(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    is_active: Optional[str] = Query(None),
    offset: int = Query(0),
    limit: int = Query(100),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    query = db.query(Checklist).order_by(Checklist.created_at.desc())
    
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            query = query.filter(
                (Checklist.site_ids.like(f"[{user_site_id}]")) | 
                (Checklist.site_ids.like(f"%,{user_site_id},%")) | 
                (Checklist.site_ids.like(f"[{user_site_id},%")) | 
                (Checklist.site_ids.like(f"%,{user_site_id}]"))
            )
        else:
            return {"items": [], "total": 0, "offset": offset, "limit": limit}
            
    if search:
        query = query.filter(Checklist.title.like(f"%{search}%"))
    if status:
        query = query.filter(Checklist.status == status.upper())
    if is_active is not None:
        is_active_bool = is_active.lower() == "true"
        query = query.filter(Checklist.is_active == is_active_bool)
        
    total = query.count()
    checklists = query.offset(offset).limit(limit).all()
    
    items = []
    for c in checklists:
        q_count = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == c.id).count()
        # Fetch company name
        company_name = None
        if c.company_id:
            comp_sql = text("SELECT name FROM COMPANY WHERE oid = :oid")
            comp = db.execute(comp_sql, {"oid": c.company_id}).mappings().first()
            company_name = comp["name"] if comp else None
            
        checkpoint_name = None
        if c.checkpoint_id:
            checkpoint_name = db.query(Checkpoint.name).filter(Checkpoint.id == c.checkpoint_id).scalar()
            
        items.append({
            "id": c.id,
            "title": c.title,
            "industry": c.industry,
            "description": c.description,
            "company_id": c.company_id,
            "company_name": company_name,
            "checkpoint_id": c.checkpoint_id,
            "checkpoint_name": checkpoint_name,
            "site_ids": json.loads(c.site_ids) if c.site_ids else [],
            "is_active": c.is_active,
            "status": c.status,
            "loop_type": c.loop_type,
            "question_count": q_count,
            "created_at": c.created_at.isoformat() if c.created_at else None
        })
    return {"items": items, "total": total, "offset": offset, "limit": limit}

@router.get("/assessments/checklists/stats")
def get_checklist_stats(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    query = db.query(Checklist)
    active_query = db.query(Checklist).filter(Checklist.is_active == True)
    
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            site_filter = (
                (Checklist.site_ids.like(f"[{user_site_id}]")) | 
                (Checklist.site_ids.like(f"%,{user_site_id},%")) | 
                (Checklist.site_ids.like(f"[{user_site_id},%")) | 
                (Checklist.site_ids.like(f"%,{user_site_id}]"))
            )
            query = query.filter(site_filter)
            active_query = active_query.filter(site_filter)
        else:
            return {
                "total_checklists": 0,
                "active_checklists": 0,
                "total_questions_used": 0
            }
            
    total = query.count()
    active = active_query.count()
    
    checklist_ids = [c.id for c in query.all()]
    if checklist_ids:
        questions = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id.in_(checklist_ids)).count()
    else:
        questions = 0
        
    return {
        "total_checklists": total,
        "active_checklists": active,
        "total_questions_used": questions
    }

@router.get("/assessments/checklists/{checklist_id}")
def get_checklist_detail(checklist_id: int, db: Session = Depends(get_patrol_db)):
    c = db.query(Checklist).filter(Checklist.id == checklist_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    
    links = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == c.id).all()
    questions = []
    for link in links:
        q = db.query(Question).filter(Question.id == link.question_id).first()
        if q:
            parsed_options = []
            if q.options:
                try:
                    parsed_options = json.loads(q.options)
                    if parsed_options is None:
                        parsed_options = []
                    elif not isinstance(parsed_options, list):
                        parsed_options = [parsed_options]
                except:
                    parsed_options = [q.options]
            questions.append({
                "question_id": q.id,
                "text": q.text,
                "response_type": q.response_type,
                "options": parsed_options,
                "is_critical": link.is_critical,
                "requires_photo": link.requires_photo,
                "requires_video": link.requires_video,
                "requires_doc": link.requires_doc,
                "requires_comment": link.requires_comment
            })
    
    return {
        "id": c.id,
        "title": c.title,
        "industry": c.industry,
        "description": c.description,
        "company_id": c.company_id,
        "checkpoint_id": c.checkpoint_id,
        "site_ids": json.loads(c.site_ids) if c.site_ids else [],
        "required_roles": json.loads(c.required_roles) if c.required_roles else [],
        "is_active": c.is_active,
        "status": c.status,
        "loop_type": c.loop_type,
        "questions": questions
    }

@router.post("/assessments/checklists")
def create_checklist(data: dict, db: Session = Depends(get_patrol_db)):
    status = data.get("status", "INACTIVE").upper()
    if status not in ["DRAFT", "INACTIVE", "ACTIVE"]:
        status = "INACTIVE"
    is_active = (status == "ACTIVE")
    
    new_c = Checklist(
        title=data.get("title"),
        industry=data.get("industry"),
        description=data.get("description"),
        company_id=data.get("company_id"),
        checkpoint_id=data.get("checkpoint_id"),
        site_ids=json.dumps(data.get("site_ids", [])),
        required_roles=json.dumps(data.get("required_roles", [])),
        status=status,
        loop_type=data.get("loop_type", "Return Patrol"),
        is_active=is_active
    )
    db.add(new_c)
    db.flush()
    
    items = data.get("items", [])
    for item in items:
        link = ChecklistQuestionLink(
            checklist_id=new_c.id,
            question_id=item.get("question_id"),
            is_critical=item.get("is_critical", False),
            requires_photo=item.get("requires_photo", False),
            requires_video=item.get("requires_video", False),
            requires_doc=item.get("requires_doc", False),
            requires_comment=item.get("requires_comment", False)
        )
        db.add(link)
    
    db.commit()
    return {"id": new_c.id}

@router.put("/assessments/checklists/{checklist_id}")
def update_checklist(checklist_id: int, data: dict, db: Session = Depends(get_patrol_db)):
    print(f"DEBUG: Updating checklist {checklist_id} with data: {data}")
    c = db.query(Checklist).filter(Checklist.id == checklist_id).first()
    if not c:
        print(f"DEBUG: Checklist {checklist_id} not found")
        raise HTTPException(status_code=404, detail="Checklist not found")
    
    c.title = data.get("title")
    c.industry = data.get("industry")
    c.description = data.get("description")
    c.company_id = data.get("company_id")
    c.checkpoint_id = data.get("checkpoint_id")
    c.site_ids = json.dumps(data.get("site_ids", []))
    c.required_roles = json.dumps(data.get("required_roles", []))
    c.loop_type = data.get("loop_type", "Return Patrol")
    
    status = data.get("status")
    if status:
        status = status.upper()
        if status in ["DRAFT", "INACTIVE", "ACTIVE"]:
            c.status = status
            c.is_active = (status == "ACTIVE")
    
    # Update items: Maintain existing links to avoid breaking foreign keys
    existing_links = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == checklist_id).all()
    existing_map = {l.question_id: l for l in existing_links}
    
    items = data.get("items", [])
    new_links_to_add = []
    processed_link_ids = set()
    
    for item in items:
        qid = item.get("question_id")
        if qid in existing_map:
            # Update existing link
            link = existing_map[qid]
            link.is_critical = item.get("is_critical", False)
            link.requires_photo = item.get("requires_photo", False)
            link.requires_video = item.get("requires_video", False)
            link.requires_doc = item.get("requires_doc", False)
            link.requires_comment = item.get("requires_comment", False)
            processed_link_ids.add(link.id)
        else:
            # Create new link
            link = ChecklistQuestionLink(
                checklist_id=checklist_id,
                question_id=qid,
                is_critical=item.get("is_critical", False),
                requires_photo=item.get("requires_photo", False),
                requires_video=item.get("requires_video", False),
                requires_doc=item.get("requires_doc", False),
                requires_comment=item.get("requires_comment", False)
            )
            db.add(link)
    
    # Delete links that were NOT in the new items list (and are not referenced)
    for l in existing_links:
        if l.id not in processed_link_ids:
            try:
                db.delete(l)
                db.flush() # Try to delete
            except:
                db.rollback() # If referenced, just keep it but maybe mark it as inactive?
                # For now, we'll just skip deletion to avoid 500
                pass

    db.commit()
    return {"success": True}

@router.put("/assessments/checklists/{checklist_id}/link-checkpoint")
def link_checkpoint(checklist_id: int, data: dict, db: Session = Depends(get_patrol_db)):
    c = db.query(Checklist).filter(Checklist.id == checklist_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    c.checkpoint_id = data.get("checkpoint_id")
    db.commit()
    return {"success": True}

@router.patch("/assessments/checklists/{checklist_id}/toggle")
def toggle_checklist_active(checklist_id: int, db: Session = Depends(get_patrol_db)):
    c = db.query(Checklist).filter(Checklist.id == checklist_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    c.is_active = not c.is_active
    if c.is_active:
        c.status = "ACTIVE"
    else:
        c.status = "INACTIVE"
    db.commit()
    return {"id": c.id, "is_active": c.is_active, "status": c.status}

@router.patch("/assessments/checklists/{checklist_id}/publish")
def publish_checklist(checklist_id: int, db: Session = Depends(get_patrol_db)):
    c = db.query(Checklist).filter(Checklist.id == checklist_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
    q_count = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == checklist_id).count()
    if q_count == 0:
        raise HTTPException(status_code=400, detail="Cannot publish checklist with 0 questions")
    c.status = "INACTIVE"
    c.is_active = False
    db.commit()
    return {"id": c.id, "status": c.status, "is_active": c.is_active}

@router.get("/assessments/checklists/{checklist_id}/export")
def export_checklist_excel(checklist_id: int, db: Session = Depends(get_patrol_db)):
    c = db.query(Checklist).filter(Checklist.id == checklist_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist not found")
        
    company_name = "N/A"
    if c.company_id:
        try:
            comp_sql = text("SELECT name FROM COMPANY WHERE oid = :oid")
            comp = db.execute(comp_sql, {"oid": c.company_id}).mappings().first()
            if comp:
                company_name = comp["name"]
        except Exception as e:
            print(f"Error fetching company: {e}")
            
    site_name = "N/A"
    if c.site_ids:
        try:
            site_ids = json.loads(c.site_ids)
            if site_ids and len(site_ids) > 0:
                site_sql = text("SELECT name FROM SITE WHERE oid = :oid")
                site_row = db.execute(site_sql, {"oid": site_ids[0]}).mappings().first()
                if site_row:
                    site_name = site_row["name"]
        except Exception as e:
            print(f"Error fetching site: {e}")
            
    checkpoint_name = "N/A"
    if c.checkpoint_id:
        try:
            checkpoint_name = db.query(Checkpoint.name).filter(Checkpoint.id == c.checkpoint_id).scalar() or "N/A"
        except Exception as e:
            print(f"Error fetching checkpoint: {e}")
            
    role_name = "All Roles"
    if c.required_roles:
        try:
            roles = json.loads(c.required_roles)
            if roles and len(roles) > 0:
                role_name = ", ".join(roles)
        except Exception as e:
            print(f"Error formatting role: {e}")
            
    links = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == c.id).order_by(ChecklistQuestionLink.order, ChecklistQuestionLink.id).all()
    questions_list = []
    for link in links:
        q = db.query(Question).filter(Question.id == link.question_id).first()
        if q:
            questions_list.append({
                "text": q.text,
                "response_type": q.response_type,
                "category": q.category or "N/A"
            })
            
    wb = Workbook()
    ws = wb.active
    ws.title = "Checklist"
    ws.views.sheetView[0].showGridLines = True
    
    ws.merge_cells("A1:D1")
    ws["A1"] = "CHECKLIST SHEET DETAILS"
    ws["A1"].font = Font(name="Calibri", size=16, bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill(start_color="1F497D", end_color="1F497D", fill_type="solid")
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 40
    
    thin_side = Side(style='thin', color='D3D3D3')
    thin_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    
    meta_info = [
        ("Checklist Name:", c.title, "Industry:", c.industry or "N/A"),
        ("Company:", company_name, "Site:", site_name),
        ("Checkpoint:", checkpoint_name, "Role:", role_name),
        ("Status:", c.status, "Created By:", "Administrator"),
        ("Created Date:", c.created_at.strftime("%Y-%m-%d %H:%M:%S") if c.created_at else "N/A", "", "")
    ]
    
    row_idx = 3
    for row in meta_info:
        ws.cell(row=row_idx, column=1, value=row[0]).font = Font(bold=True)
        ws.cell(row=row_idx, column=2, value=row[1])
        if row[2]:
            ws.cell(row=row_idx, column=3, value=row[2]).font = Font(bold=True)
            ws.cell(row=row_idx, column=4, value=row[3])
        row_idx += 1
        
    row_idx += 1
    
    headers = ["Sr No", "Question", "Question Type", "Category"]
    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=row_idx, column=col_idx, value=h)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border
        
    ws.row_dimensions[row_idx].height = 25
    row_idx += 1
    
    for idx, q in enumerate(questions_list, 1):
        cell_sr = ws.cell(row=row_idx, column=1, value=idx)
        cell_sr.alignment = Alignment(horizontal="center", vertical="center")
        cell_sr.border = thin_border
        
        cell_q = ws.cell(row=row_idx, column=2, value=q["text"])
        cell_q.alignment = Alignment(wrap_text=True, vertical="center")
        cell_q.border = thin_border
        
        raw_type = q["response_type"]
        nice_type = raw_type
        if raw_type.lower() == "yes_no" or raw_type.lower() == "yes / no / na":
            nice_type = "Yes/No"
        elif raw_type.lower() == "mcq" or raw_type.lower() == "multiple choice":
            nice_type = "MCQ"
        elif raw_type.lower() == "text":
            nice_type = "Text"
            
        cell_type = ws.cell(row=row_idx, column=3, value=nice_type)
        cell_type.alignment = Alignment(horizontal="center", vertical="center")
        cell_type.border = thin_border
        
        cell_cat = ws.cell(row=row_idx, column=4, value=q["category"])
        cell_cat.alignment = Alignment(horizontal="center", vertical="center")
        cell_cat.border = thin_border
        
        q_len = len(q["text"])
        if q_len > 100:
            ws.row_dimensions[row_idx].height = 40
        elif q_len > 50:
            ws.row_dimensions[row_idx].height = 30
        else:
            ws.row_dimensions[row_idx].height = 20
            
        row_idx += 1
        
    ws.column_dimensions["A"].width = 8
    ws.column_dimensions["B"].width = 50
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["D"].width = 20
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    safe_title = "".join([char if char.isalnum() else "_" for char in c.title.lower()])
    filename = f"{safe_title}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.get("/assessments/tours/export")
def export_tour_excel(tour_name: str, site_id: Optional[int] = Query(None), db: Session = Depends(get_patrol_db)):
    # Find all checklists matching this tour name prefix for this site
    query = db.query(Checklist).filter(
        Checklist.is_active == True
    )
    checklists = query.all()
    
    # Filter matching checklists
    tour_checklists = []
    for c in checklists:
        parts = c.title.split(" - ")
        c_tour_name = parts[0]
        if c_tour_name == tour_name:
            if site_id:
                import json
                try:
                    c_site_ids = json.loads(c.site_ids) if c.site_ids else []
                    if site_id not in c_site_ids:
                        continue
                except:
                    continue
            tour_checklists.append(c)
            
    if not tour_checklists:
        raise HTTPException(status_code=404, detail="No checklists found for this tour")
        
    wb = Workbook()
    # Remove default sheet
    default_sheet = wb.active
    wb.remove(default_sheet)
    
    for idx, c in enumerate(tour_checklists):
        parts = c.title.split(" - ")
        checkpoint_label = parts[1] if len(parts) > 1 else c.title
        # sheet titles must be <= 31 chars and cannot contain certain chars
        sheet_title = checkpoint_label[:30].replace("[", "").replace("]", "").replace("*", "").replace("?", "").replace(":", "").replace("/", "").replace("\\", "")
        
        ws = wb.create_sheet(title=sheet_title)
        ws.views.sheetView[0].showGridLines = True
        
        company_name = "N/A"
        if c.company_id:
            try:
                comp_sql = text("SELECT name FROM COMPANY WHERE oid = :oid")
                comp = db.execute(comp_sql, {"oid": c.company_id}).mappings().first()
                if comp:
                    company_name = comp["name"]
            except Exception:
                pass
                
        site_name = "N/A"
        if c.site_ids:
            try:
                site_ids = json.loads(c.site_ids)
                if site_ids and len(site_ids) > 0:
                    site_sql = text("SELECT name FROM SITE WHERE oid = :oid")
                    site_row = db.execute(site_sql, {"oid": site_ids[0]}).mappings().first()
                    if site_row:
                        site_name = site_row["name"]
            except Exception:
                pass
                
        checkpoint_name = "N/A"
        if c.checkpoint_id:
            try:
                checkpoint_name = db.query(Checkpoint.name).filter(Checkpoint.id == c.checkpoint_id).scalar() or "N/A"
            except Exception:
                pass
                
        role_name = "All Roles"
        if c.required_roles:
            try:
                roles = json.loads(c.required_roles)
                if roles and len(roles) > 0:
                    role_name = ", ".join(roles)
            except Exception:
                pass
                
        links = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == c.id).order_by(ChecklistQuestionLink.order, ChecklistQuestionLink.id).all()
        questions_list = []
        for link in links:
            q = db.query(Question).filter(Question.id == link.question_id).first()
            if q:
                questions_list.append({
                    "text": q.text,
                    "response_type": q.response_type,
                    "category": q.category or "N/A"
                })
                
        ws.merge_cells("A1:D1")
        ws["A1"] = f"CHECKLIST DETAILS: {c.title}"
        ws["A1"].font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
        ws["A1"].fill = PatternFill(start_color="1F497D", end_color="1F497D", fill_type="solid")
        ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 35
        
        thin_side = Side(style='thin', color='D3D3D3')
        thin_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
        
        meta_info = [
            ("Tour / Checklist Name:", c.title, "Industry:", c.industry or "N/A"),
            ("Company:", company_name, "Site:", site_name),
            ("Checkpoint:", checkpoint_name, "Role:", role_name),
            ("Status:", c.status, "Created By:", "Administrator"),
            ("Created Date:", c.created_at.strftime("%Y-%m-%d %H:%M:%S") if c.created_at else "N/A", "", "")
        ]
        
        row_idx = 3
        for row in meta_info:
            ws.cell(row=row_idx, column=1, value=row[0]).font = Font(bold=True)
            ws.cell(row=row_idx, column=2, value=row[1])
            if row[2]:
                ws.cell(row=row_idx, column=3, value=row[2]).font = Font(bold=True)
                ws.cell(row=row_idx, column=4, value=row[3])
            
            for col in range(1, 5):
                ws.cell(row=row_idx, column=col).border = thin_border
            row_idx += 1
            
        row_idx += 1
        
        headers = ["Sr No", "Question", "Question Type", "Category"]
        for col_idx, h in enumerate(headers, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=h)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border
        ws.row_dimensions[row_idx].height = 25
        row_idx += 1
        
        for q_idx, q in enumerate(questions_list, 1):
            cell_sr = ws.cell(row=row_idx, column=1, value=q_idx)
            cell_sr.alignment = Alignment(horizontal="center", vertical="center")
            cell_sr.border = thin_border
            
            cell_q = ws.cell(row=row_idx, column=2, value=q["text"])
            cell_q.alignment = Alignment(wrap_text=True, vertical="center")
            cell_q.border = thin_border
            
            raw_type = q["response_type"]
            nice_type = raw_type
            if raw_type.lower() == "yes_no" or raw_type.lower() == "yes / no / na":
                nice_type = "Yes/No"
            elif raw_type.lower() == "mcq" or raw_type.lower() == "multiple choice":
                nice_type = "MCQ"
            elif raw_type.lower() == "text":
                nice_type = "Text"
                
            cell_type = ws.cell(row=row_idx, column=3, value=nice_type)
            cell_type.alignment = Alignment(horizontal="center", vertical="center")
            cell_type.border = thin_border
            
            cell_cat = ws.cell(row=row_idx, column=4, value=q["category"])
            cell_cat.alignment = Alignment(horizontal="center", vertical="center")
            cell_cat.border = thin_border
            
            q_len = len(q["text"])
            if q_len > 100:
                ws.row_dimensions[row_idx].height = 40
            elif q_len > 50:
                ws.row_dimensions[row_idx].height = 30
            else:
                ws.row_dimensions[row_idx].height = 20
                
            row_idx += 1
            
        ws.column_dimensions["A"].width = 8
        ws.column_dimensions["B"].width = 50
        ws.column_dimensions["C"].width = 18
        ws.column_dimensions["D"].width = 20
        
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"tour_{tour_name.lower().replace(' ', '_')}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@router.delete("/assessments/checklists/{checklist_id}")
def delete_checklist(checklist_id: int, db: Session = Depends(get_patrol_db)):
    try:
        # 1. Check if checklist exists
        c = db.query(Checklist).filter(Checklist.id == checklist_id).first()
        if not not c: # Standard check
            pass
        if not c:
            raise HTTPException(status_code=404, detail="Checklist not found")
            
        # 2. Get all response IDs for this checklist
        responses = db.query(ChecklistResponse).filter(ChecklistResponse.checklist_id == checklist_id).all()
        response_ids = [r.id for r in responses]
        
        # 3. Delete Question Answers for these responses
        if response_ids:
            db.query(QuestionAnswer).filter(QuestionAnswer.response_id.in_(response_ids)).delete(synchronize_session=False)
            
        # 4. Delete the Responses themselves
        db.query(ChecklistResponse).filter(ChecklistResponse.checklist_id == checklist_id).delete(synchronize_session=False)
        
        # 5. Delete Question Links (the association with questions)
        db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == checklist_id).delete(synchronize_session=False)
        
        # 6. Finally delete the Checklist
        db.delete(c)
        db.commit()
        return {"success": True, "message": "Checklist and all associated data deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Deep Delete Failed: {str(e)}")

@router.get("/assessments/questions")
def get_questions_admin(
    search: str = None,
    industry: str = None,
    category: str = None,
    response_type: str = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_patrol_db)
):
    query = db.query(Question)
    if search:
        query = query.filter(Question.text.ilike(f"%{search}%"))
    if industry:
        query = query.filter(Question.industry == industry)
    if category:
        query = query.filter(Question.category == category)
    if response_type:
        if response_type.lower() in ["yes_no", "yes/no/na", "yes / no / na"]:
            query = query.filter(Question.response_type.in_(["Yes / No / NA", "yes_no", "Yes/No/NA"]))
        elif response_type.lower() in ["mcq", "multiple choice", "multiple_choice"]:
            query = query.filter(Question.response_type.in_(["Multiple Choice", "mcq", "multiple_choice"]))
        elif response_type.lower() in ["text", "free text", "free_text"]:
            query = query.filter(Question.response_type.in_(["Free Text", "text", "free_text"]))
        else:
            query = query.filter(Question.response_type.ilike(response_type))

    total = query.count()
    questions = query.offset(offset).limit(limit).all()
    
    items = []
    for q in questions:
        parsed_options = []
        if q.options:
            try:
                parsed_options = json.loads(q.options)
                if parsed_options is None:
                    parsed_options = []
                elif not isinstance(parsed_options, list):
                    parsed_options = [parsed_options]
            except:
                parsed_options = [q.options]
        items.append({
            "id": q.id,
            "text": q.text,
            "response_type": q.response_type,
            "industry": q.industry,
            "category": q.category,
            "company_name": "HumanKind Technologies",
            "options": parsed_options
        })
    return {"items": items, "total": total, "offset": offset, "limit": limit}

@router.post("/assessments/questions")
def create_question(data: dict, db: Session = Depends(get_patrol_db)):
    new_q = Question(
        text=data.get("text"),
        response_type=data.get("response_type"),
        industry=data.get("industry"),
        category=data.get("category"),
        options=json.dumps(data.get("options", []))
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    return {"id": new_q.id}

@router.get("/assessments/questions/stats")
def get_question_stats(db: Session = Depends(get_patrol_db)):
    total = db.query(Question).count()
    return {
        "total_questions": total,
        "active_industries": 3,
        "avg_usage_rate": 85.0
    }

@router.get("/assessments/filter-options")
def get_filter_options(db: Session = Depends(get_patrol_db)):
    try:
        # Get unique industries
        industries_query = db.query(Question.industry).distinct().all()
        industries = [i[0] for i in industries_query if i[0]]
        
        # Get unique categories
        categories_query = db.query(Question.category).distinct().all()
        categories = [c[0] for c in categories_query if c[0]]
        
        default_industries = [
            "Pharmaceutical Industry (Pharma)",
            "Educational Institute / School / College",
            "Warehouse & Logistics",
            "Automobile Industry",
            "Manufacturing Industry",
            "Food & FMCG Industry",
            "Hotel & Hospitality",
            "IT / BPO / Corporate Office",
            "Residential Society / Housing Complex"
        ]
        default_categories = ["Security", "Safety & health"]
        
        # Calculate counts per industry
        counts = db.query(Question.industry, func.count(Question.id)).group_by(Question.industry).all()
        industry_counts = {c[0]: c[1] for c in counts if c[0]}
        
        all_industries = list(set(industries + default_industries))
        industry_counts_map = {ind: industry_counts.get(ind, 0) for ind in all_industries}
        total_questions = db.query(Question).count()
        
        return {
            "industries": all_industries,
            "categories": list(set(categories + default_categories)),
            "industry_counts": industry_counts_map,
            "total_questions": total_questions
        }
    except Exception as e:
        default_inds = [
            "Pharmaceutical Industry (Pharma)",
            "Educational Institute / School / College",
            "Warehouse & Logistics",
            "Automobile Industry",
            "Manufacturing Industry",
            "Food & FMCG Industry",
            "Hotel & Hospitality",
            "IT / BPO / Corporate Office",
            "Residential Society / Housing Complex"
        ]
        return {
            "industries": default_inds,
            "categories": ["Security", "Safety & health"],
            "industry_counts": {ind: 0 for ind in default_inds},
            "total_questions": 0
        }

@router.put("/assessments/questions/{question_id}")
def update_question(question_id: int, data: dict, db: Session = Depends(get_patrol_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    if "text" in data:
        q.text = data["text"]
    if "response_type" in data:
        q.response_type = data["response_type"]
    if "industry" in data:
        q.industry = data["industry"]
    if "category" in data:
        q.category = data["category"]
    if "options" in data:
        q.options = json.dumps(data["options"])
        
    db.commit()
    db.refresh(q)
    return {"success": True, "message": "Question updated successfully"}

@router.delete("/assessments/questions/{question_id}")
def delete_question(question_id: int, db: Session = Depends(get_patrol_db)):
    try:
        q = db.query(Question).filter(Question.id == question_id).first()
        if not q:
            raise HTTPException(status_code=404, detail="Question not found")
            
        # 1. Get all ChecklistQuestionLink IDs referencing this question
        links = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.question_id == question_id).all()
        link_ids = [l.id for l in links]
        
        # 2. Delete all QuestionAnswers referencing these links to prevent foreign key violations
        if link_ids:
            db.query(QuestionAnswer).filter(QuestionAnswer.question_link_id.in_(link_ids)).delete(synchronize_session=False)
            
        # 3. Delete the ChecklistQuestionLinks themselves
        db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.question_id == question_id).delete(synchronize_session=False)
        
        # 4. Delete the Question
        db.delete(q)
        db.commit()
        return {"success": True, "message": "Question and associated links/answers deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Deep Delete Question Failed: {str(e)}")

@router.get("/assessments/clients")
def get_clients(db: Session = Depends(get_patrol_db)):
    sql = text("SELECT oid as id, name FROM CLIENTT ORDER BY name ASC")
    clients = db.execute(sql).mappings().all()
    return list(clients)

@router.get("/assessments/branches")
def get_branches(db: Session = Depends(get_patrol_db)):
    sql = text("SELECT oid as id, name FROM BRANCH ORDER BY name ASC")
    branches = db.execute(sql).mappings().all()
    return [dict(b) for b in branches]

@router.get("/assessments/submissions")
def get_submissions_list(
    status: str = "all", 
    checklist_id: str = "all", 
    client_id: str = "all",
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    from sqlalchemy import and_
    query = db.query(ChecklistResponse).join(
        PatrolTour,
        and_(
            ChecklistResponse.shift_id == PatrolTour.shift_id,
            PatrolTour.status == "completed",
            ChecklistResponse.submitted_at >= PatrolTour.start_time,
            ChecklistResponse.submitted_at <= PatrolTour.end_time
        )
    )
    
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            query = query.filter(ChecklistResponse.site_id == user_site_id)
        else:
            return {"items": [], "total": 0, "limit": limit, "offset": 0}
            
    if status != "all":
        query = query.filter(ChecklistResponse.status == status)
    if checklist_id != "all":
        query = query.filter(ChecklistResponse.checklist_id == int(checklist_id))
    
    if client_id != "all":
        # Filter responses by sites that belong to the specified client
        site_ids_res = db.execute(text("SELECT oid FROM SITE WHERE CLIENTT = :cid"), {"cid": int(client_id)}).all()
        site_ids = [row[0] for row in site_ids_res]
        if site_ids:
            query = query.filter(ChecklistResponse.site_id.in_(site_ids))
        else:
            # If no sites found for client, return empty list
            query = query.filter(ChecklistResponse.id == -1)
    
    subs = query.order_by(ChecklistResponse.submitted_at.desc()).limit(limit).all()
    items = []
    for s in subs:
        checklist = db.query(Checklist).filter(Checklist.id == s.checklist_id).first()
        emp_sql = text("SELECT emp_code, name FROM EMPLOYEE WHERE oid = :oid")
        emp = db.execute(emp_sql, {"oid": s.user_id}).mappings().first()
        site_sql = text("SELECT name FROM SITE WHERE oid = :oid")
        site = db.execute(site_sql, {"oid": s.site_id}).mappings().first()
        
        # Count questions
        q_count = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == s.checklist_id).count()
        a_count = db.query(QuestionAnswer).filter(QuestionAnswer.response_id == s.id).count()
        
        items.append({
            "id": s.id,
            "checklist_id": s.checklist_id,
            "checklist_title": checklist.title if checklist else "Unknown",
            "user_id": s.user_id,
            "employee_id": emp["emp_code"] if emp else "Unknown",
            "employee_name": emp["name"] if emp else "Unknown",
            "status": s.status.value,
            "site_name": site["name"] if site else "Unknown",
            "answered_questions": a_count,
            "total_questions": q_count,
            "completion_percentage": int((a_count / q_count * 100)) if q_count > 0 else 0,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
            "latitude": s.latitude,
            "longitude": s.longitude
        })
    return {"items": items, "total": len(items), "limit": limit, "offset": 0}

@router.get("/assessments/submissions/stats")
def get_submission_stats(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    from sqlalchemy import and_
    base_query = db.query(ChecklistResponse).join(
        PatrolTour,
        and_(
            ChecklistResponse.shift_id == PatrolTour.shift_id,
            PatrolTour.status == "completed",
            ChecklistResponse.submitted_at >= PatrolTour.start_time,
            ChecklistResponse.submitted_at <= PatrolTour.end_time
        )
    )
    
    total_query = base_query
    submitted_query = base_query.filter(ChecklistResponse.status == ResponseStatus.SUBMITTED)
    drafts_query = base_query.filter(ChecklistResponse.status == ResponseStatus.DRAFT)
    reviewed_query = base_query.filter(ChecklistResponse.status == ResponseStatus.REVIEWED)
    
    today_start = datetime.combine(datetime.now().date(), datetime.min.time())
    today_query = base_query.filter(ChecklistResponse.submitted_at >= today_start)
    
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            total_query = total_query.filter(ChecklistResponse.site_id == user_site_id)
            submitted_query = submitted_query.filter(ChecklistResponse.site_id == user_site_id)
            drafts_query = drafts_query.filter(ChecklistResponse.site_id == user_site_id)
            reviewed_query = reviewed_query.filter(ChecklistResponse.site_id == user_site_id)
            today_query = today_query.filter(ChecklistResponse.site_id == user_site_id)
        else:
            return {
                "total_submissions": 0,
                "submitted": 0,
                "drafts": 0,
                "reviewed": 0,
                "today_submissions": 0
            }
            
    return {
        "total_submissions": total_query.count(),
        "submitted": submitted_query.count(),
        "drafts": drafts_query.count(),
        "reviewed": reviewed_query.count(),
        "today_submissions": today_query.count()
    }

@router.get("/assessments/submissions/{submission_id}")
def get_submission_detail(
    submission_id: int, 
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    s = db.query(ChecklistResponse).filter(ChecklistResponse.id == submission_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if s.site_id != user_site_id:
            raise HTTPException(status_code=403, detail="Access denied to this submission report")
    
    checklist = db.query(Checklist).filter(Checklist.id == s.checklist_id).first()
    emp_sql = text("SELECT emp_code, name FROM EMPLOYEE WHERE oid = :oid")
    emp = db.execute(emp_sql, {"oid": s.user_id}).mappings().first()
    site_sql = text("SELECT name FROM SITE WHERE oid = :oid")
    site = db.execute(site_sql, {"oid": s.site_id}).mappings().first()
    
    # Fetch answers
    answers = []
    ans_rows = db.query(QuestionAnswer).filter(QuestionAnswer.response_id == s.id).all()
    for a in ans_rows:
        link = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.id == a.question_link_id).first()
        q = db.query(Question).filter(Question.id == link.question_id).first() if link else None
        media = []
        if a.media_urls:
            try:
                media = json.loads(a.media_urls)
            except:
                media = [a.media_urls] if a.media_urls else []
                
        answers.append({
            "id": a.id,
            "question_text": q.text if q else "Deleted Question",
            "is_critical": link.is_critical if link else False,
            "answer_value": a.answer_value,
            "comment": a.comment,
            "photo_urls": media,
            "is_compliant": a.answer_value == "Yes"
        })
    
    return {
        "id": s.id,
        "checklist_title": checklist.title if checklist else "Unknown",
        "employee_id": emp["emp_code"] if emp else "Unknown",
        "status": s.status.value,
        "site_name": site["name"] if site else "Unknown",
        "latitude": s.latitude,
        "longitude": s.longitude,
        "signature_url": None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        "answers": answers
    }

@router.patch("/assessments/submissions/{submission_id}/review")
def review_submission(submission_id: int, db: Session = Depends(get_patrol_db)):
    s = db.query(ChecklistResponse).filter(ChecklistResponse.id == submission_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    s.status = ResponseStatus.REVIEWED
    db.commit()
    return {"success": True}

@router.get("/locations/companies")
def get_locations_companies(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    # Fetch real companies and their sites
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    companies_sql = text("SELECT oid as id, name FROM COMPANY")
    companies = db.execute(companies_sql).mappings().all()
    
    result_companies = []
    for company in companies:
        if role in ["supervisor", "field officer", "main gate supervisor"]:
            if user_site_id:
                sites_sql = text("""
                    SELECT s.oid as id, s.name, s.latitude, s.longitude, s.geofence_data, s.geofence_type, c.name as client_name 
                    FROM SITE s 
                    LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid 
                    WHERE s.oid = :user_site_id AND s.BRANCH IN (SELECT oid FROM BRANCH WHERE COMPANY = :company_id)
                """)
                sites = db.execute(sites_sql, {"company_id": company["id"], "user_site_id": user_site_id}).mappings().all()
            else:
                sites = []
        else:
            sites_sql = text("""
                SELECT s.oid as id, s.name, s.latitude, s.longitude, s.geofence_data, s.geofence_type, c.name as client_name 
                FROM SITE s 
                LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid 
                WHERE s.BRANCH IN (SELECT oid FROM BRANCH WHERE COMPANY = :company_id)
            """)
            sites = db.execute(sites_sql, {"company_id": company["id"]}).mappings().all()
        
        sites_list = []
        for site in sites:
            site_dict = dict(site)
            if site_dict.get("geofence_data"):
                try:
                    site_dict["geofence_data"] = json.loads(site_dict["geofence_data"])
                except:
                    pass
            sites_list.append(site_dict)

        if sites_list or role not in ["supervisor", "field officer", "main gate supervisor"]:
            result_companies.append({
                "id": company["id"],
                "name": company["name"],
                "sites": sites_list
            })
    return result_companies

@router.get("/assessments/companies")
def get_companies_list(db: Session = Depends(get_patrol_db)):
    sql = text("SELECT oid as id, name FROM COMPANY")
    rows = db.execute(sql).mappings().all()
    return [dict(r) for r in rows]

@router.get("/assessments/sites")
def get_sites_list(
    company_id: int = None, 
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            sql = text("""
                SELECT s.oid as id, s.name, s.geofence_data, s.geofence_type, c.name as client_name 
                FROM SITE s 
                LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid
                WHERE s.oid = :user_site_id
            """)
            rows = db.execute(sql, {"user_site_id": user_site_id}).mappings().all()
        else:
            return []
    else:
        if company_id:
            sql = text("""
                SELECT s.oid as id, s.name, s.BRANCH, s.geofence_data, s.geofence_type, c.name as client_name 
                FROM SITE s 
                LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid 
                WHERE s.CLIENTT = :company_id
            """)
            rows = db.execute(sql, {"company_id": company_id}).mappings().all()
        else:
            sql = text("""
                SELECT s.oid as id, s.name, s.geofence_data, s.geofence_type, c.name as client_name 
                FROM SITE s 
                LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid
            """)
            rows = db.execute(sql).mappings().all()
    
    result = []
    for r in rows:
        site_dict = dict(r)
        if site_dict.get("geofence_data"):
            try:
                site_dict["geofence_data"] = json.loads(site_dict["geofence_data"])
            except:
                pass
        result.append(site_dict)
    return result

@router.get("/assessments/roles")
def get_roles_list():
    return ["Supervisor", "Field Officer", "Security Guard", "Lady Security Guard"]

@router.post("/locations/sites")
def add_site(data: dict, db: Session = Depends(get_patrol_db)):
    # Find a default branch if not provided (using first branch of company)
    company_id = data.get("company_id")
    client_id = data.get("client_id")
    branch_sql = text("SELECT oid FROM BRANCH WHERE COMPANY = :company_id LIMIT 1")
    branch = db.execute(branch_sql, {"company_id": company_id}).mappings().first()
    branch_id = branch["oid"] if branch else 1
    
    geofence_data = data.get("geofence_data")
    if isinstance(geofence_data, (list, dict)):
        geofence_data = json.dumps(geofence_data)

    sql = text("""
        INSERT INTO SITE (name, latitude, longitude, BRANCH, CLIENTT, geofence_data, geofence_type) 
        VALUES (:name, :latitude, :longitude, :branch_id, :client_id, :geofence_data, :geofence_type)
    """)
    db.execute(sql, {
        "name": data.get("name"),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "branch_id": branch_id,
        "client_id": client_id,
        "geofence_data": geofence_data,
        "geofence_type": data.get("geofence_type", "POLYGON")
    })
    db.commit()
    return {"success": True, "message": "Site added successfully"}

@router.put("/locations/sites/{site_id}")
def update_site(site_id: int, data: dict, db: Session = Depends(get_patrol_db)):
    geofence_data = data.get("geofence_data")
    if isinstance(geofence_data, (list, dict)):
        geofence_data = json.dumps(geofence_data)

    company_id = data.get("company_id")
    branch_id = None
    if company_id:
        branch_sql = text("SELECT oid FROM BRANCH WHERE COMPANY = :company_id LIMIT 1")
        branch = db.execute(branch_sql, {"company_id": company_id}).mappings().first()
        if branch:
            branch_id = branch["oid"]

    if branch_id:
        sql = text("""
            UPDATE SITE 
            SET name = :name, 
                latitude = :latitude, 
                longitude = :longitude, 
                CLIENTT = :client_id,
                BRANCH = :branch_id,
                geofence_data = :geofence_data,
                geofence_type = :geofence_type
            WHERE oid = :site_id
        """)
        db.execute(sql, {
            "name": data.get("name"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "client_id": data.get("client_id"),
            "branch_id": branch_id,
            "geofence_data": geofence_data,
            "geofence_type": data.get("geofence_type", "POLYGON"),
            "site_id": site_id
        })
    else:
        sql = text("""
            UPDATE SITE 
            SET name = :name, 
                latitude = :latitude, 
                longitude = :longitude, 
                CLIENTT = :client_id,
                geofence_data = :geofence_data,
                geofence_type = :geofence_type
            WHERE oid = :site_id
        """)
        db.execute(sql, {
            "name": data.get("name"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "client_id": data.get("client_id"),
            "geofence_data": geofence_data,
            "geofence_type": data.get("geofence_type", "POLYGON"),
            "site_id": site_id
        })
    db.commit()
    return {"success": True, "message": "Site updated successfully"}

# Checkpoint CRUD for Admin panel
@router.get("/locations/checkpoints")
def get_admin_checkpoints(
    site_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    query = db.query(Checkpoint)
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            query = query.filter(Checkpoint.site_id == user_site_id)
        else:
            return []
    else:
        if site_id is not None:
            query = query.filter(Checkpoint.site_id == site_id)
            
    return query.order_by(Checkpoint.order, Checkpoint.id).all()

@router.post("/locations/checkpoints")
def create_checkpoint(
    data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    site_id = data.get("site_id")
    name = data.get("name")
    order = int(data.get("order", 0))
    if not site_id or not name:
        raise HTTPException(status_code=400, detail="Site ID and Name are required")
        
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if int(site_id) != user_site_id:
            raise HTTPException(status_code=403, detail="Not authorized to create checkpoints for this site")
    
    # Generate unique QR code if not provided
    qr_code = data.get("qr_code")
    if not qr_code:
        import uuid
        qr_code = f"CP_{site_id}_{uuid.uuid4().hex[:8].upper()}"
        
    # Check uniqueness of qr_code
    existing = db.query(Checkpoint).filter(Checkpoint.qr_code == qr_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="QR Code must be unique")

    latitude = data.get("latitude")
    longitude = data.get("longitude")
    radius = data.get("radius")
    if radius is not None:
        try:
            radius = int(radius)
        except:
            radius = 30
    else:
        radius = 30

    new_checkpoint = Checkpoint(
        site_id=site_id,
        name=name,
        qr_code=qr_code,
        order=order,
        latitude=float(latitude) if latitude is not None and latitude != "" else None,
        longitude=float(longitude) if longitude is not None and longitude != "" else None,
        radius=radius
    )
    db.add(new_checkpoint)
    db.commit()
    db.refresh(new_checkpoint)
    return new_checkpoint

@router.put("/locations/checkpoints/{checkpoint_id}")
def update_checkpoint(
    checkpoint_id: int, 
    data: dict, 
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    checkpoint = db.query(Checkpoint).filter(Checkpoint.id == checkpoint_id).first()
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
        
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if checkpoint.site_id != user_site_id:
            raise HTTPException(status_code=403, detail="Not authorized to edit checkpoints for this site")
            
    # Check if the name is changing and the checkpoint is already in use by any active checklist.
    # If so, we should clone/branch it to avoid overwriting shared checkpoints.
    if "name" in data and data["name"] != checkpoint.name:
        in_use = db.query(Checklist).filter(
            Checklist.checkpoint_id == checkpoint_id,
            Checklist.is_active == True
        ).first() is not None
        
        if in_use:
            import uuid
            new_qr_code = f"CP_{checkpoint.site_id}_{uuid.uuid4().hex[:8].upper()}"
            new_checkpoint = Checkpoint(
                site_id=checkpoint.site_id,
                name=data["name"],
                qr_code=new_qr_code,
                order=checkpoint.order,
                latitude=float(data["latitude"]) if "latitude" in data and data["latitude"] not in [None, ""] else checkpoint.latitude,
                longitude=float(data["longitude"]) if "longitude" in data and data["longitude"] not in [None, ""] else checkpoint.longitude,
                radius=int(data["radius"]) if "radius" in data and data["radius"] not in [None, ""] else checkpoint.radius
            )
            db.add(new_checkpoint)
            db.commit()
            db.refresh(new_checkpoint)
            return new_checkpoint

    if "name" in data:
        checkpoint.name = data["name"]
    if "qr_code" in data:
        qr_code = data["qr_code"]
        existing = db.query(Checkpoint).filter(Checkpoint.qr_code == qr_code, Checkpoint.id != checkpoint_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="QR Code must be unique")
        checkpoint.qr_code = qr_code
    if "order" in data:
        checkpoint.order = int(data["order"])
    if "latitude" in data:
        lat = data["latitude"]
        checkpoint.latitude = float(lat) if lat is not None and lat != "" else None
    if "longitude" in data:
        lon = data["longitude"]
        checkpoint.longitude = float(lon) if lon is not None and lon != "" else None
    if "radius" in data:
        rad = data["radius"]
        checkpoint.radius = int(rad) if rad is not None and rad != "" else 30
        
    db.commit()
    db.refresh(checkpoint)
    return checkpoint

@router.delete("/locations/checkpoints/{checkpoint_id}")
def delete_checkpoint(
    checkpoint_id: int, 
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    checkpoint = db.query(Checkpoint).filter(Checkpoint.id == checkpoint_id).first()
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
        
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if checkpoint.site_id != user_site_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete checkpoints for this site")
            
    # Nullify any linked checklists to prevent integrity constraint failures
    db.query(Checklist).filter(Checklist.checkpoint_id == checkpoint_id).update({Checklist.checkpoint_id: None})
    
    db.delete(checkpoint)
    db.commit()
    return {"success": True, "message": "Checkpoint deleted successfully"}

@router.get("/assessments/clients")
def get_clients_list(db: Session = Depends(get_patrol_db)):
    sql = text("SELECT oid as id, name FROM CLIENTT")
    rows = db.execute(sql).mappings().all()
    return [dict(r) for r in rows]

@router.get("/users/")
def get_users(db: Session = Depends(get_patrol_db)):
    print("DEBUG: Fetching users...")
    sql = text("""
        SELECT 
            e.oid as id, 
            e.emp_code as employee_id, 
            e.mobile as mobile_number, 
            d.name as role, 
            e.SITE as site_id, 
            s.name as site_name,
            e.active as is_active
        FROM EMPLOYEE e
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        LEFT JOIN SITE s ON e.SITE = s.oid
        LIMIT 100
    """)
    result = db.execute(sql)
    users = [dict(row) for row in result.mappings()]
    print(f"DEBUG: Found {len(users)} users")
    return users

@router.post("/users/")
def onboard_user(data: dict, db: Session = Depends(get_patrol_db)):
    # Find designation oid
    role = data.get("role")
    desig_sql = text("SELECT oid FROM DESIGNATION WHERE name = :name LIMIT 1")
    desig = db.execute(desig_sql, {"name": role}).mappings().first()
    desig_id = desig["oid"] if desig else 2 # Default to Field Officer if not found
    
    # Use branch 1 as default
    branch_id = 1
    
    sql = text("""
        INSERT INTO EMPLOYEE (emp_code, name, mobile, DESIGNATION, SITE, BRANCH, active)
        VALUES (:emp_code, :name, :mobile, :designation_id, :site_id, :branch_id, 1)
    """)
    db.execute(sql, {
        "emp_code": data.get("employee_id"),
        "name": data.get("employee_id"), # Using emp_id as name for now since frontend doesn't send name
        "mobile": data.get("mobile_number"),
        "designation_id": desig_id,
        "site_id": data.get("site_id") if data.get("site_id") != "none" else None,
        "branch_id": branch_id
    })
    db.commit()
    return {"success": True, "message": "User onboarded successfully"}

@router.put("/users/{user_id}")
def update_user(user_id: int, data: dict, db: Session = Depends(get_patrol_db)):
    role = data.get("role")
    desig_sql = text("SELECT oid FROM DESIGNATION WHERE name = :name LIMIT 1")
    desig = db.execute(desig_sql, {"name": role}).mappings().first()
    desig_id = desig["oid"] if desig else 2
    
    sql = text("""
        UPDATE EMPLOYEE 
        SET emp_code = :emp_code, mobile = :mobile, DESIGNATION = :designation_id, SITE = :site_id
        WHERE oid = :oid
    """)
    db.execute(sql, {
        "emp_code": data.get("employee_id"),
        "mobile": data.get("mobile_number"),
        "designation_id": desig_id,
        "site_id": data.get("site_id") if data.get("site_id") != "none" else None,
        "oid": user_id
    })
    db.commit()
    return {"success": True, "message": "User updated successfully"}


# ─────────────────────────────────────────────────────────────
#  PATROL TOUR REPORT ENDPOINTS
# ─────────────────────────────────────────────────────────────

@router.get("/patrol/tours")
def get_completed_tours(
    site_id: Optional[int] = Query(None),
    limit: int = Query(50),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    """
    Return a list of completed patrol tours ordered newest first.
    """
    query = db.query(PatrolTour).filter(PatrolTour.status == "completed")
    
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if user_site_id:
            query = query.filter(PatrolTour.site_id == user_site_id)
        else:
            return []
            
    if site_id:
        if role in ["supervisor", "field officer", "main gate supervisor"] and site_id != user_site_id:
            return []
        query = query.filter(PatrolTour.site_id == site_id)

    tours = query.order_by(PatrolTour.start_time.desc()).limit(limit).all()

    result = []
    for t in tours:
        # Employee info
        emp_sql = text("""
            SELECT e.name, e.emp_code, d.name as role
            FROM EMPLOYEE e
            LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
            WHERE e.oid = :oid
        """)
        emp = db.execute(emp_sql, {"oid": t.user_id}).mappings().first()

        # Site info
        site_sql = text("""
            SELECT si.name as site_name, c.name as client_name
            FROM SITE si
            LEFT JOIN CLIENTT c ON si.CLIENTT = c.oid
            WHERE si.oid = :oid
        """)
        site = db.execute(site_sql, {"oid": t.site_id}).mappings().first() if t.site_id else None

        # Total checkpoints in the tour
        total_cp = 0
        checkpoint_ids = []
        if t.site_id:
            checklists = db.query(Checklist).filter(
                Checklist.is_active == True,
                Checklist.title.like(f"{t.tour_name} - %")
            ).all()
            checklists = filter_checklists_by_site(checklists, t.site_id)
            checkpoint_ids = [c.checkpoint_id for c in checklists if c.checkpoint_id]
            if checkpoint_ids:
                total_cp = db.query(Checkpoint).filter(
                    Checkpoint.id.in_(checkpoint_ids)
                ).count()
            
            if total_cp == 0:
                total_cp = db.query(Checkpoint).filter(
                    Checkpoint.site_id == t.site_id
                ).count()

        # Checkpoint scan count (distinct scanned checkpoints belonging to the tour in this tour session)
        scan_count_query = db.query(PatrolLog.checkpoint_id).filter(
            PatrolLog.tour_id == t.id,
            PatrolLog.checkpoint_id != None,
            PatrolLog.is_deleted == False
        ).distinct()
        
        if checkpoint_ids:
            scan_count_query = scan_count_query.filter(PatrolLog.checkpoint_id.in_(checkpoint_ids))
            
        scan_count = scan_count_query.count()

        # Started by = guard who scanned the FIRST checkpoint in this tour
        # Ended by = guard who scanned the LAST checkpoint in this tour
        first_log = db.query(PatrolLog).filter(
            PatrolLog.tour_id == t.id,
            PatrolLog.checkpoint_id != None,
            PatrolLog.scan_type != "FORWARD",
            PatrolLog.is_deleted == False
        ).order_by(PatrolLog.scan_time.asc()).first()

        last_log = db.query(PatrolLog).filter(
            PatrolLog.tour_id == t.id,
            PatrolLog.checkpoint_id != None,
            PatrolLog.scan_type != "FORWARD",
            PatrolLog.is_deleted == False
        ).order_by(PatrolLog.scan_time.desc()).first()

        def get_guard_info_by_shift(log_entry, fallback_user_id):
            if log_entry and log_entry.shift_id:
                shift_obj = db.query(Shift).filter(Shift.id == log_entry.shift_id).first()
                u_id = shift_obj.user_id if shift_obj else fallback_user_id
            else:
                u_id = fallback_user_id

            if not u_id:
                return None, None
            g = db.execute(text(
                "SELECT e.name, e.emp_code FROM EMPLOYEE e WHERE e.oid = :oid"
            ), {"oid": u_id}).mappings().first()
            return (g["name"], g["emp_code"]) if g else (None, None)

        started_name, started_code = get_guard_info_by_shift(first_log, t.user_id)
        ended_name, ended_code = get_guard_info_by_shift(last_log, t.user_id)

        # Fallback to creator if no logs yet
        creator_name = emp["name"] if emp else f"Officer {t.user_id}"
        creator_code = emp["emp_code"] if emp else "Unknown"

        # Incident count
        inc_query = db.query(Incident).filter(
            Incident.user_id == t.user_id,
            Incident.reported_at >= t.start_time
        )
        if t.end_time:
            inc_query = inc_query.filter(Incident.reported_at <= t.end_time)
        inc_count = inc_query.count()

        duration_mins = None
        if t.start_time and t.end_time:
            duration_mins = int((t.end_time - t.start_time).total_seconds() / 60)

        result.append({
            "shift_id": t.id,
            "tour_name": t.tour_name,
            "guard_name": creator_name,
            "guard_emp_code": creator_code,
            "guard_role": emp["role"] if emp else "Field Officer",
            "site_name": site["site_name"] if site else "Unknown Site",
            "client_name": site["client_name"] if site else "N/A",
            "start_time": t.start_time.isoformat() if t.start_time else None,
            "end_time": t.end_time.isoformat() if t.end_time else None,
            "duration_mins": duration_mins,
            "scan_count": scan_count,
            "total_checkpoints": total_cp,
            "incident_count": inc_count,
            "status": t.status.upper(),
            "started_by_name": started_name or creator_name,
            "started_by_code": started_code or creator_code,
            "ended_by_name": ended_name or creator_name,
            "ended_by_code": ended_code or creator_code,
        })

    return result


@router.get("/patrol/tours/{shift_id}")
def get_tour_detail(
    shift_id: int, 
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_patrol_db)
):
    """
    Return the full tour report detail for a single completed tour round.
    """
    t = db.query(PatrolTour).filter(PatrolTour.id == shift_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Completed tour not found")
        
    role = current_user.get("role", "").lower()
    user_site_id = current_user.get("site_id")
    if role in ["supervisor", "field officer", "main gate supervisor"]:
        if t.site_id != user_site_id:
            raise HTTPException(status_code=403, detail="Access denied to this tour report")

    # Shift info for coordinates
    s = db.query(Shift).filter(Shift.id == t.shift_id).first()

    # Employee info
    emp_sql = text("""
        SELECT e.name, e.emp_code, d.name as role
        FROM EMPLOYEE e
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        WHERE e.oid = :oid
    """)
    emp = db.execute(emp_sql, {"oid": t.user_id}).mappings().first()

    # Site info
    site_sql = text("""
        SELECT si.name as site_name, c.name as client_name
        FROM SITE si
        LEFT JOIN CLIENTT c ON si.CLIENTT = c.oid
        WHERE si.oid = :oid
    """)
    site = db.execute(site_sql, {"oid": t.site_id}).mappings().first() if t.site_id else None

    duration_mins = None
    if t.start_time and t.end_time:
        duration_mins = int((t.end_time - t.start_time).total_seconds() / 60)

    # Get checkpoints for this tour dynamically, fallback to all site checkpoints
    checkpoint_ids = []
    checklists = db.query(Checklist).filter(
        Checklist.is_active == True,
        Checklist.title.like(f"{t.tour_name} - %")
    ).all()
    if t.site_id:
        checklists = filter_checklists_by_site(checklists, t.site_id)
    checkpoint_ids = [c.checkpoint_id for c in checklists if c.checkpoint_id]
        
    if not checkpoint_ids:
        all_checkpoints = db.query(Checkpoint).filter(
            Checkpoint.site_id == t.site_id
        ).order_by(Checkpoint.order, Checkpoint.id).all() if t.site_id else []
    else:
        all_checkpoints = db.query(Checkpoint).filter(
            Checkpoint.id.in_(checkpoint_ids)
        ).order_by(Checkpoint.order, Checkpoint.id).all()

    # Find all checkpoint IDs configured for this site/tour
    cp_ids = [cp.id for cp in all_checkpoints]
    
    # Query all scans for these checkpoints on the same day as the shift start
    patrol_logs = db.query(PatrolLog).filter(
        PatrolLog.tour_id == t.id,
        PatrolLog.checkpoint_id.in_(cp_ids),
        PatrolLog.is_deleted == False
    ).order_by(PatrolLog.scan_time.asc()).all()

    # Map shift_id to guard name and employee code in bulk
    shift_ids = list({log.shift_id for log in patrol_logs if log.shift_id})
    shift_guard_map = {}
    if shift_ids:
        day_shifts = db.query(Shift).filter(Shift.id.in_(shift_ids)).all()
        user_ids = list({ds.user_id for ds in day_shifts})
        if user_ids:
            employees = db.execute(text("""
                SELECT e.oid, e.name, e.emp_code, d.name as role 
                FROM EMPLOYEE e
                LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
                WHERE e.oid IN :oids
            """), {"oids": tuple(user_ids)}).mappings().all()
            emp_map = {e["oid"]: e for e in employees}
            for ds in day_shifts:
                emp_info = emp_map.get(ds.user_id)
                if emp_info:
                    shift_guard_map[ds.id] = {
                        "name": emp_info["name"],
                        "emp_code": emp_info["emp_code"],
                        "role": emp_info["role"]
                    }

    # Map checkpoint_id → scan log (prioritize QR scans over FORWARD scans)
    scanned_map = {}
    for log in patrol_logs:
        if log.checkpoint_id:
            existing = scanned_map.get(log.checkpoint_id)
            if not existing or (existing.scan_type == "FORWARD" and log.scan_type == "QR"):
                scanned_map[log.checkpoint_id] = log

    # Build checkpoint sequence
    checkpoints_out = []
    scanned_count = 0
    for idx, cp in enumerate(all_checkpoints):
        log = scanned_map.get(cp.id)
        scanned = log is not None
        if scanned:
            scanned_count += 1

        guard_info = shift_guard_map.get(log.shift_id, {}) if log else {}
        guard_name = guard_info.get("name")
        guard_emp_code = guard_info.get("emp_code")

        gps_distance = None

        # Checklist linked to this checkpoint
        checklist = db.query(Checklist).filter(
            Checklist.checkpoint_id == cp.id,
            Checklist.is_active == True
        ).first()

        checklist_data = None
        if checklist:
            # Find a submitted response for this checklist during this tour
            resp_query = db.query(ChecklistResponse).filter(
                ChecklistResponse.checklist_id == checklist.id,
                ChecklistResponse.status == ResponseStatus.SUBMITTED
            )
            if t.start_time:
                resp_query = resp_query.filter(ChecklistResponse.submitted_at >= t.start_time)
            if t.end_time:
                resp_query = resp_query.filter(ChecklistResponse.submitted_at <= t.end_time)
            resp = resp_query.first()

            answers_out = []
            checklist_completed = False
            if resp:
                checklist_completed = True
                ans_rows = db.query(QuestionAnswer).filter(
                    QuestionAnswer.response_id == resp.id
                ).all()
                for a in ans_rows:
                    link = db.query(ChecklistQuestionLink).filter(
                        ChecklistQuestionLink.id == a.question_link_id
                    ).first()
                    q = db.query(Question).filter(
                        Question.id == link.question_id
                    ).first() if link else None

                    media = []
                    if a.media_urls:
                        try:
                            media = json.loads(a.media_urls)
                        except:
                            media = [a.media_urls] if a.media_urls else []

                    answers_out.append({
                        "question": q.text if q else "Unknown Question",
                        "response": a.answer_value or "N/A",
                        "comment": a.comment,
                        "requires_photo": link.requires_photo if link else False,
                        "photo_urls": media,
                    })
            elif log:
                guard_role = guard_info.get("role")
                if checklist.required_roles:
                    try:
                        roles = json.loads(checklist.required_roles)
                        if roles and guard_role:
                            if not any(guard_role.lower() == r.lower() for r in roles):
                                checklist_completed = True
                    except:
                        pass

            checklist_data = {
                "title": checklist.title,
                "completed": checklist_completed,
                "answers": answers_out,
            }

        checkpoints_out.append({
            "seq": idx + 1,
            "id": cp.id,
            "name": cp.name,
            "scanned": scanned,
            "scan_time": log.scan_time.isoformat() if log and log.scan_time else None,
            "coordinates": f"{log.latitude:.5f}, {log.longitude:.5f}" if log and log.latitude else "N/A",
            "gps_status": "Verified" if scanned else "Missed",
            "checklist": checklist_data,
            "scanned_by_name": guard_name,
            "scanned_by_code": guard_emp_code,
        })


    # Incidents during this tour
    inc_query = db.query(Incident).filter(
        Incident.user_id == t.user_id,
        Incident.reported_at >= t.start_time
    )
    if t.end_time:
        inc_query = inc_query.filter(Incident.reported_at <= t.end_time)
    incidents_raw = inc_query.order_by(Incident.reported_at).all()

    incidents_out = []
    for i in incidents_raw:
        media = []
        if i.media_urls:
            try:
                media = json.loads(i.media_urls)
            except:
                media = [i.media_urls] if i.media_urls else []

        incidents_out.append({
            "id": f"INC-{i.id}",
            "reported_time": i.reported_at.isoformat(),
            "category": i.incident_type or "GENERAL",
            "description": i.brief_description or "",
            "risk": i.risk_category or "Medium",
            "photo_url": media[0] if media else None,
            "has_video": False,
            "status": "Resolved" if i.is_resolved else "Pending",
            "resolution_time": None,
        })

    # Incident stats
    high = sum(1 for i in incidents_out if i["risk"] == "High")
    medium = sum(1 for i in incidents_out if i["risk"] == "Medium")
    low = sum(1 for i in incidents_out if i["risk"] == "Low")
    resolved = sum(1 for i in incidents_out if i["status"] == "Resolved")
    pending = sum(1 for i in incidents_out if i["status"] == "Pending")

    total_cp_count = len(all_checkpoints)
    completion_pct = round(scanned_count / total_cp_count * 100) if total_cp_count > 0 else 0

    return {
        "shift_id": t.id,
        "tour_name": t.tour_name,
        "report_id": f"RPT-{t.start_time.strftime('%Y%m%d') if t.start_time else '000000'}-{t.id:03d}",
        "guard_name": emp["name"] if emp else f"Officer {t.user_id}",
        "guard_emp_code": emp["emp_code"] if emp else "Unknown",
        "guard_role": emp["role"] if emp else "Field Officer",
        "site_name": site["site_name"] if site else "Unknown Site",
        "client_name": site["client_name"] if site else "N/A",
        "start_time": t.start_time.isoformat() if t.start_time else None,
        "end_time": t.end_time.isoformat() if t.end_time else None,
        "duration_mins": duration_mins,
        "start_gps": f"{s.start_latitude:.6f}, {s.start_longitude:.6f}" if s and s.start_latitude else "N/A",
        "end_gps": f"{s.end_latitude:.6f}, {s.end_longitude:.6f}" if s and s.end_latitude else "N/A",
        "start_latitude": s.start_latitude if s else None,
        "start_longitude": s.start_longitude if s else None,
        "end_latitude": s.end_latitude if s else None,
        "end_longitude": s.end_longitude if s else None,
        "total_checkpoints": total_cp_count,
        "scanned_count": scanned_count,
        "completion_pct": completion_pct,
        "status": t.status.upper(),
        "checkpoints": checkpoints_out,
        "incidents": incidents_out,
        "incident_stats": {
            "total": len(incidents_out),
            "high": high,
            "medium": medium,
            "low": low,
            "resolved": resolved,
            "pending": pending,
        },
    }

from pydantic import BaseModel
from fastapi import Header
from playwright.sync_api import sync_playwright
import zipfile
import io

class BulkPdfRequest(BaseModel):
    tourIds: List[int]

def sanitize_filename(filename: str) -> str:
    cleaned = filename.replace("/", "-").replace("\\", "-")
    # Strip any control characters (ASCII < 32)
    cleaned = "".join(c for c in cleaned if ord(c) >= 32)
    # Remove chars forbidden on Windows filesystems
    for char in '<>:"|?*':
        cleaned = cleaned.replace(char, "")
    return cleaned.strip()

@router.post("/patrol/bulk-pdf")
@router.post("/api/reports/patrol/bulk-pdf")
def generate_bulk_pdf(
    payload: BulkPdfRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_patrol_db)
):
    token = ""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token is required in Authorization header")

    import base64
    import json
    try:
        user_info_json = base64.b64decode(token.encode()).decode()
        json.loads(user_info_json)
    except Exception:
        user_info_json = '{"role": "Admin", "name": "Administrator"}'

    # In-memory ZIP buffer
    zip_buffer = io.BytesIO()
    frontend_url = "http://localhost:8080"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        context = browser.new_context()
        
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for tour_id in payload.tourIds:
                page = context.new_page()
                
                # Inject access token and user details before scripts load
                page.add_init_script(f"sessionStorage.setItem('access_token', '{token}')")
                page.add_init_script(f"sessionStorage.setItem('user', '{user_info_json}')")
                
                page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
                page.on("pageerror", lambda err: print(f"BROWSER PAGEERROR: {err}"))
                
                # Navigate to printable report page
                url = f"{frontend_url}/reports/site/0/tour/{tour_id}"
                page.goto(url, wait_until="networkidle")
                
                # Wait for React rendering to complete
                try:
                    page.wait_for_function(
                        "() => document.body.innerText.includes('Patrol Tour Detail Report') && "
                        "!document.body.innerText.includes('Loading') && "
                        "!document.body.innerText.includes('Fetching details')",
                        timeout=15000
                    )
                except Exception as wait_exc:
                    print("--- Page Content on Timeout ---")
                    print(page.content())
                    print("--------------------------------")
                    raise wait_exc
                
                # Wait for font resources to load
                page.evaluate("document.fonts.ready")
                
                # Emulate print media type
                page.emulate_media(media="print")
                
                # Extract report ID from the DOM
                report_id = page.evaluate(
                    r"""() => {
                        const match = document.body.innerText.match(/REPORT ID\s*:\s*(.+)/i);
                        return match ? match[1].trim() : null;
                    }"""
                )
                
                if not report_id:
                    page.close()
                    raise HTTPException(status_code=500, detail=f"Report ID not found for Tour ID {tour_id}")
                
                filename = f"{sanitize_filename(report_id)}.pdf"
                
                # Generate PDF
                pdf_data = page.pdf(
                    format="A4",
                    print_background=True,
                    prefer_css_page_size=True,
                    margin={
                        "top": "15mm",
                        "right": "15mm",
                        "bottom": "15mm",
                        "left": "15mm"
                    }
                )
                
                zip_file.writestr(filename, pdf_data)
                page.close()
                
        browser.close()
        
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=Bulk_Patrol_PDF_Reports_{datetime.now().strftime('%Y-%m-%d')}.zip"}
    )

@router.get("/assessments/guards")
def get_guards_by_site(site_id: Optional[int] = Query(None), db: Session = Depends(get_patrol_db)):
    query = "SELECT oid, name, emp_code FROM EMPLOYEE"
    params = {}
    if site_id:
        query += " WHERE SITE = :site_id"
        params["site_id"] = site_id
    rows = db.execute(text(query), params).mappings().all()
    return [{"id": f"g_{r['oid']}", "name": r["name"], "employeeId": r["emp_code"], "present": True} for r in rows]


