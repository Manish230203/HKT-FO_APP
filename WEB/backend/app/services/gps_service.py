import math
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.database import SessionLocal, get_db_connection
from app.models.patrol_models import GPSLocationLog, SiteVisitSession, PlannedVisitSchedule

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

class GPSManager:
    # Connected WebSocket clients for Area Manager live view
    active_websockets = set()

    @classmethod
    def register_ws(cls, ws):
        cls.active_websockets.add(ws)

    @classmethod
    def unregister_ws(cls, ws):
        cls.active_websockets.discard(ws)

    @classmethod
    async def broadcast_location(cls, data: dict):
        disconnected = set()
        for ws in cls.active_websockets:
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.add(ws)
        for ws in disconnected:
            cls.active_websockets.discard(ws)


def ingest_gps_locations_service(db: Session, employee_id: int, points: List[Dict[str, Any]], shift_id: Optional[int] = None) -> Dict[str, Any]:
    if not points:
        return {"success": True, "processed": 0, "message": "No points to process"}

    # Enforce Duty Punch-In: Only record GPS location logs in DB if officer is currently punched in for duty
    try:
        from app.services.attendance_service import get_today_status_logic
        att_res = get_today_status_logic(employee_id)
        att_rec = att_res.get("record") if att_res and att_res.get("success") else None
        is_punched_in = bool(att_rec and att_rec.get("check_in") and not att_rec.get("check_out"))

        if not is_punched_in:
            return {
                "success": True,
                "processed": 0,
                "punched_in": False,
                "message": "Officer is not currently punched in for duty. Location logging ignored."
            }
    except Exception as att_err:
        print("Warning checking duty status in ingest_gps_locations_service:", att_err)

    from geopy.distance import geodesic

    last_log = (
        db.query(GPSLocationLog)
        .filter(GPSLocationLog.employee_id == employee_id)
        .order_by(GPSLocationLog.recorded_at.desc())
        .first()
    )

    saved_logs = []
    for pt in points:
        lat = float(pt.get("latitude", 0.0))
        lon = float(pt.get("longitude", 0.0))
        accuracy = float(pt.get("accuracy", 0.0)) if pt.get("accuracy") is not None else None
        raw_speed = float(pt.get("speed", 0.0)) if pt.get("speed") is not None else 0.0
        speed = raw_speed if raw_speed > 0 else 0.0
        battery = float(pt.get("battery_level", 100.0)) if pt.get("battery_level") is not None else None
        is_mock = bool(pt.get("is_mock", False))
        
        rec_time_str = pt.get("recorded_at")
        rec_time = datetime.now()
        if rec_time_str:
            try:
                if "T" not in str(rec_time_str) and "+" not in str(rec_time_str) and "Z" not in str(rec_time_str):
                    rec_time = datetime.strptime(str(rec_time_str)[:19], "%Y-%m-%d %H:%M:%S")
                else:
                    parsed_dt = datetime.fromisoformat(str(rec_time_str).replace("Z", "+00:00"))
                    if parsed_dt.tzinfo is not None:
                        rec_time = parsed_dt.astimezone().replace(tzinfo=None)
                    else:
                        rec_time = parsed_dt
            except Exception as parse_err:
                print(f"Error parsing recorded_at '{rec_time_str}': {parse_err}")
                rec_time = datetime.now()

        # Adaptive filter: ignore extremely inaccurate GPS fixes (> 150m accuracy threshold)
        if accuracy is not None and accuracy > 150.0:
            continue

        # Stationary Check:
        # If the new ping is within < 15 meters of the officer's last recorded GPS point,
        # update/overwrite the last row's recorded_at and battery_level (do NOT insert a new row).
        if last_log:
            try:
                dist = geodesic((last_log.latitude, last_log.longitude), (lat, lon)).meters
                if dist < 15.0:
                    last_log.recorded_at = rec_time
                    if battery is not None:
                        last_log.battery_level = battery
                    continue
            except Exception as geo_err:
                print("Warning calculating geodetic distance in ingestion:", geo_err)

        log_entry = GPSLocationLog(
            employee_id=employee_id,
            shift_id=shift_id,
            latitude=lat,
            longitude=lon,
            accuracy=accuracy,
            speed=speed,
            battery_level=battery,
            recorded_at=rec_time
        )
        db.add(log_entry)
        saved_logs.append(log_entry)
        last_log = log_entry

    db.commit()

    # Process Site Visit Session Engine using recent points
    process_site_visit_engine(db, employee_id)

    # Return latest point summary for broadcasting
    latest_pt = points[-1] if points else {}
    return {
        "success": True,
        "processed": len(saved_logs),
        "employee_id": employee_id,
        "latest_location": {
            "latitude": latest_pt.get("latitude"),
            "longitude": latest_pt.get("longitude"),
            "recorded_at": latest_pt.get("recorded_at") or datetime.now().isoformat()
        }
    }


