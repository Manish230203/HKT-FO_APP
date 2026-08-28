from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from app.database import get_patrol_db
from app.utils.timezone import get_ist_now, get_ist_today
from app.models.patrol_models import Shift, PatrolTour, PatrolLog, Incident, Checklist, ChecklistResponse, QuestionAnswer, ChecklistQuestionLink, Question, ResponseStatus, SOSAlertStatus, SOSAlert, Checkpoint
from app.schemas.patrol_schemas import ShiftStart, ShiftEnd, PatrolLogRequest, IncidentReportRequest, SOSRequest, QuestionAnswerRequest, ChecklistSubmitRequest

router = APIRouter(prefix="/mobile", tags=["Patrolling"])

import os
import uuid
import shutil
import json


def check_role_match(emp_designation: str, roles: list) -> bool:
    if not emp_designation:
        return False
    
    # Normalize inputs
    emp_desig_lower = emp_designation.lower().strip()
    
    # Map abbreviations to standard role names
    mapping = {
        "s/g": ["security guard", "s/g"],
        "ls/g": ["lady security guard", "lady-security guard", "ls/g", "l/sg"],
        "l/sg": ["lady security guard", "lady-security guard", "ls/g", "l/sg"],
        "s/sup": ["supervisor", "s/sup"],
        "f/o": ["field officer", "f/o"],
        "field officer": ["field officer", "f/o"],
        "supervisor": ["supervisor", "s/sup"],
        "security guard": ["security guard", "s/g"],
        "lady security guard": ["lady security guard", "lady-security guard", "ls/g", "l/sg"],
        "lady-security guard": ["lady security guard", "lady-security guard", "ls/g", "l/sg"]
    }
    
    # Find mapped names for the employee's designation
    allowed_check_names = mapping.get(emp_desig_lower, [emp_desig_lower])
    
    for r in roles:
        r_lower = r.lower().strip()
        # Direct check or check through mapping
        if r_lower in allowed_check_names:
            return True
        # Reverse mapping: check if the role maps to the employee's designation
        mapped_role_names = mapping.get(r_lower, [r_lower])
        if emp_desig_lower in mapped_role_names:
            return True
            
    return False


def get_active_shift(db: Session, empOid: int) -> Optional[Shift]:
    from datetime import date, datetime
    active_shift = db.query(Shift).filter(Shift.user_id == empOid, Shift.end_time == None).first()
    if active_shift:
        today = get_ist_today()
        # 1. Zombie shift check: If shift was started on a previous day, end it
        if active_shift.start_time.date() < today:
            active_shift.end_time = active_shift.start_time
            active_shift.end_latitude = active_shift.start_latitude
            active_shift.end_longitude = active_shift.start_longitude
            db.commit()
            return None
            
        # 2. Attendance sync check: If they missed the punch today (no punch-in or already punched-out)
        from ...services.attendance_service import get_today_status_logic
        att_status = get_today_status_logic(empOid)
        if att_status.get("success"):
            record = att_status.get("record")
            if not record or record.get("check_out"):
                active_shift.end_time = datetime.now()
                active_shift.end_latitude = active_shift.start_latitude
                active_shift.end_longitude = active_shift.start_longitude
                db.commit()
                return None
    return active_shift


def ensure_tour_ownership(db: Session, active_tour: PatrolTour, active_shift: Shift, empOid: int):
    if active_tour and active_tour.user_id != empOid:
        active_tour.user_id = empOid
        active_tour.shift_id = active_shift.id
        if active_shift:
            active_shift.active_tour = active_tour.tour_name
        db.commit()


def get_tour_active_runner_and_status(db: Session, tour: PatrolTour) -> tuple[int, bool]:
    active_runner_id = tour.user_id
    is_forwarded = False
    
    site_id = tour.site_id
    if not site_id:
        return active_runner_id, is_forwarded
        
    active_checklists = db.query(Checklist).filter(
        Checklist.is_active == True,
        Checklist.title.like(f"{tour.tour_name} - %")
    ).all()
    active_checklists = filter_checklists_by_site(active_checklists, site_id)
    checkpoint_ids = [c.checkpoint_id for c in active_checklists if c.checkpoint_id]
    
    if not checkpoint_ids:
        all_cps = db.query(Checkpoint).filter(Checkpoint.site_id == site_id).order_by(Checkpoint.order, Checkpoint.id).all()
    else:
        all_cps = db.query(Checkpoint).filter(Checkpoint.id.in_(checkpoint_ids)).order_by(Checkpoint.order, Checkpoint.id).all()
        
    if not all_cps:
        return active_runner_id, is_forwarded
        
    scanned_cps = db.query(PatrolLog.checkpoint_id).filter(
        PatrolLog.tour_id == tour.id,
        PatrolLog.scan_type == "QR",
        PatrolLog.checkpoint_id != None,
        PatrolLog.is_deleted == False
    ).all()
    scanned_ids = {c[0] for c in scanned_cps}
    
    first_pending_cp = None
    for cp in all_cps:
        if cp.id not in scanned_ids:
            first_pending_cp = cp
            break
            
    if not first_pending_cp:
        return active_runner_id, is_forwarded
        
    latest_forward = db.query(PatrolLog).filter(
        PatrolLog.tour_id == tour.id,
        PatrolLog.checkpoint_id == first_pending_cp.id,
        PatrolLog.forwarded_to != None,
        PatrolLog.is_deleted == False
    ).order_by(PatrolLog.scan_time.desc()).first()
    
    if latest_forward:
        return latest_forward.forwarded_to, True
        
    return active_runner_id, is_forwarded


def get_tour_active_runner(db: Session, tour: PatrolTour) -> int:
    runner, _ = get_tour_active_runner_and_status(db, tour)
    return runner


def is_tour_currently_forwarded_to(db: Session, tour: PatrolTour, emp_site_id: int, empOid: int) -> bool:
    runner, is_f = get_tour_active_runner_and_status(db, tour)
    return runner == empOid and tour.user_id != empOid


def get_active_tour(db: Session, empOid: int) -> Optional[PatrolTour]:
    # 1. First check if the employee has their own ongoing/forwarded tour and is still the active runner
    tours = db.query(PatrolTour).filter(
        PatrolTour.user_id == empOid,
        PatrolTour.status.in_(["ongoing", "forwarded"])
    ).order_by(PatrolTour.start_time.desc()).all()
    for tour in tours:
        if get_tour_active_runner(db, tour) == empOid:
            return tour
        
    # 2. If not, check if there is an ongoing/forwarded tour at the employee's site that has been forwarded to them
    emp_site_id = db.execute(text("SELECT site FROM EMPLOYEE WHERE oid = :oid"), {"oid": empOid}).scalar()
    if emp_site_id:
        other_tours = db.query(PatrolTour).filter(
            PatrolTour.site_id == emp_site_id,
            PatrolTour.user_id != empOid,
            PatrolTour.status.in_(["ongoing", "forwarded"])
        ).order_by(PatrolTour.start_time.desc()).all()
        for other_tour in other_tours:
            if get_tour_active_runner(db, other_tour) == empOid:
                return other_tour
    return None




# Video upload constraints
MAX_VIDEO_DURATION_SECONDS = 30
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".3gp", ".m4v"}

def get_video_duration_seconds(file_path: str) -> float:
    """
    Returns the duration of a video file in seconds using mutagen.
    Returns 0.0 if the duration cannot be determined.
    """
    try:
        from mutagen.mp4 import MP4
        from mutagen import File as MutagenFile
        ext = os.path.splitext(file_path)[1].lower()
        if ext in {".mp4", ".m4v", ".mov"}:
            audio = MP4(file_path)
            return float(audio.info.length)
        else:
            # Generic fallback for other containers (webm, avi, mkv, etc.)
            audio = MutagenFile(file_path)
            if audio and hasattr(audio, "info") and hasattr(audio.info, "length"):
                return float(audio.info.length)
    except Exception:
        pass
    return 0.0

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    uploads_dir = os.path.join(os.getcwd(), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(uploads_dir, filename)
    
    IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
    
    if ext in IMAGE_EXTENSIONS:
        try:
            import numpy as np
            import cv2
            
            # Read the uploaded file stream
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is not None:
                # Resize if the dimensions exceed 1600px
                max_size = 1600
                height, width = image.shape[:2]
                if max(height, width) > max_size:
                    if width > height:
                        new_width = max_size
                        new_height = int(height * (max_size / width))
                    else:
                        new_height = max_size
                        new_width = int(width * (max_size / height))
                    image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
                
                # Write back with target compression quality
                if ext in {".jpg", ".jpeg"}:
                    cv2.imwrite(file_path, image, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                elif ext == ".webp":
                    cv2.imwrite(file_path, image, [int(cv2.IMWRITE_WEBP_QUALITY), 80])
                elif ext == ".png":
                    cv2.imwrite(file_path, image, [int(cv2.IMWRITE_PNG_COMPRESSION), 6])
                else:
                    cv2.imwrite(file_path, image)
            else:
                # Fallback to copy fileobj if decoding failed
                await file.seek(0)
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
        except Exception:
            # Fallback to copy fileobj on any error
            try:
                await file.seek(0)
            except Exception:
                pass
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
    else:
        # Non-image files (videos, documents, etc.)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    
    # Enforce 30-second video duration limit
    if ext in VIDEO_EXTENSIONS:
        duration = get_video_duration_seconds(file_path)
        if duration > MAX_VIDEO_DURATION_SECONDS:
            os.remove(file_path)
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Video too long: {int(duration)} seconds. "
                    f"Maximum allowed duration is {MAX_VIDEO_DURATION_SECONDS} seconds. "
                    f"Please trim your video and try again."
                )
            )
        
    return {"url": f"/uploads/{filename}", "filename": filename}


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
        except Exception as e:
            pass
    return result

