import os
import sys
import time
from datetime import datetime, timedelta

from app.database import get_db_cursor, SessionLocal
from app.services.attendance_service import mark_attendance_logic
from app.services.gps_service import ingest_gps_locations_service, get_live_manager_gps_service, get_track_history_service
from app.models.patrol_models import GPSLocationLog
from app.routes.admin_routes import toggle_employee_track_history, TrackHistoryToggleRequest
from fastapi import HTTPException

# Test Employee OID
TEST_EMP_OID = 10208

def clear_test_shift_gap(emp_oid):
    """Helper to clear today's test attendance logs so automated multi-shift test scenarios can run freely"""
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

def run_all_tests():
    print("=== STARTING STAGE 2 TRACK HISTORY SYSTEM TESTS A THROUGH G ===")

    with get_db_cursor(commit=True, dictionary=True) as (conn, cursor):
        # Ensure test employee exists
        cursor.execute("SELECT oid, name, BRANCH, SITE, track_history_enabled FROM EMPLOYEE WHERE oid = %s", (TEST_EMP_OID,))
        emp = cursor.fetchone()
        if not emp:
            print(f"Error: Test employee {TEST_EMP_OID} not found!")
            return False
        print(f"Test Officer: {emp['name']} (OID: {emp['oid']}, Branch: {emp['BRANCH']}, Site: {emp['SITE']})")

    # -------------------------------------------------------------
    # TEST F: Existing Historical Records Verification
    # -------------------------------------------------------------
    print("\n[TEST F] Verifying Existing Historical Records & Defaults...")
    with get_db_cursor(dictionary=True) as (conn, cursor):
        cursor.execute("SELECT COUNT(*) as total_logs, SUM(CASE WHEN track_history_enabled_at_punch_in = 1 THEN 1 ELSE 0 END) as default_1_count FROM ATTENDANCE_TIME_LOG")
        res = cursor.fetchone()
        print(f"Historical Attendance Logs: Total = {res['total_logs']}, Default 1 = {res['default_1_count']}")
        assert res['total_logs'] == res['default_1_count'], "Historical ATTENDANCE_TIME_LOG rows did not default to 1!"
    print("[OK] TEST F PASSED")

    # Helper dummy class for PunchData
    class PunchDataInput:
        def __init__(self, oid, lat=18.605, long=73.827, site_oid=None):
            self.empOid = oid
            self.latitude = lat
            self.longitude = long
            self.siteOid = site_oid

    db = SessionLocal()

    try:
        # Clear shift gap constraint
        clear_test_shift_gap(TEST_EMP_OID)

        # -------------------------------------------------------------
        # TEST A: Enabled Before Punch In
        # -------------------------------------------------------------
        print("\n[TEST A] Track History ENABLED (1) Before Punch In...")
        with get_db_cursor(commit=True) as (conn, cursor):
            cursor.execute("UPDATE EMPLOYEE SET track_history_enabled = 1 WHERE oid = %s", (TEST_EMP_OID,))

        # Punch In
        punch_res = mark_attendance_logic(PunchDataInput(TEST_EMP_OID))
        print("Punch-In Response:", punch_res)
        assert punch_res.get("success"), f"Punch-In failed: {punch_res.get('message')}"

        # Verify frozen flag in ATTENDANCE_TIME_LOG
        with get_db_cursor(dictionary=True) as (conn, cursor):
            cursor.execute("""
                SELECT atl.oid, atl.in_time, atl.out_time, atl.track_history_enabled_at_punch_in
                FROM ATTENDANCE_TIME_LOG atl
                JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
                WHERE ac.EMPLOYEE = %s AND atl.out_time IS NULL
                ORDER BY atl.oid DESC LIMIT 1
            """, (TEST_EMP_OID,))
            active_log = cursor.fetchone()
            print("Active Log Frozen Flag:", active_log)
            assert active_log and active_log['track_history_enabled_at_punch_in'] == 1, "Frozen flag is not 1!"

        # Ingest GPS ping
        ingest_res = ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.605,
            "longitude": 73.827,
            "recorded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }])
        print("GPS Ingest Result:", ingest_res)

        # Check Track History
        today_str = datetime.now().strftime("%Y-%m-%d")
        history_res = get_track_history_service(db, TEST_EMP_OID, today_str)
        print(f"Track History Points Count (Expected > 0): {len(history_res['points'])}")
        assert len(history_res['points']) > 0, "Track history should contain points when enabled!"
        print("[OK] TEST A PASSED")

        # Punch Out Period A
        mark_attendance_logic(PunchDataInput(TEST_EMP_OID))

        # -------------------------------------------------------------
        # TEST B & E: Disabled Before Punch In & Live GPS Isolation
        # -------------------------------------------------------------
        print("\n[TEST B & E] Track History DISABLED (0) Before Punch In & Live GPS Isolation...")
        clear_test_shift_gap(TEST_EMP_OID)

        with get_db_cursor(commit=True) as (conn, cursor):
            cursor.execute("UPDATE EMPLOYEE SET track_history_enabled = 0 WHERE oid = %s", (TEST_EMP_OID,))

        # Punch In Period B
        punch_res_b = mark_attendance_logic(PunchDataInput(TEST_EMP_OID))
        print("Punch-In Response B:", punch_res_b)
        assert punch_res_b.get("success"), f"Punch-In B failed: {punch_res_b.get('message')}"

        # Verify frozen flag = 0
        with get_db_cursor(dictionary=True) as (conn, cursor):
            cursor.execute("""
                SELECT atl.oid, atl.in_time, atl.out_time, atl.track_history_enabled_at_punch_in
                FROM ATTENDANCE_TIME_LOG atl
                JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
                WHERE ac.EMPLOYEE = %s AND atl.out_time IS NULL
                ORDER BY atl.oid DESC LIMIT 1
            """, (TEST_EMP_OID,))
            active_log_b = cursor.fetchone()
            print("Period B Active Log Frozen Flag:", active_log_b)
            assert active_log_b and active_log_b['track_history_enabled_at_punch_in'] == 0, "Frozen flag is not 0!"

        # Ingest GPS location ping while track history is disabled
        gps_ping_time = datetime.now()
        ingest_res_b = ingest_gps_locations_service(db, TEST_EMP_OID, [{
            "latitude": 18.610,
            "longitude": 73.830,
            "recorded_at": gps_ping_time.strftime("%Y-%m-%d %H:%M:%S")
        }])
        print("[TEST E] Live GPS Ingest when Track History Disabled:", ingest_res_b)
        assert ingest_res_b.get("success"), "GPS Ingest failed!"

        # Verify Live GPS still works and displays officer
        live_gps = get_live_manager_gps_service(db)
        officer_live = [o for o in live_gps if o['employee_id'] == TEST_EMP_OID]
        print("[TEST E] Live Manager GPS Display Officer:", officer_live)
        assert len(officer_live) > 0, "Live GPS should still display officer!"
        print("[OK] TEST E (Live GPS Isolation) PASSED")

        # Verify Track History for Period B suppresses points
        history_res_b = get_track_history_service(db, TEST_EMP_OID, today_str)
        print(f"Track History Points Count for Period B (Expected 0): {len(history_res_b['points'])}")
        assert len(history_res_b['points']) == 0, "Track history points should be suppressed when frozen flag = 0!"
        print("[OK] TEST B PASSED")

        # -------------------------------------------------------------
        # TEST C: Enable During Active Duty
        # -------------------------------------------------------------
        print("\n[TEST C] Enabling EMPLOYEE flag to 1 during active duty (Period B)...")
        with get_db_cursor(commit=True) as (conn, cursor):
            cursor.execute("UPDATE EMPLOYEE SET track_history_enabled = 1 WHERE oid = %s", (TEST_EMP_OID,))

        # Verify frozen flag for currently active attendance log REMAINS 0!
        with get_db_cursor(dictionary=True) as (conn, cursor):
            cursor.execute("""
                SELECT atl.oid, atl.track_history_enabled_at_punch_in
                FROM ATTENDANCE_TIME_LOG atl
                JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
                WHERE ac.EMPLOYEE = %s AND atl.out_time IS NULL
                ORDER BY atl.oid DESC LIMIT 1
            """, (TEST_EMP_OID,))
            active_log_c = cursor.fetchone()
            print("Period B Frozen Flag after EMPLOYEE flag set to 1 (Expected 0):", active_log_c)
            assert active_log_c['track_history_enabled_at_punch_in'] == 0, "Frozen flag changed mid-shift!"

        # Verify Track History still returns 0 points for Period B
        history_res_c = get_track_history_service(db, TEST_EMP_OID, today_str)
        assert len(history_res_c['points']) == 0, "Track history changed mid-shift!"

        # Punch Out Period B
        mark_attendance_logic(PunchDataInput(TEST_EMP_OID))

        # Next Punch In (Period C)
        clear_test_shift_gap(TEST_EMP_OID)
        punch_res_c2 = mark_attendance_logic(PunchDataInput(TEST_EMP_OID))
        assert punch_res_c2.get("success"), f"Punch-In Period C failed: {punch_res_c2.get('message')}"

        # Verify Period C gets new frozen flag = 1
        with get_db_cursor(dictionary=True) as (conn, cursor):
            cursor.execute("""
                SELECT atl.oid, atl.track_history_enabled_at_punch_in
                FROM ATTENDANCE_TIME_LOG atl
                JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
                WHERE ac.EMPLOYEE = %s AND atl.out_time IS NULL
                ORDER BY atl.oid DESC LIMIT 1
            """, (TEST_EMP_OID,))
            active_log_c2 = cursor.fetchone()
            print("Period C Frozen Flag (Expected 1):", active_log_c2)
            assert active_log_c2['track_history_enabled_at_punch_in'] == 1, "New shift did not pick up updated flag 1!"
        print("[OK] TEST C PASSED")

        # -------------------------------------------------------------
        # TEST D: Disable During Active Duty
        # -------------------------------------------------------------
        print("\n[TEST D] Disabling EMPLOYEE flag to 0 during active duty (Period C)...")
        with get_db_cursor(commit=True) as (conn, cursor):
            cursor.execute("UPDATE EMPLOYEE SET track_history_enabled = 0 WHERE oid = %s", (TEST_EMP_OID,))

        # Verify frozen flag for active Period C REMAINS 1!
        with get_db_cursor(dictionary=True) as (conn, cursor):
            cursor.execute("""
                SELECT atl.oid, atl.track_history_enabled_at_punch_in
                FROM ATTENDANCE_TIME_LOG atl
                JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
                WHERE ac.EMPLOYEE = %s AND atl.out_time IS NULL
                ORDER BY atl.oid DESC LIMIT 1
            """, (TEST_EMP_OID,))
            active_log_d = cursor.fetchone()
            print("Period C Frozen Flag after EMPLOYEE flag set to 0 (Expected 1):", active_log_d)
            assert active_log_d['track_history_enabled_at_punch_in'] == 1, "Frozen flag changed mid-shift!"

        # Punch Out Period C
        mark_attendance_logic(PunchDataInput(TEST_EMP_OID))

        # Next Punch In (Period D)
        clear_test_shift_gap(TEST_EMP_OID)
        punch_res_d2 = mark_attendance_logic(PunchDataInput(TEST_EMP_OID))
        assert punch_res_d2.get("success"), f"Punch-In Period D failed: {punch_res_d2.get('message')}"

        # Verify Period D gets new frozen flag = 0
        with get_db_cursor(dictionary=True) as (conn, cursor):
            cursor.execute("""
                SELECT atl.oid, atl.track_history_enabled_at_punch_in
                FROM ATTENDANCE_TIME_LOG atl
                JOIN ATTENDANCE_CELL ac ON atl.ATTENDANCE_CELL = ac.oid
                WHERE ac.EMPLOYEE = %s AND atl.out_time IS NULL
                ORDER BY atl.oid DESC LIMIT 1
            """, (TEST_EMP_OID,))
            active_log_d2 = cursor.fetchone()
            print("Period D Frozen Flag (Expected 0):", active_log_d2)
            assert active_log_d2['track_history_enabled_at_punch_in'] == 0, "New shift did not pick up updated flag 0!"

        # Clean up Period D
        mark_attendance_logic(PunchDataInput(TEST_EMP_OID))
        print("[OK] TEST D PASSED")

        # -------------------------------------------------------------
        # TEST G: RBAC Verification
        # -------------------------------------------------------------
        print("\n[TEST G] RBAC Scoping Verification...")
        # Admin user
        admin_user = {"id": 1, "role": "Admin", "branch_id": None, "site_id": None}
        req = TrackHistoryToggleRequest(track_history_enabled=1)
        res_admin = toggle_employee_track_history(TEST_EMP_OID, req, current_user=admin_user, db=db)
        print("Admin Toggle Result:", res_admin)
        assert res_admin["success"] and res_admin["track_history_enabled"] == 1, "Admin toggle failed!"

        # Authorized Area Manager (same branch)
        with get_db_cursor(dictionary=True) as (conn, cursor):
            cursor.execute("SELECT BRANCH, SITE FROM EMPLOYEE WHERE oid = %s", (TEST_EMP_OID,))
            emp_info = cursor.fetchone()
            emp_branch = emp_info["BRANCH"]

        auth_am_user = {"id": 2, "role": "Area Manager", "branch_id": emp_branch, "site_id": None}
        req_off = TrackHistoryToggleRequest(track_history_enabled=0)
        res_am = toggle_employee_track_history(TEST_EMP_OID, req_off, current_user=auth_am_user, db=db)
        print("Authorized AM Toggle Result:", res_am)
        assert res_am["success"] and res_am["track_history_enabled"] == 0, "Authorized AM toggle failed!"

        # Unauthorized Area Manager (different branch)
        unauth_am_user = {"id": 3, "role": "Area Manager", "branch_id": (emp_branch or 1) + 999, "site_id": 9999}
        try:
            toggle_employee_track_history(TEST_EMP_OID, req, current_user=unauth_am_user, db=db)
            assert False, "Unauthorized Area Manager toggle should have thrown 403 Forbidden!"
        except HTTPException as http_err:
            print("Unauthorized AM Toggle Exception (Expected 403):", http_err.status_code, http_err.detail)
            assert http_err.status_code == 403, "Expected status code 403 Forbidden!"
        print("[OK] TEST G PASSED")

        # Reset flag to 1 for officer
        with get_db_cursor(commit=True) as (conn, cursor):
            cursor.execute("UPDATE EMPLOYEE SET track_history_enabled = 1 WHERE oid = %s", (TEST_EMP_OID,))

        print("\n=== ALL TESTS A THROUGH G COMPLETED SUCCESSFULLY ===")
        return True

    finally:
        db.close()

if __name__ == "__main__":
    success = run_all_tests()
    if not success:
        sys.exit(1)