def process_site_visit_engine(db: Session, employee_id: int):
    """
    Site Visit Session Engine:
    Only updates active site visit sessions that were explicitly initiated by the officer via manual Check-In.
    Does NOT automatically create new site visit sessions from raw GPS/punch logs.
    """
    # Check open session for employee
    open_session = db.query(SiteVisitSession).filter(
        SiteVisitSession.employee_id == employee_id,
        SiteVisitSession.status == "IN_PROGRESS"
    ).order_by(SiteVisitSession.start_time.desc()).first()

    # Only process updates if the officer has manually initiated a Check-In session
    if not open_session:
        return

    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    gps_logs = db.query(GPSLocationLog).filter(
        GPSLocationLog.employee_id == employee_id,
        GPSLocationLog.recorded_at >= today_start
    ).order_by(GPSLocationLog.recorded_at.asc()).all()

    for log in gps_logs:
        if log.recorded_at and open_session.start_time and log.recorded_at >= open_session.start_time:
            duration = (log.recorded_at - open_session.start_time).total_seconds() / 60.0
            open_session.duration_minutes = round(duration, 2)
            open_session.raw_points_count += 1
            open_session.exit_latitude = log.latitude
            open_session.exit_longitude = log.longitude

    db.commit()


def get_live_manager_gps_service(db: Session) -> List[Dict[str, Any]]:
    """
    Returns live location status of active Field Officers.
    """
    conn = get_db_connection()
    employees_dict = {}
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT oid, name, emp_code FROM EMPLOYEE")
            rows = cursor.fetchall()
            for r in rows:
                employees_dict[r['oid']] = r
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"Error fetching employees: {e}")

    # Fetch latest GPS point for each employee today
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Subquery / grouping for latest points
    latest_logs = (
        db.query(GPSLocationLog)
        .filter(GPSLocationLog.recorded_at >= today_start)
        .order_by(GPSLocationLog.recorded_at.desc())
        .all()
    )

    seen_employees = set()
    result = []

    for log in latest_logs:
        if log.employee_id in seen_employees:
            continue
        seen_employees.add(log.employee_id)

        emp_info = employees_dict.get(log.employee_id, {})
        emp_name = emp_info.get("name") or f"Officer #{log.employee_id}"
        emp_code = emp_info.get("emp_code") or str(log.employee_id)

        mins_ago = (datetime.now() - log.recorded_at).total_seconds() / 60.0

        if mins_ago > 30:
            status = "OFFLINE"
        elif log.speed and log.speed > 1.5:
            status = "MOVING"
        elif mins_ago < 10:
            status = "STAY"
        else:
            status = "IDLE"

        result.append({
            "employee_id": log.employee_id,
            "employee_name": emp_name,
            "employee_code": emp_code,
            "latitude": log.latitude,
            "longitude": log.longitude,
            "accuracy": log.accuracy,
            "speed": log.speed,
            "battery_level": log.battery_level,
            "is_mock": False,
            "recorded_at": log.recorded_at.isoformat(),
            "status": status,
            "mins_ago": round(mins_ago, 1)
        })

    return result


def get_track_history_service(db: Session, employee_id: int, date_str: str) -> Dict[str, Any]:
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        target_date = datetime.now()

    start_dt = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(days=1)

    logs = db.query(GPSLocationLog).filter(
        GPSLocationLog.employee_id == employee_id,
        GPSLocationLog.recorded_at >= start_dt,
        GPSLocationLog.recorded_at < end_dt
    ).order_by(GPSLocationLog.recorded_at.asc()).all()

    visits = db.query(SiteVisitSession).filter(
        SiteVisitSession.employee_id == employee_id,
        SiteVisitSession.start_time >= start_dt,
        SiteVisitSession.start_time < end_dt
    ).order_by(SiteVisitSession.start_time.asc()).all()

    points = []
    total_distance = 0.0

    for i, log in enumerate(logs):
        if i > 0:
            prev = logs[i-1]
            dist = haversine_distance_meters(prev.latitude, prev.longitude, log.latitude, log.longitude)
            # Filter out GPS jumps (> 150km/h equivalent)
            time_diff = (log.recorded_at - prev.recorded_at).total_seconds()
            if time_diff > 0:
                speed_kmh = (dist / time_diff) * 3.6
                if speed_kmh < 150:
                    total_distance += dist
            else:
                total_distance += dist

        points.append({
            "id": log.id,
            "latitude": log.latitude,
            "longitude": log.longitude,
            "accuracy": log.accuracy,
            "speed": log.speed,
            "battery_level": log.battery_level,
            "recorded_at": log.recorded_at.isoformat()
        })

    visit_sessions = []
    for v in visits:
        visit_sessions.append({
            "id": v.id,
            "site_id": v.site_id,
            "site_name": v.site_name,
            "start_time": v.start_time.isoformat(),
            "end_time": v.end_time.isoformat() if v.end_time else None,
            "duration_minutes": v.duration_minutes,
            "status": v.status,
            "points_count": v.raw_points_count
        })

    return {
        "success": True,
        "employee_id": employee_id,
        "date": start_dt.strftime("%Y-%m-%d"),
        "total_distance_km": round(total_distance / 1000.0, 2),
        "total_points": len(points),
        "points": points,
        "site_visit_sessions": visit_sessions
    }