def get_site_loop_type(db: Session, site_id: int) -> str:
    if not site_id:
        return "Return Patrol"
    checklists = db.query(Checklist).filter(Checklist.is_active == True).all()
    site_checklists = filter_checklists_by_site(checklists, site_id)
    for c in site_checklists:
        if c.loop_type == "One-way Patrol":
            return "One-way Patrol"
    return "Return Patrol"

def check_and_auto_end_tour(db: Session, active_shift: Shift, latitude: float, longitude: float):
    if not active_shift or not active_shift.site_id:
        return
    
    active_tour = get_active_tour(db, active_shift.user_id)
    
    tour_name = active_tour.tour_name if active_tour else active_shift.active_tour
    if not tour_name:
        return
        
    loop_type = get_site_loop_type(db, active_shift.site_id)
    
    checkpoint_ids = []
    checklists = db.query(Checklist).filter(
        Checklist.is_active == True,
        Checklist.title.like(f"{tour_name} - %")
    ).all()
    checkpoint_ids = [c.checkpoint_id for c in checklists if c.checkpoint_id]
        
    if not checkpoint_ids:
        all_cps = db.query(Checkpoint).filter(Checkpoint.site_id == active_shift.site_id).order_by(Checkpoint.order, Checkpoint.id).all()
    else:
        all_cps = db.query(Checkpoint).filter(
            Checkpoint.id.in_(checkpoint_ids)
        ).order_by(Checkpoint.order, Checkpoint.id).all()
        
    if not all_cps:
        return
        
    N = len(all_cps)
    
    scanned_cps_query = db.query(PatrolLog.checkpoint_id).filter(
        PatrolLog.site_id == active_shift.site_id,
        PatrolLog.scan_type == "QR",
        PatrolLog.checkpoint_id != None,
        PatrolLog.is_deleted == False
    )
    if active_tour:
        scanned_cps_query = scanned_cps_query.filter(PatrolLog.tour_id == active_tour.id)
    else:
        today = get_ist_today()
        start_of_day = datetime.combine(today, datetime.min.time())
        scanned_cps_query = scanned_cps_query.filter(
            PatrolLog.shift_id == active_shift.id,
            PatrolLog.scan_time >= start_of_day
        )
        
    scanned_cps = scanned_cps_query.order_by(PatrolLog.scan_time.asc(), PatrolLog.id.asc()).all()
    scanned_in_shift = [c[0] for c in scanned_cps]
    
    end_tour = False
    
    unique_scanned = set(scanned_in_shift)
    all_cp_ids = {cp.id for cp in all_cps}
    if all_cp_ids and all_cp_ids.issubset(unique_scanned):
        end_tour = True
                    
    if end_tour:
        if active_tour:
            active_tour.status = "completed"
            active_tour.end_time = datetime.now()
        active_shift.active_tour = None
        db.commit()


