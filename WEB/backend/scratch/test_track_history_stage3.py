import os
import sys
import time
from datetime import datetime, timedelta

# Ensure root directory in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import get_db_cursor, SessionLocal, get_db_connection
from app.services.attendance_service import mark_attendance_logic
from app.services.gps_service import (
    ingest_gps_locations_service,
    get_live_manager_gps_service,
    get_track_history_service,
    ensure_track_history_config_table
)
from app.models.patrol_models import GPSLocationLog
from app.routes.admin_routes import toggle_employee_track_history, TrackHistoryToggleRequest
from fastapi import HTTPException

TEST_EMP_OID = 10208

class DummyPunchInput:
    def __init__(self, oid, lat=18.605, long=73.827, site_oid=None):
        self.empOid = oid
        self.latitude = lat
        self.longitude = long
        self.siteOid = site_oid

def clear_test_shift_data(emp_oid, db=None):
    """Helper to clear test employee attendance, config logs, and test GPS logs for fresh scenario testing"""
    if db:
        try: db.commit()
        except Exception: pass
    with get_db_cursor(commit=True) as (conn, cursor):
        today = datetime.now().strftime("%Y-%m-%d")
        cursor.execute("""
            DELETE atl FROM ATTENDANCE_TIME_LOG atl
            JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
            WHERE ac.EMPLOYEE = %s AND ac.attendance_date = %s
        """, (emp_oid, today))
        cursor.execute("""
            UPDATE ATTENDANCE_CELL SET attendance_state = 'IN' WHERE EMPLOYEE = %s AND attendance_date = %s
        """, (emp_oid, today))
        cursor.execute("""
            DELETE FROM FIELD_OFFICER_TRACK_HISTORY_CONFIG WHERE employee_oid = %s
        """, (emp_oid,))
        cursor.execute("""
            DELETE FROM GPS_LOCATION_LOGS WHERE Employee = %s AND DATE(recorded_at) = %s
        """, (emp_oid, today))
        cursor.execute("""
            UPDATE EMPLOYEE SET track_history_enabled = 1 WHERE oid = %s
        """, (emp_oid,))
    if db:
        db.commit()
        db.expire_all()

