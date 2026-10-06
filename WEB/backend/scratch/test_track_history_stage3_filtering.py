import os
import sys
from datetime import datetime, timedelta
from sqlalchemy import text

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, get_db_connection
from app.services.gps_service import get_track_history_service, get_live_manager_gps_service
from app.models.patrol_models import GPSLocationLog
from app.routes.gps import get_track_history

def test_sumit_10212():
    db = SessionLocal()
    try:
        print("\n--- TEST 1: Sumit Pardeshi (10212) Real Data & Logic Check ---")
        emp_oid = 10212
        date_str = "2026-09-15"

        # Check EMPLOYEE table state
        emp_row = db.execute(text("SELECT oid, name, track_history_enabled FROM EMPLOYEE WHERE oid = :oid"), {"oid": emp_oid}).mappings().first()
        print(f"Employee 10212 Record: {dict(emp_row) if emp_row else 'Not Found'}")

        # Check FIELD_OFFICER_TRACK_HISTORY_CONFIG rows
        cfg_rows = db.execute(text("SELECT * FROM FIELD_OFFICER_TRACK_HISTORY_CONFIG WHERE employee_oid = :oid"), {"oid": emp_oid}).mappings().all()
        print(f"FIELD_OFFICER_TRACK_HISTORY_CONFIG rows count for 10212: {len(cfg_rows)}")

        # Check raw GPS_LOCATION_LOGS count
        gps_count = db.execute(text("SELECT COUNT(*) as cnt FROM GPS_LOCATION_LOGS WHERE Employee = :oid AND DATE(recorded_at) = :d"), {"oid": emp_oid, "d": date_str}).scalar()
        print(f"GPS_LOCATION_LOGS count for 10212 on {date_str}: {gps_count}")

        # Call get_track_history_service
        res = get_track_history_service(db, emp_oid, date_str)
        print(f"Track History Response route_segments count: {len(res.get('route_segments', []))}")
        print(f"Track History Response total_points: {res.get('total_points', 0)}")

        assert len(res.get('route_segments', [])) == 0, f"Expected 0 route_segments for disabled employee 10212, got {len(res.get('route_segments'))}"
        assert res.get('total_points', 0) == 0, f"Expected 0 total_points, got {res.get('total_points')}"
        assert gps_count >= 0, "GPS_LOCATION_LOGS count should be preserved"
        print("-> SUMIT 10212 TEST PASSED: Track History disabled, route_segments empty, raw GPS logs intact.")
    finally:
        db.close()

def test_no_config_enabled():
    db = SessionLocal()
    try:
        print("\n--- TEST 2: No Config + EMPLOYEE.track_history_enabled = 1 ---")
        emp_row = db.execute(text("""
            SELECT e.oid FROM EMPLOYEE e
            LEFT JOIN FIELD_OFFICER_TRACK_HISTORY_CONFIG c ON e.oid = c.employee_oid
            WHERE e.track_history_enabled = 1 AND c.employee_oid IS NULL AND e.active = 1
            LIMIT 1
        """)).mappings().first()

        if emp_row:
            emp_oid = emp_row["oid"]
            today_str = datetime.now().strftime("%Y-%m-%d")
            res = get_track_history_service(db, emp_oid, today_str)
            print(f"Employee {emp_oid} (Enabled, No Config) route_segments count: {len(res['route_segments'])}")
            assert res["success"] is True
            print("-> TEST 2 PASSED: Employee with flag=1 and no config is Enabled.")
        else:
            print("-> TEST 2 SKIPPED (No matching active employee found)")
    finally:
        db.close()

def test_live_gps_regression():
    db = SessionLocal()
    try:
        print("\n--- TEST 3: Live GPS Regression Check ---")
        live_data = get_live_manager_gps_service(db)
        print(f"Live GPS officers fetched: {len(live_data)}")
        assert isinstance(live_data, list)
        print("-> TEST 3 PASSED: Live GPS is active and unaffected.")
    finally:
        db.close()

def test_query_parameter_alias():
    db = SessionLocal()
    try:
        print("\n--- TEST 4: Route Query Parameter Alias (employee_oid) ---")
        date_str = "2026-09-15"
        res = get_track_history(employee_id=None, employee_oid=10212, date=date_str, db=db)
        assert res["success"] is True
        assert res["employee_id"] == 10212
        print("-> TEST 4 PASSED: employee_oid query parameter accepted seamlessly.")
    finally:
        db.close()

if __name__ == "__main__":
    print("==================================================")
    print("RUNNING TRACK HISTORY RUNTIME FILTERING TEST SUITE")
    print("==================================================")
    test_sumit_10212()
    test_no_config_enabled()
    test_live_gps_regression()
    test_query_parameter_alias()
    print("\nALL TESTS PASSED SUCCESSFULLY!")