def get_planned_vs_actual_visits_service(db: Session, date_str: Optional[str] = None, employee_id: Optional[int] = None) -> List[Dict[str, Any]]:
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d") if date_str else datetime.now()
    except ValueError:
        target_date = datetime.now()

    start_dt = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(days=1)
    planned_month_str = target_date.strftime("%B")  # e.g., "August"
    planned_year = target_date.year

    planned_schedules = []

    # 1. Primary Source of Truth: Query existing FIELD_OFFICER_ASSIGNED_VISITS and FIELD_OFFICER_VISIT_FREQUENCY
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            target_date_str = target_date.strftime("%Y-%m-%d")
            where_clauses = [
                "UPPER(av.status) IN ('PUBLISHED', 'COMPLETED')",
                "(av.planning_year = %s OR (%s BETWEEN av.week_start_date AND av.week_end_date))"
            ]
            params = [planned_year, target_date_str]

            if employee_id:
                where_clauses.append("av.employee_oid = %s")
                params.append(employee_id)

            sql = f"""
                SELECT 
                    av.oid as plan_id,
                    av.employee_oid as employee_id,
                    vf.site_oid as site_id,
                    s.name as site_name,
                    vf.visit_frequency as required_frequency
                FROM FIELD_OFFICER_ASSIGNED_VISITS av
                JOIN FIELD_OFFICER_VISIT_FREQUENCY vf ON av.oid = vf.plan_oid
                LEFT JOIN SITE s ON vf.site_oid = s.oid
                WHERE {" AND ".join(where_clauses)}
            """
            cursor.execute(sql, tuple(params))
            rows = cursor.fetchall()
            for r in rows:
                planned_schedules.append({
                    "schedule_id": r["plan_id"],
                    "employee_id": r["employee_id"],
                    "site_id": r["site_id"],
                    "site_name": r["site_name"] or f"Site #{r['site_id']}",
                    "planned_date": target_date.strftime("%Y-%m-%d"),
                    "required_frequency": int(r["required_frequency"] or 1),
                    "min_duration_minutes": 15
                })
            cursor.close()
            conn.close()
        except Exception as err:
            print(f"Error querying FIELD_OFFICER_ASSIGNED_VISITS: {err}")

    # Fallback to PlannedVisitSchedule ORM table if no rows in primary tables
    if not planned_schedules:
        query_p = db.query(PlannedVisitSchedule).filter(
            PlannedVisitSchedule.planned_date >= start_dt,
            PlannedVisitSchedule.planned_date < end_dt
        )
        if employee_id:
            query_p = query_p.filter(PlannedVisitSchedule.employee_id == employee_id)
        for p in query_p.all():
            planned_schedules.append({
                "schedule_id": p.id,
                "employee_id": p.employee_id,
                "site_id": p.site_id,
                "site_name": p.site_name or f"Site #{p.site_id}",
                "planned_date": p.planned_date.strftime("%Y-%m-%d"),
                "required_frequency": p.required_frequency,
                "min_duration_minutes": p.min_duration_minutes
            })

    # Fetch actual completed SiteVisitSession records for today
    query_v = db.query(SiteVisitSession).filter(
        SiteVisitSession.start_time >= start_dt,
        SiteVisitSession.start_time < end_dt
    )
    if employee_id:
        query_v = query_v.filter(SiteVisitSession.employee_id == employee_id)

    actual_visits = query_v.all()

    actual_map = {}
    for v in actual_visits:
        key = (v.employee_id, v.site_id)
        if key not in actual_map:
            actual_map[key] = []
        actual_map[key].append(v)

    report = []
    for plan in planned_schedules:
        key = (plan["employee_id"], plan["site_id"])
        visits_for_site = actual_map.get(key, [])
        completed_count = len([v for v in visits_for_site if v.duration_minutes >= plan["min_duration_minutes"]])

        status = "COMPLETED" if completed_count >= plan["required_frequency"] else ("PARTIAL" if completed_count > 0 else "MISSED")

        report.append({
            "schedule_id": plan["schedule_id"],
            "employee_id": plan["employee_id"],
            "site_id": plan["site_id"],
            "site_name": plan["site_name"],
            "planned_date": plan["planned_date"],
            "required_frequency": plan["required_frequency"],
            "actual_visits_completed": completed_count,
            "total_visits_detected": len(visits_for_site),
            "status": status
        })

    return report