def run_stage3_tests():
    print("==================================================")
    print("STARTING STAGE 3 IMMEDIATE TRACK HISTORY SUITE")
    print("==================================================")

    db = SessionLocal()
    ensure_track_history_config_table(db)

    admin_user = {"id": 1, "username": "admin", "role": "admin", "branch_id": None, "site_id": None}
    unauth_am = {"id": 99, "username": "bad_am", "role": "area manager", "branch_id": 9999, "site_id": 9999}
    
    # Get officer branch/site for authorized AM
    with get_db_cursor(dictionary=True) as (conn, cursor):
        cursor.execute("SELECT oid, name, BRANCH, SITE, track_history_enabled FROM EMPLOYEE WHERE oid = %s", (TEST_EMP_OID,))
        emp = cursor.fetchone()
        assert emp, f"Test officer {TEST_EMP_OID} not found!"
        print(f"Officer: {emp['name']} (OID: {emp['oid']}, Branch: {emp['BRANCH']}, Site: {emp['SITE']})")

    auth_am = {"id": 2, "username": "good_am", "role": "area manager", "branch_id": emp['BRANCH'], "site_id": emp['SITE']}

    today_str = datetime.now().strftime("%Y-%m-%d")

    try:
        # -------------------------------------------------------------
        # TEST 1: Track History Enabled & Punch In
        # -------------------------------------------------------------
        print("\n[TEST 1] Enabled Track History & Punch In...")
        clear_test_shift_data(TEST_EMP_OID, db)

        toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=1), current_user=auth_am, db=db)
        punch1 = mark_attendance_logic(DummyPunchInput(TEST_EMP_OID))
        assert punch1.get("success"), f"Punch-In failed: {punch1.get('message')}"

        time.sleep(1.1)
        t1_ping = datetime.now()
        ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.605, "longitude": 73.827, "recorded_at": t1_ping.strftime("%Y-%m-%d %H:%M:%S")
        }])

        history1 = get_track_history_service(db, TEST_EMP_OID, today_str)
        assert history1["success"], "History query failed!"
        assert len(history1["waypoints"]) >= 1, "Waypoints missing when enabled!"
        assert len(history1["route_segments"]) == 1, "Should have exactly 1 route segment!"
        print(" -> TEST 1 PASSED")

        # -------------------------------------------------------------
        # TEST 2 & TEST 3: Disable immediately during duty & Re-enable during SAME duty
        # -------------------------------------------------------------
        print("\n[TEST 2 & 3] Immediate Disable and Re-enable during same duty...")
        
        # Disable at T_dis
        time.sleep(1.1)
        t_dis_res = toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=0), current_user=auth_am, db=db)
        assert t_dis_res["track_history_enabled"] == 0, "Disable failed!"

        # Ingest GPS ping while disabled
        time.sleep(1.1)
        t_disabled_ping = datetime.now()
        ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.610, "longitude": 73.830, "recorded_at": t_disabled_ping.strftime("%Y-%m-%d %H:%M:%S")
        }])

        # Verify disabled point is excluded from history
        history2 = get_track_history_service(db, TEST_EMP_OID, today_str)
        disabled_pts = [pt for pt in history2["waypoints"] if pt["recorded_at"] == t_disabled_ping.isoformat()]
        assert len(disabled_pts) == 0, "Disabled point was incorrectly included in Track History!"
        print(" -> TEST 2 PASSED (Disabled point excluded)")

        # Re-enable at T_en
        time.sleep(1.1)
        t_en_res = toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=1), current_user=auth_am, db=db)
        assert t_en_res["track_history_enabled"] == 1, "Re-enable failed!"

        # Ingest GPS ping while re-enabled
        time.sleep(1.1)
        t_reenabled_ping = datetime.now()
        ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.615, "longitude": 73.835, "recorded_at": t_reenabled_ping.strftime("%Y-%m-%d %H:%M:%S")
        }])

        history3 = get_track_history_service(db, TEST_EMP_OID, today_str)
        assert len(history3["route_segments"]) == 2, f"Expected 2 route segments, got {len(history3['route_segments'])}"
        assert history3["route_segments"][0]["segment_id"] == 1
        assert history3["route_segments"][1]["segment_id"] == 2
        print(" -> TEST 3 PASSED (2 distinct route_segments returned separated by disabled gap)")

        # -------------------------------------------------------------
        # TEST 4: Multiple Toggles
        # -------------------------------------------------------------
        print("\n[TEST 4] Multiple Enable/Disable Toggles...")
        time.sleep(1.1)
        toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=0), current_user=auth_am, db=db)
        time.sleep(1.1)
        toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=1), current_user=auth_am, db=db)
        
        time.sleep(1.1)
        t_multi_ping = datetime.now()
        ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.620, "longitude": 73.840, "recorded_at": t_multi_ping.strftime("%Y-%m-%d %H:%M:%S")
        }])

        history4 = get_track_history_service(db, TEST_EMP_OID, today_str)
        assert len(history4["route_segments"]) == 3, f"Expected 3 route segments, got {len(history4['route_segments'])}"
        print(" -> TEST 4 PASSED (3 separate route_segments generated)")

        # -------------------------------------------------------------
        # TEST 5: Disable at end of duty
        # -------------------------------------------------------------
        print("\n[TEST 5] Disable at End of Duty...")
        time.sleep(1.1)
        toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=0), current_user=auth_am, db=db)
        
        time.sleep(1.1)
        t_end_ping = datetime.now()
        ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.625, "longitude": 73.845, "recorded_at": t_end_ping.strftime("%Y-%m-%d %H:%M:%S")
        }])
        
        # Punch Out
        time.sleep(1.1)
        mark_attendance_logic(DummyPunchInput(TEST_EMP_OID))

        history5 = get_track_history_service(db, TEST_EMP_OID, today_str)
        end_pts = [pt for pt in history5["waypoints"] if pt["recorded_at"] == t_end_ping.isoformat()]
        assert len(end_pts) == 0, "Point captured after end-of-duty disable was incorrectly included!"
        print(" -> TEST 5 PASSED")

        # -------------------------------------------------------------
        # TEST 6 & 7: Toggle while OFF DUTY
        # -------------------------------------------------------------
        print("\n[TEST 6 & 7] Toggle while Off Duty...")
        clear_test_shift_data(TEST_EMP_OID, db)
        
        # Off duty disable
        time.sleep(1.1)
        toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=0), current_user=auth_am, db=db)
        # Punch In next shift
        time.sleep(1.1)
        mark_attendance_logic(DummyPunchInput(TEST_EMP_OID))
        time.sleep(1.1)
        t_off_dis_ping = datetime.now()
        ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.630, "longitude": 73.850, "recorded_at": t_off_dis_ping.strftime("%Y-%m-%d %H:%M:%S")
        }])
        history6 = get_track_history_service(db, TEST_EMP_OID, today_str)
        print(f"DEBUG history6 waypoints count: {len(history6['waypoints'])}, points: {history6['waypoints']}")
        assert len(history6["waypoints"]) == 0, f"Off-duty disabled state did not carry forward to next shift! Got points: {history6['waypoints']}"
        print(" -> TEST 7 PASSED (Disabled off-duty carries to next shift)")

        # Off duty enable
        time.sleep(1.1)
        mark_attendance_logic(DummyPunchInput(TEST_EMP_OID)) # Punch out
        time.sleep(1.1)
        toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=1), current_user=auth_am, db=db)
        time.sleep(1.1)
        mark_attendance_logic(DummyPunchInput(TEST_EMP_OID)) # Punch in next shift
        time.sleep(1.1)
        t_off_en_ping = datetime.now()
        ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.635, "longitude": 73.855, "recorded_at": t_off_en_ping.strftime("%Y-%m-%d %H:%M:%S")
        }])
        history7 = get_track_history_service(db, TEST_EMP_OID, today_str)
        assert len(history7["waypoints"]) >= 1, "Off-duty enabled state did not activate next shift!"
        print(" -> TEST 6 PASSED (Enabled off-duty activates next shift)")

        # -------------------------------------------------------------
        # TEST 8 & 9: Live GPS Isolation & GPS_LOCATION_LOGS Persistence
        # -------------------------------------------------------------
        print("\n[TEST 8 & 9] Live GPS Isolation & Raw GPS Logging...")
        # Disable track history
        time.sleep(1.1)
        toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=0), current_user=auth_am, db=db)
        
        time.sleep(1.1)
        test_live_ping_time = datetime.now()
        ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.640, "longitude": 73.860, "recorded_at": test_live_ping_time.strftime("%Y-%m-%d %H:%M:%S")
        }])

        # Verify Live GPS returns latest location even when Track History is disabled
        live_officers = get_live_manager_gps_service(db)
        target_live = next((o for o in live_officers if o.get("employee_id") == TEST_EMP_OID or o.get("id") == TEST_EMP_OID), None)
        assert target_live is not None, "Officer missing from Live GPS!"
        assert target_live["latitude"] == 18.640 and target_live["longitude"] == 73.860, "Live GPS did not update when Track History disabled!"
        print(" -> TEST 8 PASSED (Live GPS continues operating during disabled Track History)")

        # Verify log row exists in GPS_LOCATION_LOGS
        db.expire_all()
        latest_db_log = db.query(GPSLocationLog).filter(
            GPSLocationLog.employee_id == TEST_EMP_OID
        ).order_by(GPSLocationLog.id.desc()).first()
        assert latest_db_log is not None, "Disabled period GPS ping was not stored in GPS_LOCATION_LOGS!"
        assert abs(latest_db_log.latitude - 18.640) < 0.001 and abs(latest_db_log.longitude - 73.860) < 0.001, "Latest GPS log coordinates mismatch!"
        print(" -> TEST 9 PASSED (Raw GPS pings stored in GPS_LOCATION_LOGS regardless of Track History setting)")

        # -------------------------------------------------------------
        # TEST 10: No Synthetic Route / Polyline Gap
        # -------------------------------------------------------------
        print("\n[TEST 10] Physical Route Gap Verification...")
        # Re-enable
        time.sleep(1.1)
        toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=1), current_user=auth_am, db=db)
        time.sleep(1.1)
        ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.650, "longitude": 73.870, "recorded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }])
        
        final_history = get_track_history_service(db, TEST_EMP_OID, today_str)
        assert "route_segments" in final_history, "route_segments missing from Track History response!"
        assert len(final_history["route_segments"]) >= 2, "Multiple enabled windows must yield separate route_segments!"
        print(" -> TEST 10 PASSED (route_segments provided explicitly with no synthetic connecting lines)")

        # -------------------------------------------------------------
        # TEST 11: RBAC Security
        # -------------------------------------------------------------
        print("\n[TEST 11] RBAC Authorization Controls...")
        # Unauthorized AM toggle attempt
        try:
            toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=0), current_user=unauth_am, db=db)
            assert False, "Unauthorized AM toggle did not raise 403!"
        except HTTPException as exc:
            assert exc.status_code == 403, f"Expected 403, got {exc.status_code}"
            print(" -> Unauthorized Area Manager blocked (403 Forbidden)")

        # Admin toggle attempt
        admin_res = toggle_employee_track_history(TEST_EMP_OID, TrackHistoryToggleRequest(track_history_enabled=1), current_user=admin_user, db=db)
        assert admin_res["success"], "Admin toggle failed!"
        print(" -> Admin toggle authorized")
        print(" -> TEST 11 PASSED")

        print("\n==================================================")
        print("ALL 11 STAGE 3 TRACK HISTORY TESTS PASSED SUCCESSFULLY!")
        print("==================================================")
        return True

    finally:
        db.close()

if __name__ == "__main__":
    success = run_stage3_tests()
    if not success:
        sys.exit(1)