@router.get("/dashboard")
def get_dashboard(empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    from datetime import date, datetime
    today = get_ist_today()
    start_of_day = datetime.combine(today, datetime.min.time())
    
    active_shift = get_active_shift(db, empOid)
    
    # Dynamic counts for today
    today_start = datetime.combine(get_ist_today(), datetime.min.time())
    
    # Count of distinct checkpoints scanned today
    distinct_checkpoint_scans = db.query(PatrolLog.checkpoint_id).join(Shift).filter(
        Shift.user_id == empOid,
        PatrolLog.scan_time >= start_of_day,
        PatrolLog.checkpoint_id != None
    ).distinct().count()
    
    # Fallback to total scans if no checkpoint_id is populated yet (for backward compatibility)
    if distinct_checkpoint_scans == 0:
        total_scans = db.query(PatrolLog).join(Shift).filter(
            Shift.user_id == empOid,
            PatrolLog.scan_time >= start_of_day
        ).count()
        scan_count = total_scans
    else:
        scan_count = distinct_checkpoint_scans
    
    incident_count = db.query(Incident).filter(
        Incident.user_id == empOid,
        Incident.reported_at >= start_of_day
    ).count()
    
    # Get IDs of checklists submitted by this user today (during current active tour if any)
    submitted_ids = []
    if active_shift:
        active_tour = get_active_tour(db, empOid)
        query = db.query(ChecklistResponse.checklist_id).filter(
            ChecklistResponse.shift_id == active_shift.id,
            ChecklistResponse.status == ResponseStatus.SUBMITTED
        )
        if active_tour:
            query = query.filter(ChecklistResponse.submitted_at >= active_tour.start_time)
        submitted_ids_res = query.all()
        submitted_ids = [r[0] for r in submitted_ids_res]
    
    # 1. Get employee's assigned site and designation
    emp_info_sql = text("""
        SELECT e.site, d.name as designation 
        FROM EMPLOYEE e
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        WHERE e.oid = :oid
    """)
    emp_info = db.execute(emp_info_sql, {"oid": empOid}).mappings().first()
    emp_site_id = emp_info["site"] if emp_info else None
    emp_designation = emp_info["designation"] if emp_info else None
    
    # 2. Get active checklists NOT submitted today
    # Guards must scan checkpoints to see and fill checkpoint-locked checklists;
    # do not count or display site-wide or checkpoint checklists directly on the dashboard.
    pending_checklists = 0
    
    # Get recent activities from multiple tables
    activities = []
    
    # 1. Scans
    scans = db.query(PatrolLog).join(Shift).filter(
        Shift.user_id == empOid,
        PatrolLog.scan_time >= start_of_day
    ).order_by(PatrolLog.scan_time.desc()).limit(5).all()
    for s in scans:
        title = ""
        if s.checkpoint_id:
            checkpoint_name = db.query(Checkpoint.name).filter(Checkpoint.id == s.checkpoint_id).scalar()
            if checkpoint_name:
                title = f"{checkpoint_name} Scanned"
        
        if not title:
            # Fallback to older style or site scan
            title = f"Checkpoint {s.site_id} Scanned"
            
        activities.append({
            "id": f"scan_{s.id}",
            "type": "scan",
            "title": title,
            "time": s.scan_time
        })
        
    # 2. Checklists
    checks = db.query(ChecklistResponse).filter(
        ChecklistResponse.user_id == empOid,
        ChecklistResponse.status == ResponseStatus.SUBMITTED,
        ChecklistResponse.submitted_at >= start_of_day
    ).order_by(ChecklistResponse.submitted_at.desc()).limit(5).all()
    for c in checks:
        # Get title
        ctitle = db.query(Checklist.title).filter(Checklist.id == c.checklist_id).scalar()
        activities.append({
            "id": f"check_{c.id}",
            "type": "checklist",
            "title": f"Submitted: {ctitle}",
            "time": c.submitted_at
        })
        
    # 3. Incidents
    incidents = db.query(Incident).filter(
        Incident.user_id == empOid,
        Incident.reported_at >= start_of_day
    ).order_by(Incident.reported_at.desc()).limit(5).all()
    for i in incidents:
        activities.append({
            "id": f"inc_{i.id}",
            "type": "incident",
            "title": f"Reported: {i.incident_type}",
            "time": i.reported_at
        })
 
    # Sort all by time desc and take top 5
    activities.sort(key=lambda x: x["time"], reverse=True)
    recent_activities = activities[:5]
    
    # Calculate sequential next checkpoint & full sequence list for this guard
    next_checkpoint_data = None
    checkpoints_sequence = []
    other_guard_name = None
    other_tour_name = None
    active_tours = []
    
    active_tour = get_active_tour(db, empOid)
    tour_to_inspect = active_tour
    
    if emp_site_id:
        # Check if another guard is active on a tour at this site
        other_active_tour = db.query(PatrolTour).filter(
            PatrolTour.site_id == emp_site_id,
            PatrolTour.user_id != empOid,
            PatrolTour.status.in_(["ongoing", "forwarded"]),
            PatrolTour.start_time >= start_of_day
        ).first()
        if other_active_tour:
            other_guard_name = db.execute(text("SELECT name FROM EMPLOYEE WHERE oid = :oid"), {"oid": other_active_tour.user_id}).scalar()
            other_tour_name = other_active_tour.tour_name
            if not tour_to_inspect:
                tour_to_inspect = other_active_tour

        # Query all active/ongoing tours at this site to determine locking status for each
        all_ongoing = db.query(PatrolTour).filter(
            PatrolTour.site_id == emp_site_id,
            PatrolTour.status.in_(["ongoing", "forwarded"]),
            PatrolTour.start_time >= start_of_day
        ).all()
        for t in all_ongoing:
            is_forwarded_to_me = False
            if t.user_id != empOid:
                is_forwarded_to_me = is_tour_currently_forwarded_to(db, t, emp_site_id, empOid)
            
            is_assigned_to_me = is_forwarded_to_me
            if not is_assigned_to_me and t.user_id == empOid:
                has_forward_log = db.query(PatrolLog).filter(
                    PatrolLog.tour_id == t.id,
                    PatrolLog.forwarded_to == empOid,
                    PatrolLog.is_deleted == False
                ).first()
                if has_forward_log:
                    is_assigned_to_me = True

            # Resolve who currently has the baton (the active runner) and its forwarding status
            active_runner_id, is_forwarded = get_tour_active_runner_and_status(db, t)
            
            runner_name = db.execute(text("SELECT name FROM EMPLOYEE WHERE oid = :oid"), {"oid": active_runner_id}).scalar() or "another guard"
            active_tours.append({
                "tour_name": t.tour_name,
                "user_id": active_runner_id,
                "user_name": runner_name,
                "is_forwarded_to_me": is_forwarded_to_me,
                "is_assigned_to_me": is_assigned_to_me,
                "is_forwarded": is_forwarded
            })

        active_checklists = db.query(Checklist).filter(Checklist.is_active == True).all()
        checkpoint_tour_names = {}
        for c in active_checklists:
            import json
            c_site_ids = []
            if c.site_ids:
                try:
                    c_site_ids = json.loads(c.site_ids)
                except Exception:
                    pass
            if emp_site_id in c_site_ids:
                parts = c.title.split(" - ")
                t_name_prefix = parts[0].strip()
                if c.checkpoint_id:
                    if c.checkpoint_id not in checkpoint_tour_names:
                        checkpoint_tour_names[c.checkpoint_id] = set()
                    checkpoint_tour_names[c.checkpoint_id].add(t_name_prefix.lower())

        all_cps = db.query(Checkpoint).filter(Checkpoint.site_id == emp_site_id).order_by(Checkpoint.order, Checkpoint.id).all()
        if all_cps:
            # Query all checkpoints successfully scanned in current active tour session
            scanned_ids = set()
            scanned_in_shift = []
            if tour_to_inspect:
                scanned_cps = db.query(PatrolLog.checkpoint_id).filter(
                    PatrolLog.tour_id == tour_to_inspect.id,
                    PatrolLog.scan_type == "QR",
                    PatrolLog.checkpoint_id != None,
                    PatrolLog.is_deleted == False
                ).order_by(PatrolLog.scan_time.asc(), PatrolLog.id.asc()).all()
                scanned_in_shift = [c[0] for c in scanned_cps]
                scanned_ids = {c[0] for c in scanned_cps}
            
            # Find next target index
            next_target_index = -1
            if tour_to_inspect:
                for idx, cp in enumerate(all_cps):
                    if cp.id not in scanned_ids:
                        next_target_index = idx
                        break
            
            # Closed Loop specific check:
            loop_type = get_site_loop_type(db, emp_site_id)
            is_closed_loop_pending = False
            if tour_to_inspect and next_target_index == -1 and loop_type == "Return Patrol":
                if all_cps:
                    first_cp_id = all_cps[0].id
                    last_cp_id = all_cps[-1].id
                    try:
                        last_cp_scan_indices = [i for i, cid in enumerate(scanned_in_shift) if cid == last_cp_id]
                        if last_cp_scan_indices:
                            last_scan_idx = last_cp_scan_indices[-1]
                            first_cp_scan_after = [i for i, cid in enumerate(scanned_in_shift) if cid == first_cp_id and i > last_scan_idx]
                            if not first_cp_scan_after:
                                is_closed_loop_pending = True
                        else:
                            is_closed_loop_pending = True
                    except Exception:
                        is_closed_loop_pending = True

            # Query active forwards for the active tour session
            active_forwards = []
            if active_tour:
                active_forwards = db.query(PatrolLog).filter(
                    PatrolLog.tour_id == active_tour.id,
                    PatrolLog.forwarded_to != None,
                    PatrolLog.is_deleted == False
                ).order_by(PatrolLog.scan_time.asc()).all()
            elif other_active_tour:
                active_forwards = db.query(PatrolLog).filter(
                    PatrolLog.tour_id == other_active_tour.id,
                    PatrolLog.forwarded_to != None,
                    PatrolLog.is_deleted == False
                ).order_by(PatrolLog.scan_time.asc()).all()
                
            forward_map = {f.checkpoint_id: f.forwarded_to for f in active_forwards}
            
            for idx, cp in enumerate(all_cps):
                status = "pending"
                assigned_to_id = forward_map.get(cp.id)
                
                # If there's no explicit forward, resolve the owner based on who has the active tour
                if not assigned_to_id:
                    assigned_tour_user_id = None
                    if active_shift and active_tour:
                        t_name = active_tour.tour_name.lower().strip()
                        belongs = False
                        if cp.id in checkpoint_tour_names:
                            belongs = t_name in checkpoint_tour_names[cp.id]
                        else:
                            belongs = True
                            if "server" in t_name:
                                belongs = "server" in cp.name.lower()
                            elif "perimeter" in t_name:
                                belongs = "server" not in cp.name.lower()
                        if belongs:
                            assigned_tour_user_id = empOid
                    
                    if not assigned_tour_user_id and other_active_tour:
                        t_name = other_active_tour.tour_name.lower().strip()
                        belongs = False
                        if cp.id in checkpoint_tour_names:
                            belongs = t_name in checkpoint_tour_names[cp.id]
                        else:
                            belongs = True
                            if "server" in t_name:
                                belongs = "server" in cp.name.lower()
                            elif "perimeter" in t_name:
                                belongs = "server" not in cp.name.lower()
                        if belongs:
                            assigned_tour_user_id = other_active_tour.user_id
                            
                    if assigned_tour_user_id:
                        assigned_to_id = assigned_tour_user_id

                assigned_to_name = None
                if assigned_to_id:
                    assigned_to_name = db.execute(text("SELECT name FROM EMPLOYEE WHERE oid = :oid"), {"oid": assigned_to_id}).scalar()
                
                if tour_to_inspect:
                    if is_closed_loop_pending and idx == 0:
                        status = "next"
                    elif cp.id in scanned_ids:
                        status = "completed"
                    elif idx == next_target_index:
                        if assigned_to_id and assigned_to_id != empOid:
                            status = "locked"
                        else:
                            status = "next"
                    else:
                        status = "pending"
                
                checkpoints_sequence.append({
                    "id": cp.id,
                    "name": cp.name,
                    "status": status,
                    "order": idx + 1,
                    "assigned_to": assigned_to_id,
                    "assigned_to_name": assigned_to_name
                })
                
                if active_shift and active_tour:
                    if is_closed_loop_pending and idx == 0:
                        next_checkpoint_data = {
                            "id": cp.id,
                            "name": cp.name
                        }
                    elif idx == next_target_index:
                        if assigned_to_id and assigned_to_id != empOid:
                            next_checkpoint_data = None
                        else:
                            next_checkpoint_data = {
                                "id": cp.id,
                                "name": cp.name
                            }
    
    # Compute available tours dynamically based on active checklists for this site
    tours_list = []
    if emp_site_id:
        # Reusing active_checklists fetched earlier
        unique_tours = {}
        for c in active_checklists:
            import json
            c_site_ids = []
            if c.site_ids:
                try:
                    c_site_ids = json.loads(c.site_ids)
                except Exception:
                    pass
            
            if emp_site_id in c_site_ids:
                # Filter by required roles/designation
                if c.required_roles:
                    try:
                        roles = json.loads(c.required_roles)
                        if roles:
                            if not check_role_match(emp_designation, roles):
                                continue
                    except Exception as e:
                        print(f"Error parsing required_roles for checklist {c.id} on dashboard: {e}")

                parts = c.title.split(" - ")
                tour_name = parts[0]
                if tour_name not in unique_tours:
                    unique_tours[tour_name] = {
                        "id": tour_name,
                        "name": tour_name,
                        "desc": c.description or f"Standard patrol round for {tour_name}.",
                        "checkpoint_ids": []
                    }
                if c.checkpoint_id:
                    unique_tours[tour_name]["checkpoint_ids"].append(c.checkpoint_id)
        tours_list = list(unique_tours.values())

    return {
        "officer": {"id": empOid, "status": "on_duty" if active_shift else "off_duty"},
        "active_shift": {
            "id": active_shift.id,
            "start_time": active_shift.start_time
        } if active_shift else None,
        "next_checkpoint": next_checkpoint_data,
        "checkpoints_sequence": checkpoints_sequence,
        "active_guard_name": other_guard_name,
        "active_tour_name": other_tour_name,
        "active_tours": active_tours,
        "tours": tours_list,
        "patrol_actions": [
            {"type": "scan", "label": "Scan", "count": scan_count},
            {"type": "checklist", "label": "Checklist", "count": pending_checklists},
            {"type": "incident", "label": "Incident", "count": incident_count}
        ],
        "recent_logs": [
            {
                "id": a["id"],
                "type": a["type"],
                "title": a["title"],
                "time": a["time"]
            } for a in recent_activities
        ]
    }

@router.post("/shift/start")
def start_shift(shift_data: ShiftStart, empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    # 1. Verify Attendance Status
    from ...services.attendance_service import get_today_status_logic
    att_status = get_today_status_logic(empOid)
    
    if not att_status.get("success") or not att_status.get("record"):
        raise HTTPException(status_code=403, detail="ATTENDANCE_REQUIRED: You must Punch In for attendance before starting a patrolling shift.")
    
    record = att_status["record"]
    if record.get("check_out"):
        raise HTTPException(status_code=403, detail="ATTENDANCE_RESTRICTED: You have already Punched Out for today. You cannot start a new patrolling shift.")

    # 2. Proceed with shift start
    active_shift = get_active_shift(db, empOid)
    if active_shift:
        raise HTTPException(status_code=400, detail="Shift already active")
    
    # Resolve correct site_id using employee's assigned site
    emp_site_id = db.execute(text("SELECT site FROM EMPLOYEE WHERE oid = :oid"), {"oid": empOid}).scalar()
    site_id = shift_data.site_id
    if emp_site_id is not None:
        site_id = int(emp_site_id)

    new_shift = Shift(
        user_id=empOid,
        site_id=site_id,
        start_latitude=shift_data.start_latitude,
        start_longitude=shift_data.start_longitude,
        start_time=datetime.now()
    )
    db.add(new_shift)
    db.commit()
    db.refresh(new_shift)
    return new_shift

@router.post("/shift/end")
def end_shift(shift_data: ShiftEnd, empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    active_shift = get_active_shift(db, empOid)
    if not active_shift:
        raise HTTPException(status_code=400, detail="No active shift")
    
    active_shift.end_time = datetime.now()
    active_shift.end_latitude = shift_data.end_latitude
    active_shift.end_longitude = shift_data.end_longitude
    db.commit()
    return {"message": "Shift ended"}

@router.post("/patrol/log")
def log_patrol(log_data: PatrolLogRequest, empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    active_shift = get_active_shift(db, empOid)
    if not active_shift:
        raise HTTPException(status_code=400, detail="No active shift")
    
    active_tour = get_active_tour(db, empOid)
    ensure_tour_ownership(db, active_tour, active_shift, empOid)
    checkpoint_id = getattr(log_data, "checkpoint_id", None)
    new_log = PatrolLog(
        shift_id=active_shift.id,
        tour_id=active_tour.id if active_tour else None,
        site_id=log_data.site_id,
        checkpoint_id=checkpoint_id,
        latitude=log_data.latitude,
        longitude=log_data.longitude,
        scan_type=log_data.scan_type,
        scan_time=datetime.now()
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    check_and_auto_end_tour(db, active_shift, log_data.latitude, log_data.longitude)
    return {"message": "Log recorded", "id": new_log.id}

from pydantic import BaseModel
class QRScanRequest(BaseModel):
    qr_code: str
    latitude: float
    longitude: float

@router.post("/patrol/scan-qr")
def scan_qr(log_data: QRScanRequest, empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    active_shift = get_active_shift(db, empOid)
    if not active_shift:
        raise HTTPException(status_code=400, detail="No active shift")
    
    qr_data = log_data.qr_code.strip()
    
    # Get employee's assigned site and designation
    emp_info_sql = text("""
        SELECT e.site, d.name as designation 
        FROM EMPLOYEE e
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        WHERE e.oid = :oid
    """)
    emp_info = db.execute(emp_info_sql, {"oid": empOid}).mappings().first()
    emp_site_id = emp_info["site"] if emp_info else None
    emp_designation = emp_info["designation"] if emp_info else None
    
    # 1. Look up checkpoint by qr_code
    checkpoint = db.query(Checkpoint).filter(Checkpoint.qr_code == qr_data).first()
    if not checkpoint:
        # Fallback: check if qr_data is checkpoint ID
        if qr_data.isdigit():
            checkpoint = db.query(Checkpoint).filter(Checkpoint.id == int(qr_data)).first()
            
    if not checkpoint:
        # Fallback: Check if it's a general site ID or site QR code
        site_id = None
        if qr_data.startswith("SITE:"):
            try:
                site_id = int(qr_data.split(":")[1])
            except:
                pass
        elif qr_data.startswith("SITE_ID:"):
            try:
                site_id = int(qr_data.split(":")[1])
            except:
                pass
        elif qr_data.isdigit():
            site_id = int(qr_data)
            
        if site_id:
            # Check if this site QR is available for the employee's assigned site
            if emp_site_id is not None and int(site_id) != int(emp_site_id):
                return {
                    "success": True,
                    "message": "This QR code is not available for your assigned site.",
                    "type": "site_scan",
                    "site_id": site_id,
                    "checklists": []
                }
            
            # Find active checklists for this site
            active_checklists = db.query(Checklist).filter(
                Checklist.is_active == True
            ).all()
            
            filtered_checklists = filter_checklists_by_site(active_checklists, site_id)
            
            if not filtered_checklists:
                return {
                    "success": True,
                    "message": "Not any checklist available on this QR code.",
                    "type": "site_scan",
                    "site_id": site_id,
                    "checklists": []
                }
            
            # Find unsubmitted checklists
            from datetime import date
            today_start = datetime.combine(get_ist_today(), datetime.min.time())
            
            submitted_ids = []
            if active_shift:
                active_tour = get_active_tour(db, empOid)
                query = db.query(ChecklistResponse.checklist_id).filter(
                    ChecklistResponse.shift_id == active_shift.id,
                    ChecklistResponse.status == ResponseStatus.SUBMITTED
                )
                if active_tour:
                    query = query.filter(ChecklistResponse.submitted_at >= active_tour.start_time)
                submitted_ids_res = query.all()
                submitted_ids = [r[0] for r in submitted_ids_res]
            
            unsubmitted_checklists = [c for c in filtered_checklists if c.id not in submitted_ids]
            
            # Scan logged on submission instead of on scan
            if filtered_checklists and not unsubmitted_checklists:
                return {
                    "success": True,
                    "message": "Checklist for this site is already submitted for today.",
                    "type": "site_scan",
                    "site_id": site_id,
                    "checklists": []
                }
            
            return {
                "success": True,
                "message": f"Site checkpoint {site_id} scanned successfully.",
                "type": "site_scan",
                "site_id": site_id,
                "checklists": [
                    {
                        "id": c.id,
                        "title": c.title,
                        "description": c.description,
                        "question_count": db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == c.id).count()
                    } for c in unsubmitted_checklists
                ]
            }
        
        raise HTTPException(status_code=404, detail="Invalid QR Code. No checkpoint or site found.")
    
    # Check if this checkpoint QR is available for the employee's assigned site
    if emp_site_id is not None and int(checkpoint.site_id) != int(emp_site_id):
        return {
            "success": True,
            "message": "This QR code is not available for your assigned site.",
            "type": "checkpoint_scan",
            "checkpoint": {
                "id": checkpoint.id,
                "name": checkpoint.name,
                "site_id": checkpoint.site_id
            },
            "checklists": []
        }
        
    # Geofence Validation
    if checkpoint.latitude is not None and checkpoint.longitude is not None:
        import math
        lat1, lon1 = checkpoint.latitude, checkpoint.longitude
        lat2, lon2 = log_data.latitude, log_data.longitude
        
        if not lat2 or not lon2:
            raise HTTPException(status_code=400, detail="GPS coordinates are required to scan this checkpoint.")
            
        R = 6371000 # Radius of Earth in meters
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        distance = R * c
        
        allowed_radius = checkpoint.radius if checkpoint.radius is not None else 30
        if distance > allowed_radius:
            raise HTTPException(
                status_code=400, 
                detail=f"Out of range: You must be within {allowed_radius}m of the checkpoint location to scan. (Current distance: {round(distance, 1)}m)"
            )
            
    # Enforce strict sequential scanning validation
    if active_shift and checkpoint.site_id:
        from datetime import datetime as std_datetime
        today_start = std_datetime.combine(get_ist_today(), std_datetime.min.time())
        active_tour = get_active_tour(db, empOid)
        ensure_tour_ownership(db, active_tour, active_shift, empOid)
        
        # Check if this checkpoint is currently forwarded to someone else in the active tour session
        site_tour = active_tour
        if not site_tour:
            site_tour = db.query(PatrolTour).filter(
                PatrolTour.site_id == checkpoint.site_id,
                PatrolTour.status == "ongoing",
                PatrolTour.start_time >= today_start
            ).first()
            
        if site_tour:
            active_forward = db.query(PatrolLog).filter(
                PatrolLog.checkpoint_id == checkpoint.id,
                PatrolLog.tour_id == site_tour.id,
                PatrolLog.forwarded_to != None,
                PatrolLog.is_deleted == False
            ).order_by(PatrolLog.scan_time.desc()).first()
        else:
            active_forward = None
        
        if active_forward and active_forward.forwarded_to != empOid:
            assigned_name = db.execute(text("SELECT name FROM EMPLOYEE WHERE oid = :oid"), {"oid": active_forward.forwarded_to}).scalar() or "another guard"
            raise HTTPException(status_code=400, detail=f"This checkpoint is assigned to {assigned_name}.")

        is_assigned_to_me = active_forward and active_forward.forwarded_to == empOid
        if not is_assigned_to_me:
            all_cps = None
            if active_tour:
                active_checklists = db.query(Checklist).filter(
                    Checklist.is_active == True,
                    Checklist.title.like(f"{active_tour.tour_name} - %")
                ).all()
                active_checklists = filter_checklists_by_site(active_checklists, checkpoint.site_id)
                
                # Filter by role/designation
                if emp_designation:
                    filtered_ac = []
                    for ac in active_checklists:
                        if ac.required_roles:
                            try:
                                roles = json.loads(ac.required_roles)
                                if roles and not check_role_match(emp_designation, roles):
                                    continue
                            except:
                                pass
                        filtered_ac.append(ac)
                    active_checklists = filtered_ac
                
                checkpoint_ids = [c.checkpoint_id for c in active_checklists if c.checkpoint_id]
                if checkpoint_ids:
                    all_cps = db.query(Checkpoint).filter(Checkpoint.id.in_(checkpoint_ids)).order_by(Checkpoint.order, Checkpoint.id).all()
            
            if not all_cps:
                all_cps = db.query(Checkpoint).filter(Checkpoint.site_id == checkpoint.site_id).order_by(Checkpoint.order, Checkpoint.id).all()
            if all_cps:
                # Query all checkpoints successfully scanned today in current active tour (if any) or active shift
                active_tour = get_active_tour(db, empOid)
                if active_tour:
                    scanned_cps = db.query(PatrolLog.checkpoint_id).filter(
                        PatrolLog.tour_id == active_tour.id,
                        PatrolLog.scan_type == "QR",
                        PatrolLog.checkpoint_id != None,
                        PatrolLog.is_deleted == False
                    ).order_by(PatrolLog.scan_time.asc(), PatrolLog.id.asc()).all()
                else:
                    scanned_cps = db.query(PatrolLog.checkpoint_id).filter(
                        PatrolLog.shift_id == active_shift.id,
                        PatrolLog.scan_type == "QR",
                        PatrolLog.checkpoint_id != None,
                        PatrolLog.is_deleted == False
                    ).order_by(PatrolLog.scan_time.asc(), PatrolLog.id.asc()).all()
                scanned_in_shift = [c[0] for c in scanned_cps]
                scanned_ids = set(scanned_in_shift)
                
                # Find the next checkpoint to scan in sequence
                next_cp = None
                for cp in all_cps:
                    if cp.id not in scanned_ids:
                        next_cp = cp
                        break
                        
                # Closed Loop specific check:
                loop_type = get_site_loop_type(db, checkpoint.site_id)
                if loop_type == "Return Patrol" and next_cp is None:
                    first_cp_id = all_cps[0].id
                    last_cp_id = all_cps[-1].id
                    try:
                        last_cp_scan_indices = [i for i, cid in enumerate(scanned_in_shift) if cid == last_cp_id]
                        if last_cp_scan_indices:
                            last_scan_idx = last_cp_scan_indices[-1]
                            first_cp_scan_after = [i for i, cid in enumerate(scanned_in_shift) if cid == first_cp_id and i > last_scan_idx]
                            if not first_cp_scan_after:
                                next_cp = all_cps[0]
                    except Exception:
                        next_cp = all_cps[0]
                        
                if next_cp is None:
                    raise HTTPException(status_code=400, detail="All checkpoints for this round have already been successfully scanned.")
                elif checkpoint.id != next_cp.id:
                    raise HTTPException(status_code=400, detail=f"Please scan checkpoint '{next_cp.name}' first.")
        
    # Find active checklists for this checkpoint
    active_checklists = db.query(Checklist).filter(
        Checklist.is_active == True,
        Checklist.checkpoint_id == checkpoint.id
    ).all()
    
    # Filter by user's assigned site
    filtered_checklists = filter_checklists_by_site(active_checklists, emp_site_id)
    
    if not filtered_checklists:
        # Create PatrolLog since there are no checklists, logging the scan to allow sequential progression
        active_tour = get_active_tour(db, empOid)
        ensure_tour_ownership(db, active_tour, active_shift, empOid)
        new_log = PatrolLog(
            shift_id=active_shift.id if active_shift else None,
            tour_id=active_tour.id if active_tour else None,
            site_id=checkpoint.site_id,
            checkpoint_id=checkpoint.id,
            latitude=log_data.latitude,
            longitude=log_data.longitude,
            scan_type="QR",
            scan_time=datetime.now()
        )
        db.add(new_log)
        db.commit()
        
        tour_ended = False
        if active_shift:
            check_and_auto_end_tour(db, active_shift, log_data.latitude, log_data.longitude)
            latest_active_tour = get_active_tour(db, empOid)
            if active_tour and not latest_active_tour:
                tour_ended = True
            
        if tour_ended:
            return {
                "success": True,
                "message": "Patrol tour ended automatically.",
                "type": "checkpoint_scan",
                "checkpoint": {
                    "id": checkpoint.id,
                    "name": checkpoint.name,
                    "site_id": checkpoint.site_id
                },
                "checklists": []
            }

        return {
            "success": True,
            "message": "Not any checklist available on this QR code. Scan logged.",
            "type": "checkpoint_scan",
            "checkpoint": {
                "id": checkpoint.id,
                "name": checkpoint.name,
                "site_id": checkpoint.site_id
            },
            "checklists": []
        }
        
    # Scan logged on submission instead of on scan
    
    # Find unsubmitted checklists
    from datetime import date
    today_start = datetime.combine(get_ist_today(), datetime.min.time())
    
    submitted_ids = []
    if active_shift:
        active_tour = get_active_tour(db, empOid)
        query = db.query(ChecklistResponse.checklist_id).filter(
            ChecklistResponse.shift_id == active_shift.id,
            ChecklistResponse.status == ResponseStatus.SUBMITTED
        )
        if active_tour:
            query = query.filter(ChecklistResponse.submitted_at >= active_tour.start_time)
        submitted_ids_res = query.all()
        submitted_ids = [r[0] for r in submitted_ids_res]
    
    unsubmitted_checklists = [c for c in filtered_checklists if c.id not in submitted_ids]
    
    if filtered_checklists and not unsubmitted_checklists:
        # Create PatrolLog since it's already submitted, but they scanned it again (e.g. to end closed loop tour)
        active_tour = get_active_tour(db, empOid)
        new_log = PatrolLog(
            shift_id=active_shift.id if active_shift else None,
            tour_id=active_tour.id if active_tour else None,
            site_id=checkpoint.site_id,
            checkpoint_id=checkpoint.id,
            latitude=log_data.latitude,
            longitude=log_data.longitude,
            scan_type="QR",
            scan_time=datetime.now()
        )
        db.add(new_log)
        db.commit()
        
        tour_ended = False
        if active_shift:
            check_and_auto_end_tour(db, active_shift, log_data.latitude, log_data.longitude)
            latest_active_tour = get_active_tour(db, empOid)
            if active_tour and not latest_active_tour:
                tour_ended = True
            
        if tour_ended:
            return {
                "success": True,
                "message": "Patrol tour ended automatically.",
                "type": "checkpoint_scan",
                "checkpoint": {
                    "id": checkpoint.id,
                    "name": checkpoint.name,
                    "site_id": checkpoint.site_id
                },
                "checklists": []
            }
            
        return {
            "success": True,
            "message": f"Checklist for checkpoint '{checkpoint.name}' is already submitted for today.",
            "type": "checkpoint_scan",
            "checkpoint": {
                "id": checkpoint.id,
                "name": checkpoint.name,
                "site_id": checkpoint.site_id
            },
            "checklists": []
        }
    
    return {
        "success": True,
        "message": f"Checkpoint '{checkpoint.name}' scanned successfully.",
        "type": "checkpoint_scan",
        "checkpoint": {
            "id": checkpoint.id,
            "name": checkpoint.name,
            "site_id": checkpoint.site_id
        },
        "checklists": [
            {
                "id": c.id,
                "title": c.title,
                "description": c.description,
                "question_count": db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == c.id).count()
            } for c in unsubmitted_checklists
        ]
    }

@router.get("/checkpoints")
def get_checkpoints(site_id: Optional[int] = Query(None), db: Session = Depends(get_patrol_db)):
    query = db.query(Checkpoint)
    if site_id is not None:
        query = query.filter(Checkpoint.site_id == site_id)
    return query.order_by(Checkpoint.order, Checkpoint.id).all()

@router.get("/checklists/assigned")
def get_checklists(empOid: int = Query(...), checkpoint_id: Optional[int] = Query(None), db: Session = Depends(get_patrol_db)):
    from datetime import date, datetime
    today_start = datetime.combine(get_ist_today(), datetime.min.time())
    
    active_tour = None
    active_shift = get_active_shift(db, empOid)
    submitted_ids = []
    if active_shift:
        active_tour = get_active_tour(db, empOid)
        query = db.query(ChecklistResponse.checklist_id).filter(
            ChecklistResponse.shift_id == active_shift.id,
            ChecklistResponse.status == ResponseStatus.SUBMITTED
        )
        if active_tour:
            query = query.filter(ChecklistResponse.submitted_at >= active_tour.start_time)
        submitted_ids_res = query.all()
        submitted_ids = [r[0] for r in submitted_ids_res]
    
    # 1. Get employee's assigned site and designation
    emp_info_sql = text("""
        SELECT e.site, d.name as designation 
        FROM EMPLOYEE e
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        WHERE e.oid = :oid
    """)
    emp_info = db.execute(emp_info_sql, {"oid": empOid}).mappings().first()
    emp_site_id = emp_info["site"] if emp_info else None
    emp_designation = emp_info["designation"] if emp_info else None
 
    # 2. Return checklists that are active and NOT in the submitted list
    query = db.query(Checklist).filter(
        Checklist.is_active == True,
        ~Checklist.id.in_(submitted_ids) if submitted_ids else True
    )
    if active_tour:
        # Only return checklists whose title prefix matches the active tour's name
        query = query.filter(Checklist.title.like(f"{active_tour.tour_name} - %"))
    
    if checkpoint_id is not None:
        query = query.filter(Checklist.checkpoint_id == checkpoint_id)
        all_active = query.all()
    else:
        # If no checkpoint is scanned, do not show any checklists directly
        return []
    
    # 3. Filter by site
    checklists = filter_checklists_by_site(all_active, emp_site_id)
    
    # 4. Filter by role/designation
    import json
    filtered_checklists = []
    for c in checklists:
        if c.required_roles:
            try:
                roles = json.loads(c.required_roles)
                # If roles list is not empty, employee designation must match one of them
                if roles:
                    if not check_role_match(emp_designation, roles):
                        continue
            except Exception as e:
                print(f"Error parsing required_roles for checklist {c.id}: {e}")
        filtered_checklists.append(c)
    checklists = filtered_checklists
    
    # Add question count and site names to each checklist
    emp_site_name = db.execute(text("SELECT s.name FROM SITE s JOIN EMPLOYEE e ON e.SITE = s.oid WHERE e.oid = :oid"), {"oid": empOid}).scalar() or "General Site"
    
    result = []
    for c in checklists:
        q_count = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == c.id).count()
        
        # Get site names
        site_names_str = ""
        if c.site_ids:
            try:
                import json
                s_ids = json.loads(c.site_ids)
                if s_ids:
                    s_names = db.execute(text("SELECT name FROM SITE WHERE oid IN :ids"), {"ids": tuple(s_ids)}).scalars().all()
                    site_names_str = ", ".join(s_names)
            except:
                site_names_str = "Unknown Site"
        
        # Fallback to employee's site if checklist is global
        if not site_names_str:
            site_names_str = emp_site_name
            
        # Get checkpoint name if checkpoint_id is set
        checkpoint_name = ""
        if c.checkpoint_id:
            checkpoint_name = db.query(Checkpoint.name).filter(Checkpoint.id == c.checkpoint_id).scalar() or ""
                
        c_dict = {
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "industry": c.industry,
            "is_active": c.is_active,
            "question_count": q_count,
            "site_names": site_names_str,
            "checkpoint_name": checkpoint_name
        }
        result.append(c_dict)
    
    return result


@router.get("/checklists/{checklist_id}")
def get_checklist_details(checklist_id: int, empOid: Optional[int] = Query(None), db: Session = Depends(get_patrol_db)):
    checklist = db.query(Checklist).filter(Checklist.id == checklist_id).first()
    links = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.checklist_id == checklist_id).order_by(ChecklistQuestionLink.order).all()
    
    # Look for an existing DRAFT for this user and checklist
    existing_response = None
    if empOid:
        existing_response = db.query(ChecklistResponse).filter(
            ChecklistResponse.checklist_id == checklist_id,
            ChecklistResponse.user_id == empOid,
            ChecklistResponse.status == ResponseStatus.DRAFT
        ).order_by(ChecklistResponse.created_at.desc()).first()
    
    questions = []
    for link in links:
        q = db.query(Question).filter(Question.id == link.question_id).first()
        if q:
            current_answer = None
            current_comment = None
            current_media = []
            if existing_response:
                ans = db.query(QuestionAnswer).filter(
                    QuestionAnswer.response_id == existing_response.id,
                    QuestionAnswer.question_link_id == link.id
                ).first()
                if ans:
                    current_answer = ans.answer_value
                    current_comment = ans.comment
                    if ans.media_urls:
                        import json
                        try:
                            current_media = json.loads(ans.media_urls)
                        except:
                            current_media = [ans.media_urls]

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
                "link_id": link.id,
                "text": q.text,
                "response_type": q.response_type,
                "options": parsed_options,
                "is_critical": link.is_critical,
                "requires_photo": link.requires_photo,
                "requires_video": link.requires_video,
                "requires_doc": link.requires_doc,
                "requires_comment": link.requires_comment,
                "current_answer": current_answer,
                "current_comment": current_comment,
                "current_media": current_media
            })
    
    return {
        "id": checklist.id,
        "title": checklist.title,
        "response_id": existing_response.id if existing_response else None,
        "questions": questions
    }