def get_active_site_visit_session_service(db: Session, employee_id: int) -> Optional[Dict[str, Any]]:
    sessions = (
        db.query(SiteVisitSession)
        .filter(
            SiteVisitSession.employee_id == employee_id,
            SiteVisitSession.status == "IN_PROGRESS"
        )
        .order_by(SiteVisitSession.start_time.desc())
        .all()
    )
    if not sessions:
        return None

    now = datetime.now()

    # Verify if officer is currently punched in for duty attendance today
    is_punched_in = False
    try:
        from app.services.attendance_service import get_today_status_logic
        att_res = get_today_status_logic(employee_id)
        att_rec = att_res.get("record") if att_res and att_res.get("success") else None
        is_punched_in = bool(att_rec and att_rec.get("check_in") and not att_rec.get("check_out"))
    except Exception as att_err:
        print("Warning checking duty attendance for site session:", att_err)
        is_punched_in = True  # Fallback to true if check fails to avoid blocking

    # If officer is NOT punched in today, auto-close all open site visit sessions
    if not is_punched_in:
        for s in sessions:
            s.status = "COMPLETED"
            s.end_time = now
            duration = (now - s.start_time).total_seconds() / 60.0
            s.duration_minutes = round(duration, 2)
        db.commit()
        return None

    active_session = None

    for i, s in enumerate(sessions):
        duration = (now - s.start_time).total_seconds() / 60.0
        # Auto-close sessions older than 4 hours (240 mins) or duplicate secondary open sessions
        if duration > 240 or i > 0:
            s.status = "COMPLETED"
            s.end_time = now
            s.duration_minutes = round(duration, 2)
        elif not active_session:
            active_session = s

    db.commit()

    if not active_session:
        return None

    duration = (now - active_session.start_time).total_seconds() / 60.0
    return {
        "id": active_session.id,
        "employee_id": active_session.employee_id,
        "site_id": active_session.site_id,
        "site_name": active_session.site_name,
        "start_time": active_session.start_time.isoformat(),
        "status": active_session.status,
        "duration_minutes": round(duration, 1),
        "entry_latitude": active_session.entry_latitude,
        "entry_longitude": active_session.entry_longitude
    }