@router.post("/checklists/{checklist_id}/start")
def start_checklist(checklist_id: int, data: ShiftStart, empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    active_shift = get_active_shift(db, empOid)
    
    new_response = ChecklistResponse(
        checklist_id=checklist_id,
        user_id=empOid,
        shift_id=active_shift.id if active_shift else None,
        site_id=data.site_id,
        latitude=data.start_latitude,
        longitude=data.start_longitude,
        status=ResponseStatus.DRAFT
    )
    db.add(new_response)
    db.commit()
    db.refresh(new_response)
    return {"response_id": new_response.id}

@router.patch("/checklists/responses/{response_id}/answer")
def save_answer(response_id: int, data: QuestionAnswerRequest, db: Session = Depends(get_patrol_db)):
    answer = db.query(QuestionAnswer).filter(QuestionAnswer.response_id == response_id, QuestionAnswer.question_link_id == data.question_link_id).first()
    if answer:
        answer.answer_value = data.answer_value
        answer.comment = data.comment
        answer.media_urls = data.media_urls
    else:
        answer = QuestionAnswer(
            response_id=response_id,
            question_link_id=data.question_link_id,
            answer_value=data.answer_value,
            comment=data.comment,
            media_urls=data.media_urls
        )
        db.add(answer)
    db.commit()
    return {"message": "Answer saved"}

@router.post("/checklists/responses/{response_id}/submit")
def submit_checklist(response_id: int, data: ChecklistSubmitRequest, db: Session = Depends(get_patrol_db)):
    resp = db.query(ChecklistResponse).filter(ChecklistResponse.id == response_id).first()
    if not resp:
        raise HTTPException(status_code=404, detail="Response not found")
    
    resp.status = ResponseStatus.SUBMITTED
    resp.submitted_at = datetime.now()
    resp.latitude = data.latitude
    resp.longitude = data.longitude
    
    # Retrieve the checkpoint_id from the checklist to track scan accurately
    checklist = db.query(Checklist).filter(Checklist.id == resp.checklist_id).first()
    checkpoint_id = checklist.checkpoint_id if checklist else None

    user_id = None
    active_tour = None
    if resp.shift_id:
        active_shift = db.query(Shift).filter(Shift.id == resp.shift_id).first()
        if active_shift:
            user_id = active_shift.user_id
            active_tour = get_active_tour(db, user_id)
            ensure_tour_ownership(db, active_tour, active_shift, user_id)

    # Create PatrolLog only when the checklist is successfully submitted!
    new_log = PatrolLog(
        shift_id=resp.shift_id,
        tour_id=active_tour.id if active_tour else None,
        site_id=resp.site_id,
        checkpoint_id=checkpoint_id,
        latitude=data.latitude,
        longitude=data.longitude,
        scan_type="QR",
        scan_time=datetime.now()
    )
    db.add(new_log)
    db.commit()
    
    if resp.shift_id:
        active_shift = db.query(Shift).filter(Shift.id == resp.shift_id).first()
        if active_shift:
            check_and_auto_end_tour(db, active_shift, data.latitude, data.longitude)
            
    return {"message": "Checklist submitted"}

@router.post("/incident/report")
def report_incident(data: IncidentReportRequest, empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    # Verify Attendance Status
    from ...services.attendance_service import get_today_status_logic
    att_status = get_today_status_logic(empOid)
    
    if not att_status.get("success") or not att_status.get("record"):
        raise HTTPException(status_code=403, detail="Punch In Required: You must Punch In for attendance before submitting an incident report.")
    
    record = att_status["record"]
    if record.get("check_out"):
        raise HTTPException(status_code=403, detail="Submission Restricted: You have already Punched Out for today. You cannot submit an incident report.")

    new_incident = Incident(
        user_id=empOid,
        site_id=data.site_id,
        incident_type=data.incident_type,
        risk_category=data.risk_category,
        latitude=data.latitude,
        longitude=data.longitude,
        media_urls=data.media_urls,
        incident_date=data.incident_date,
        incident_time=data.incident_time,
        location_text=data.location_text,
        brief_description=data.brief_description,
        damage_loss=data.damage_loss,
        tentative_costing=data.tentative_costing,
        injury_caused=data.injury_caused,
        corrective_action=data.corrective_action,
        remarks=data.remarks
    )
    db.add(new_incident)
    db.commit()
    return {"message": "Incident reported"}

@router.post("/incident/sos")
def trigger_sos(data: SOSRequest, empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    active_shift = get_active_shift(db, empOid)
    new_sos = SOSAlert(
        user_id=empOid,
        shift_id=active_shift.id if active_shift else None,
        latitude=data.latitude,
        longitude=data.longitude,
        status=SOSAlertStatus.TRIGGERED
    )
    db.add(new_sos)
    db.commit()
    return {"message": "SOS triggered"}

@router.get("/patrol/history")
def get_patrol_history(empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    from datetime import date, datetime
    today = get_ist_today()
    start_of_day = datetime.combine(today, datetime.min.time())
    
    # 1. Get Shifts today
    shifts = db.query(Shift).filter(
        Shift.user_id == empOid,
        Shift.start_time >= start_of_day
    ).order_by(Shift.start_time.desc()).all()
    shift_logs = []
    for s in shifts:
        shift_logs.append({
            "id": f"shift_{s.id}",
            "type": "SHIFT",
            "title": f"Patrol Shift {s.site_id}",
            "start_time": s.start_time,
            "end_time": s.end_time,
            "status": "COMPLETED" if s.end_time else "ACTIVE"
        })

    # 2. Get Incidents today
    incidents = db.query(Incident).filter(
        Incident.user_id == empOid,
        Incident.reported_at >= start_of_day
    ).order_by(Incident.reported_at.desc()).all()
    incident_logs = []
    for i in incidents:
        # Get site name
        site_name = db.execute(text("SELECT name FROM SITE WHERE oid = :oid"), {"oid": i.site_id}).scalar() if i.site_id else "Unknown Site"
        incident_logs.append({
            "id": i.id,
            "type": "INCIDENT",
            "title": i.incident_type,
            "fact_found": i.brief_description,
            "site_name": site_name,
            "time": i.reported_at,
            "media_urls": i.media_urls,
            "status": "RESOLVED" if i.is_resolved else "PENDING"
        })

    # 3. Get Checklist Submissions today
    checklists = db.query(ChecklistResponse).filter(
        ChecklistResponse.user_id == empOid,
        ChecklistResponse.status == ResponseStatus.SUBMITTED,
        ChecklistResponse.submitted_at >= start_of_day
    ).order_by(ChecklistResponse.submitted_at.desc()).all()
    checklist_logs = []
    for c in checklists:
        title = db.query(Checklist.title).filter(Checklist.id == c.checklist_id).scalar()
        # Get site name
        site_name = db.execute(text("SELECT name FROM SITE WHERE oid = :oid"), {"oid": c.site_id}).scalar() if c.site_id else "Unknown Site"
        checklist_logs.append({
            "id": c.id,
            "type": "CHECKLIST",
            "title": title or "Patrol Checklist",
            "site_name": site_name,
            "time": c.submitted_at,
            "status": "SUBMITTED"
        })

    return {
        "shifts": shift_logs,
        "incidents": incident_logs,
        "checklists": checklist_logs
    }

@router.get("/checklists/responses/{response_id}/details")
def get_response_details(response_id: int, db: Session = Depends(get_patrol_db)):
    resp = db.query(ChecklistResponse).filter(ChecklistResponse.id == response_id).first()
    if not resp:
        raise HTTPException(status_code=404, detail="Response not found")
        
    checklist = db.query(Checklist).filter(Checklist.id == resp.checklist_id).first()
    
    # Get employee info (using lowercase table name and null check)
    emp_sql = text("""
        SELECT e.emp_code, e.name, d.name as designation 
        FROM EMPLOYEE e
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        WHERE e.oid = :oid
    """)
    emp = db.execute(emp_sql, {"oid": resp.user_id}).mappings().first()
    
    # Get site info
    site_sql = text("""
        SELECT s.name as site_name, c.name as client_name 
        FROM SITE s
        LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid
        WHERE s.oid = :oid
    """)
    site = db.execute(site_sql, {"oid": resp.site_id}).mappings().first() if resp.site_id else None
    
    # Fallback: If site info is missing for the response, try to get employee's assigned site
    if not site:
        site = db.execute(site_sql, {"oid": emp_site_id}).mappings().first() if emp_site_id else None

    answers = db.query(QuestionAnswer).filter(QuestionAnswer.response_id == response_id).all()
    results = []
    for a in answers:
        link = db.query(ChecklistQuestionLink).filter(ChecklistQuestionLink.id == a.question_link_id).first()
        q = db.query(Question).filter(Question.id == link.question_id).first() if link else None
        results.append({
            "question": q.text if q else "Unknown Question",
            "answer": a.answer_value,
            "comment": a.comment,
            "media_urls": a.media_urls
        })
        
    return {
        "id": resp.id,
        "checklist_title": checklist.title if checklist else "Unknown",
        "submitted_at": resp.submitted_at,
        "employee_name": emp["name"] if emp else "Unknown",
        "employee_code": emp["emp_code"] if emp else "Unknown",
        "designation": emp["designation"] if emp else "Security Professional",
        "site_name": site["site_name"] if site else "Unknown",
        "client_name": site["client_name"] if site else "AMA FACILITY",
        "answers": results
    }
@router.get("/incidents/{incident_id}")
def get_incident_details(incident_id: int, db: Session = Depends(get_patrol_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    site_data = db.execute(text("""
        SELECT s.name as site_name, c.name as client_name 
        FROM SITE s
        LEFT JOIN CLIENTT c ON s.CLIENTT = c.oid
        WHERE s.oid = :oid
    """), {"oid": inc.site_id}).mappings().first() if inc.site_id else None

    emp_data = db.execute(text("""
        SELECT e.name as employee_name, d.name as designation 
        FROM EMPLOYEE e
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        WHERE e.oid = :oid
    """), {"oid": inc.user_id}).mappings().first() if inc.user_id else None

    # Parse media_urls from stored JSON string into a proper list
    import json as _json
    media_list = []
    if inc.media_urls:
        try:
            media_list = _json.loads(inc.media_urls)
        except Exception:
            media_list = [inc.media_urls] if inc.media_urls else []

    return {
        "id": inc.id,
        "category": inc.incident_type,
        "incident_type": inc.incident_type,
        "fact_found": inc.brief_description,
        "observation": inc.injury_caused,
        "suggestions": inc.corrective_action,
        "want_reminder": False,
        "expected_resolve_time": None,
        "risk_category": inc.risk_category,
        "reported_at": inc.reported_at,
        "latitude": inc.latitude,
        "longitude": inc.longitude,
        "is_resolved": inc.is_resolved,
        "media_urls": media_list,
        "site_name": site_data["site_name"] if site_data else "Unknown Site",
        "client_name": site_data["client_name"] if site_data else "AMA FACILITY",
        "employee_name": emp_data["employee_name"] if emp_data else "Unknown Officer",
        "designation": emp_data["designation"] if emp_data else "Security Professional",
        "incident_date": inc.incident_date,
        "incident_time": inc.incident_time,
        "location_text": inc.location_text,
        "brief_description": inc.brief_description,
        "damage_loss": inc.damage_loss,
        "tentative_costing": inc.tentative_costing,
        "injury_caused": inc.injury_caused,
        "corrective_action": inc.corrective_action,
        "remarks": inc.remarks
    }

from pydantic import BaseModel

class PatrolForwardRequest(BaseModel):
    checkpoint_id: int
    tour_name: str
    forwarded_to: int
    site_id: int
    reason: str
    latitude: float
    longitude: float

@router.get("/site/employees")
def get_site_employees(empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    today = get_ist_today()
    # Try to get site from active shift first
    active_shift = db.query(Shift).filter(Shift.user_id == empOid, Shift.end_time == None).first()
    if active_shift and active_shift.site_id:
        emp_site_id = active_shift.site_id
    else:
        # Fallback to active attendance log site
        emp_site_id = db.execute(text("""
            SELECT ac.ATTENDANCE_SITE FROM ATTENDANCE_TIME_LOG atl
            JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
            WHERE ac.EMPLOYEE = :oid AND ac.attendance_date = :today 
              AND atl.in_time IS NOT NULL AND atl.out_time IS NULL 
            ORDER BY atl.oid DESC LIMIT 1
        """), {"oid": empOid, "today": today}).scalar()
        
        # Fallback to employee profile site
        if not emp_site_id:
            emp_site_id = db.execute(text("SELECT site FROM EMPLOYEE WHERE oid = :oid"), {"oid": empOid}).scalar()
            
    if not emp_site_id:
        return []
        
    employees = db.execute(text("""
        SELECT DISTINCT e.oid as id, e.name, e.emp_code, d.name as role_name 
        FROM EMPLOYEE e
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        JOIN ATTENDANCE_CELL ac ON e.oid = ac.EMPLOYEE
        JOIN ATTENDANCE_TIME_LOG log ON ac.oid = log.ATTENDANCE_CELL
        WHERE (ac.ATTENDANCE_SITE = :site_id OR e.site = :site_id)
          AND ac.attendance_date = :today
          AND log.in_time IS NOT NULL
          AND log.out_time IS NULL
          AND e.oid != :emp_oid 
          AND e.active = 1
    """), {"site_id": emp_site_id, "emp_oid": empOid, "today": today}).mappings().all()
    return [{"id": r["id"], "name": r["name"], "emp_code": r["emp_code"], "role": r["role_name"] or "Security Guard"} for r in employees]


@router.post("/patrol/forward")
def forward_patrol(data: PatrolForwardRequest, empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    active_shift = get_active_shift(db, empOid)
    active_tour = get_active_tour(db, empOid)
    if active_tour:
        active_tour.status = "forwarded"
        
    new_log = PatrolLog(
        shift_id=active_shift.id if active_shift else None,
        tour_id=active_tour.id if active_tour else None,
        site_id=data.site_id,
        checkpoint_id=data.checkpoint_id,
        latitude=data.latitude,
        longitude=data.longitude,
        scan_type="FORWARD",
        scan_time=get_ist_now(),
        forwarded_to=data.forwarded_to,
        reason=data.reason
    )
    db.add(new_log)
    db.commit()
    return {"success": True, "message": "Baton forwarded successfully."}

@router.post("/patrol/revoke")
def revoke_checkpoint(empOid: int = Query(...), checkpoint_id: int = Query(...), db: Session = Depends(get_patrol_db)):
    today = get_ist_today()
    from datetime import datetime as std_datetime
    start_of_day = std_datetime.combine(today, std_datetime.min.time())
    log = db.query(PatrolLog).join(Shift).filter(
        Shift.user_id == empOid,
        PatrolLog.checkpoint_id == checkpoint_id,
        PatrolLog.scan_time >= start_of_day,
        PatrolLog.is_deleted == False
    ).order_by(PatrolLog.scan_time.desc()).first()
    if log:
        log.is_deleted = True
        db.commit()
        return {"success": True, "message": "Checkpoint log revoked successfully."}
    log_direct = db.query(PatrolLog).filter(
        PatrolLog.checkpoint_id == checkpoint_id,
        PatrolLog.scan_time >= start_of_day,
        PatrolLog.is_deleted == False
    ).order_by(PatrolLog.scan_time.desc()).first()
    if log_direct:
        log_direct.is_deleted = True
        db.commit()
        return {"success": True, "message": "Checkpoint log revoked successfully."}
    raise HTTPException(status_code=404, detail="No scan log found to revoke for this checkpoint today.")

@router.post("/patrol/tour/reset")
def reset_tour(empOid: int = Query(...), tour_id: str = Query(...), db: Session = Depends(get_patrol_db)):
    active_shift = get_active_shift(db, empOid)
    if not active_shift:
        raise HTTPException(status_code=400, detail="No active shift found to reset.")

    emp_site_id = active_shift.site_id
    if emp_site_id:
        checkpoint_ids = []
        if tour_id.startswith("tour_"):
            # Fallback hardcoded tours
            all_cps = db.query(Checkpoint).filter(Checkpoint.site_id == emp_site_id).all()
            if tour_id == 'tour_2':
                checkpoint_ids = [cp.id for cp in all_cps if 'server' in cp.name.lower()]
            elif tour_id == 'tour_1':
                checkpoint_ids = [cp.id for cp in all_cps if 'server' not in cp.name.lower()]
            else:
                checkpoint_ids = [cp.id for cp in all_cps]
        else:
            # Dynamic tour matching from active checklists
            checklists = db.query(Checklist).filter(Checklist.is_active == True).all()
            for c in checklists:
                import json
                try:
                    c_site_ids = json.loads(c.site_ids) if c.site_ids else []
                    if emp_site_id in c_site_ids:
                        parts = c.title.split(" - ")
                        if parts[0] == tour_id and c.checkpoint_id:
                            checkpoint_ids.append(c.checkpoint_id)
                except:
                    continue

        active_tour = get_active_tour(db, empOid)
        if active_tour:
            if checkpoint_ids:
                logs = db.query(PatrolLog).filter(
                    PatrolLog.tour_id == active_tour.id,
                    PatrolLog.checkpoint_id.in_(checkpoint_ids),
                    PatrolLog.is_deleted == False
                ).all()
                for log in logs:
                    log.is_deleted = True
                db.commit()
                return {"success": True, "message": f"Tour {tour_id} reset successfully."}
            else:
                logs = db.query(PatrolLog).filter(
                    PatrolLog.tour_id == active_tour.id,
                    PatrolLog.is_deleted == False
                ).all()
                for log in logs:
                    log.is_deleted = True
                db.commit()
                return {"success": True, "message": "Tour reset successfully."}
    raise HTTPException(status_code=404, detail="Employee or site not found.")

@router.post("/patrol/tour/start")
def start_patrol_tour(tour_name: str = Query(...), empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    active_shift = get_active_shift(db, empOid)
    if not active_shift:
        raise HTTPException(status_code=400, detail="No active shift found. Please start a shift first.")
        
    # Check if there is any other tour assigned/passed to the user that they must complete first
    emp_site_id = active_shift.site_id
    if emp_site_id:
        assigned_tours = db.query(PatrolTour).filter(
            PatrolTour.site_id == emp_site_id,
            PatrolTour.status.in_(["ongoing", "forwarded"])
        ).all()
        for t in assigned_tours:
            runner, is_f = get_tour_active_runner_and_status(db, t)
            if runner == empOid and t.tour_name.lower().strip() != tour_name.lower().strip():
                has_forward_log = db.query(PatrolLog).filter(
                    PatrolLog.tour_id == t.id,
                    PatrolLog.forwarded_to == empOid,
                    PatrolLog.is_deleted == False
                ).first()
                if has_forward_log:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Tour '{t.tour_name}' was assigned/passed to you. You must complete or transfer it first before starting another tour."
                    )
        
    active_tour = get_active_tour(db, empOid)
    
    # 1. If the employee already has this exact tour active, return success
    if active_tour and active_tour.tour_name == tour_name:
        ensure_tour_ownership(db, active_tour, active_shift, empOid)
        if active_shift:
            active_shift.active_tour = tour_name
            db.commit()
        return {"success": True, "message": f"Tour '{tour_name}' already started.", "tour_id": active_tour.id}
        
    # 2. If the employee has a DIFFERENT tour active, close/cancel it first
    if active_tour and active_tour.tour_name != tour_name:
        checkpoint_ids = []
        checklists = db.query(Checklist).filter(
            Checklist.is_active == True,
            Checklist.title.like(f"{active_tour.tour_name} - %")
        ).all()
        if active_tour.site_id:
            checklists = filter_checklists_by_site(checklists, active_tour.site_id)
        checkpoint_ids = [c.checkpoint_id for c in checklists if c.checkpoint_id]
        
        if not checkpoint_ids:
            all_cps = db.query(Checkpoint).filter(Checkpoint.site_id == active_tour.site_id).all() if active_tour.site_id else []
        else:
            all_cps = db.query(Checkpoint).filter(Checkpoint.id.in_(checkpoint_ids)).all()
            
        scanned_cps = db.query(PatrolLog.checkpoint_id).filter(
            PatrolLog.tour_id == active_tour.id,
            PatrolLog.scan_type == "QR",
            PatrolLog.checkpoint_id != None,
            PatrolLog.is_deleted == False
        ).all()
        scanned_ids = {c[0] for c in scanned_cps}
        all_cp_ids = {cp.id for cp in all_cps}
        
        if all_cp_ids and all_cp_ids.issubset(scanned_ids):
            active_tour.status = "completed"
        else:
            active_tour.status = "cancelled"
        active_tour.end_time = datetime.now()
        db.commit()
        
    # 3. Check if another guard is active on this new tour at the same site
    emp_site_id = active_shift.site_id
    if emp_site_id:
        other_ongoing_tour = db.query(PatrolTour).filter(
            PatrolTour.site_id == emp_site_id,
            PatrolTour.tour_name == tour_name,
            PatrolTour.status.in_(["ongoing", "forwarded"])
        ).first()
        if other_ongoing_tour:
            active_runner = get_tour_active_runner(db, other_ongoing_tour)
            if active_runner != empOid:
                other_guard_name = db.execute(text("SELECT name FROM EMPLOYEE WHERE oid = :oid"), {"oid": active_runner}).scalar() or "another employee"
                raise HTTPException(status_code=400, detail=f"Tour is already in progress by {other_guard_name}.")
            else:
                # Take ownership/resume the tour from the previous guard
                other_ongoing_tour.user_id = empOid
                other_ongoing_tour.shift_id = active_shift.id
                other_ongoing_tour.status = "ongoing"
                active_shift.active_tour = tour_name
                db.commit()
                return {"success": True, "message": f"Tour '{tour_name}' resumed from previous guard.", "tour_id": other_ongoing_tour.id}
            
    new_tour = PatrolTour(
        shift_id=active_shift.id,
        user_id=empOid,
        site_id=active_shift.site_id,
        tour_name=tour_name,
        start_time=datetime.now(),
        status="ongoing"
    )
    db.add(new_tour)
    active_shift.active_tour = tour_name
    db.commit()
    db.refresh(new_tour)
    return {"success": True, "message": f"Tour '{tour_name}' started.", "tour_id": new_tour.id}

@router.post("/patrol/tour/cancel")
def cancel_patrol_tour(empOid: int = Query(...), db: Session = Depends(get_patrol_db)):
    active_shift = get_active_shift(db, empOid)
    active_tour = get_active_tour(db, empOid)
    if active_tour:
        # Check if the tour has been forwarded to someone else
        has_forward = db.query(PatrolLog).filter(
            PatrolLog.tour_id == active_tour.id,
            PatrolLog.forwarded_to != None,
            PatrolLog.is_deleted == False
        ).first()
        if active_tour.user_id != empOid:
            # Not the owner (tour forwarded to this employee), do not cancel the original tour
            pass
        elif has_forward:
            # Tour has been forwarded, keep it active/ongoing for the next guard
            pass
        else:
            if active_tour.status == "ongoing":
                checkpoint_ids = []
                checklists = db.query(Checklist).filter(
                    Checklist.is_active == True,
                    Checklist.title.like(f"{active_tour.tour_name} - %")
                ).all()
                if active_tour.site_id:
                    checklists = filter_checklists_by_site(checklists, active_tour.site_id)
                checkpoint_ids = [c.checkpoint_id for c in checklists if c.checkpoint_id]
                
                if not checkpoint_ids:
                    all_cps = db.query(Checkpoint).filter(Checkpoint.site_id == active_tour.site_id).all() if active_tour.site_id else []
                else:
                    all_cps = db.query(Checkpoint).filter(Checkpoint.id.in_(checkpoint_ids)).all()
                    
                scanned_cps = db.query(PatrolLog.checkpoint_id).filter(
                    PatrolLog.tour_id == active_tour.id,
                    PatrolLog.scan_type == "QR",
                    PatrolLog.checkpoint_id != None,
                    PatrolLog.is_deleted == False
                ).all()
                scanned_ids = {c[0] for c in scanned_cps}
                all_cp_ids = {cp.id for cp in all_cps}
                
                if all_cp_ids and all_cp_ids.issubset(scanned_ids):
                    active_tour.status = "completed"
                else:
                    active_tour.status = "cancelled"
                active_tour.end_time = datetime.now()
    if active_shift:
        active_shift.active_tour = None
    db.commit()
    return {"success": True, "message": "Tour exited/cancelled successfully."}