def manual_site_check_in_service(
    db: Session,
    employee_id: int,
    site_id: int,
    site_name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> Dict[str, Any]:
    # 1. Enforce duty attendance punch-in requirement
    try:
        from app.services.attendance_service import get_today_status_logic
        att_res = get_today_status_logic(employee_id)
        att_rec = att_res.get("record") if att_res and att_res.get("success") else None
        is_punched_in = bool(att_rec and att_rec.get("check_in") and not att_rec.get("check_out"))
        if not is_punched_in:
            return {
                "success": False,
                "attendance_required": True,
                "message": "Punch-In Required: You must punch in for duty attendance before starting or checking in to a site visit."
            }
    except Exception as att_err:
        print("Warning checking duty attendance on check-in:", att_err)

    # 2. Check if officer has any active IN_PROGRESS session
    open_session = (
        db.query(SiteVisitSession)
        .filter(
            SiteVisitSession.employee_id == employee_id,
            SiteVisitSession.status == "IN_PROGRESS"
        )
        .first()
    )

    if open_session:
        if open_session.site_id == site_id:
            return {
                "success": True,
                "message": "Already checked in at this site",
                "session": {
                    "id": open_session.id,
                    "site_id": open_session.site_id,
                    "site_name": open_session.site_name,
                    "start_time": open_session.start_time.isoformat(),
                    "status": open_session.status
                }
            }
        else:
            return {
                "success": False,
                "has_active_session": True,
                "active_session": {
                    "id": open_session.id,
                    "site_id": open_session.site_id,
                    "site_name": open_session.site_name,
                    "start_time": open_session.start_time.isoformat()
                },
                "message": f"Active visit session detected at '{open_session.site_name}'. Please check out of previous visit first."
            }

    # Retrieve site name if not provided
    if not site_name and site_id:
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor(dictionary=True)
                cursor.execute("SELECT name FROM SITE WHERE oid = %s", (site_id,))
                row = cursor.fetchone()
                if row and row.get("name"):
                    site_name = row["name"]
                cursor.close()
                conn.close()
            except Exception:
                pass

    new_session = SiteVisitSession(
        employee_id=employee_id,
        site_id=site_id,
        site_name=site_name or f"Site #{site_id}",
        start_time=datetime.now(),
        status="IN_PROGRESS",
        raw_points_count=1,
        entry_latitude=latitude or 0.0,
        entry_longitude=longitude or 0.0
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return {
        "success": True,
        "message": f"Checked in successfully at {new_session.site_name}",
        "session": {
            "id": new_session.id,
            "site_id": new_session.site_id,
            "site_name": new_session.site_name,
            "start_time": new_session.start_time.isoformat(),
            "status": new_session.status
        }
    }


def manual_site_check_out_service(
    db: Session,
    employee_id: int,
    site_id: Optional[int] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> Dict[str, Any]:
    query = db.query(SiteVisitSession).filter(
        SiteVisitSession.employee_id == employee_id,
        SiteVisitSession.status == "IN_PROGRESS"
    )
    if site_id:
        query = query.filter(SiteVisitSession.site_id == site_id)

    open_session = query.order_by(SiteVisitSession.start_time.desc()).first()

    if not open_session:
        return {"success": False, "message": "No active site visit session found to check out"}

    now = datetime.now()
    duration = (now - open_session.start_time).total_seconds() / 60.0
    open_session.end_time = now
    open_session.duration_minutes = round(duration, 2)
    open_session.status = "COMPLETED"
    if latitude: open_session.exit_latitude = latitude
    if longitude: open_session.exit_longitude = longitude

    db.commit()

    # Also automatically sync the check-out timestamp into the submitted visit report in MySQL
    try:
        from app.database import get_db_connection
        raw_conn = get_db_connection()
        if raw_conn:
            c = raw_conn.cursor()
            today_str = now.strftime("%Y-%m-%d")
            checkout_formatted = now.strftime("%H:%M")
            c.execute("""
                UPDATE FIELD_OFFICER_DAY_VISIT_REPORTS
                SET `check-out_time` = %s
                WHERE site_id = %s 
                  AND (employee_oid = %s OR employee_oid = (SELECT emp_code FROM EMPLOYEE WHERE oid = %s LIMIT 1))
                  AND (`check-out_time` IS NULL OR `check-out_time` = '' OR `check-out_time` = 'Pending')
                  AND (visit_date = %s OR created_on LIKE %s)
            """, (checkout_formatted, open_session.site_id, employee_id, employee_id, today_str, f"{today_str}%"))
            
            c.execute("""
                UPDATE FIELD_OFFICER_NIGHT_VISIT_REPORTS
                SET `check-out_time` = %s
                WHERE site_id = %s 
                  AND (employee_oid = %s OR employee_oid = (SELECT emp_code FROM EMPLOYEE WHERE oid = %s LIMIT 1))
                  AND (`check-out_time` IS NULL OR `check-out_time` = '' OR `check-out_time` = 'Pending')
                  AND (visit_date = %s OR created_on LIKE %s)
            """, (checkout_formatted, open_session.site_id, employee_id, employee_id, today_str, f"{today_str}%"))
            
            c.execute("""
                UPDATE FIELD_OFFICER_GENERAL_VISIT_REPORTS
                SET `check-out_time` = %s, end_time = %s
                WHERE site_id = %s 
                  AND (employee_oid = %s OR employee_oid = (SELECT emp_code FROM EMPLOYEE WHERE oid = %s LIMIT 1))
                  AND (`check-out_time` IS NULL OR `check-out_time` = '' OR `check-out_time` = 'Pending')
                  AND (visit_date = %s OR created_on LIKE %s)
            """, (checkout_formatted, checkout_formatted, open_session.site_id, employee_id, employee_id, today_str, f"{today_str}%"))
            raw_conn.commit()
            c.close()
            raw_conn.close()
    except Exception as db_sync_err:
        print(f"Error updating report check-out time during checkout: {db_sync_err}")

    return {
        "success": True,
        "message": f"Checked out successfully from {open_session.site_name}",
        "session": {
            "id": open_session.id,
            "site_id": open_session.site_id,
            "site_name": open_session.site_name,
            "start_time": open_session.start_time.isoformat(),
            "end_time": open_session.end_time.isoformat(),
            "duration_minutes": open_session.duration_minutes,
            "status": open_session.status
        }
    }


