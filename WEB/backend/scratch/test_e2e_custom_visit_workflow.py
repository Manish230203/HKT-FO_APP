import os
import sys
import json
import base64
import time
from datetime import datetime, date
import mysql.connector

# Ensure WEB/backend is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Override DB environment variables BEFORE importing app modules
os.environ["DB_HOST"] = "localhost"
os.environ["DB_USER"] = "root"
os.environ["DB_PASSWORD"] = "root"
os.environ["DB_NAME"] = "fo_dev_test"

# Verify we can connect to local fo_dev_test
def setup_test_database():
    conn = mysql.connector.connect(host="localhost", user="root", password="root")
    c = conn.cursor()
    c.execute("CREATE DATABASE IF NOT EXISTS fo_dev_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    c.execute("USE fo_dev_test")
    c.execute("SET FOREIGN_KEY_CHECKS = 0")
    for tbl in [
        "FIELD_OFFICER_DAY_VISIT_REPORTS",
        "FIELD_OFFICER_NIGHT_VISIT_REPORTS",
        "FIELD_OFFICER_GENERAL_VISIT_REPORTS",
        "SITE_VISIT_SESSIONS",
        "FIELD_OFFICER_NEW_CLIENT_VISITS",
        "FIELD_OFFICER_VISIT_FREQUENCY",
        "FIELD_OFFICER_ASSIGNED_VISITS",
        "SITE_GATE_QRCODE",
        "SITE",
        "CLIENTT",
        "EMPLOYEE",
        "BRANCH",
        "ATTENDANCE_TIME_LOG",
        "ATTENDANCE_CELL",
        "FIELD_OFFICER_ATTENDANCE_LOCATION",
        "VISIT_REPORT_METADATA",
    ]:
        c.execute(f"DROP TABLE IF EXISTS `{tbl}`")
    c.execute("SET FOREIGN_KEY_CHECKS = 1")

    # Prerequisite tables
    c.execute("""
    CREATE TABLE IF NOT EXISTS `BRANCH` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `name` varchar(100) NOT NULL,
      `COMPANY` bigint DEFAULT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `EMPLOYEE` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `emp_code` varchar(50) NOT NULL,
      `name` varchar(100) NOT NULL,
      `BRANCH` bigint DEFAULT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `CLIENTT` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `name` varchar(255) NOT NULL,
      `company_vender_code` varchar(100) DEFAULT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `SITE` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `name` varchar(255) NOT NULL,
      `CLIENTT` bigint DEFAULT NULL,
      `BRANCH` bigint DEFAULT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `SITE_GATE_QRCODE` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `SITE` bigint NOT NULL,
      `latitude` decimal(10,8) DEFAULT NULL,
      `longitude` decimal(11,8) DEFAULT NULL,
      `radius` float DEFAULT '100',
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `FIELD_OFFICER_ASSIGNED_VISITS` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `plan_code` varchar(50) NOT NULL,
      `planning_type` varchar(20) NOT NULL,
      `week_start_date` date DEFAULT NULL,
      `week_end_date` date DEFAULT NULL,
      `planning_month` int DEFAULT NULL,
      `planning_year` int DEFAULT NULL,
      `visit_date` date DEFAULT NULL,
      `employee_oid` bigint NOT NULL,
      `planning_method` varchar(20) DEFAULT 'MANUAL',
      `status` varchar(20) NOT NULL DEFAULT 'PUBLISHED',
      `created_by` bigint DEFAULT NULL,
      `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `FIELD_OFFICER_VISIT_FREQUENCY` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `plan_oid` bigint NOT NULL,
      `site_oid` bigint NOT NULL,
      `visit_frequency` int NOT NULL DEFAULT '1',
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `FIELD_OFFICER_NEW_CLIENT_VISITS` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `plan_oid` bigint NOT NULL,
      `branch_oid` bigint NOT NULL,
      `client_name` varchar(100) NOT NULL,
      `site_name` varchar(100) NOT NULL,
      `address` varchar(255) DEFAULT NULL,
      `latitude` decimal(10,8) DEFAULT NULL,
      `longitude` decimal(11,8) DEFAULT NULL,
      `visit_frequency` int NOT NULL DEFAULT '1',
      `created_by` bigint DEFAULT NULL,
      PRIMARY KEY (`oid`),
      KEY `idx_fncv_plan_oid` (`plan_oid`),
      CONSTRAINT `fk_fncv_branch` FOREIGN KEY (`branch_oid`) REFERENCES `BRANCH` (`oid`),
      CONSTRAINT `fk_fncv_plan` FOREIGN KEY (`plan_oid`) REFERENCES `FIELD_OFFICER_ASSIGNED_VISITS` (`oid`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `SITE_VISIT_SESSIONS` (
      `oid` int NOT NULL AUTO_INCREMENT,
      `Employee` int NOT NULL,
      `site_id` int DEFAULT NULL,
      `custom_visit_id` bigint DEFAULT NULL,
      `site_name` varchar(255) DEFAULT NULL,
      `check_in_time` datetime DEFAULT NULL,
      `check_out_time` datetime DEFAULT NULL,
      `duration_minutes` float DEFAULT NULL,
      `status` varchar(50) NOT NULL,
      `raw_points_count` int NOT NULL DEFAULT '0',
      `entry_latitude` float NOT NULL,
      `entry_longitude` float NOT NULL,
      `exit_latitude` float DEFAULT NULL,
      `exit_longitude` float DEFAULT NULL,
      `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`oid`),
      KEY `ix_SITE_VISIT_SESSIONS_site_id` (`site_id`),
      KEY `idx_svs_custom_visit_id` (`custom_visit_id`),
      CONSTRAINT `fk_svs_custom_visit` FOREIGN KEY (`custom_visit_id`) REFERENCES `FIELD_OFFICER_NEW_CLIENT_VISITS` (`oid`) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `FIELD_OFFICER_DAY_VISIT_REPORTS` (
      `oid` varchar(100) NOT NULL,
      `employee_oid` bigint DEFAULT NULL,
      `report_id` varchar(255) DEFAULT NULL,
      `unit` varchar(255) DEFAULT NULL,
      `client_id` int DEFAULT NULL,
      `site_id` int DEFAULT NULL,
      `custom_visit_id` bigint DEFAULT NULL,
      `visit_date` varchar(50) DEFAULT NULL,
      `visit_type` varchar(50) DEFAULT NULL,
      `officer` varchar(255) DEFAULT NULL,
      `shift` varchar(50) DEFAULT NULL,
      `check-in_time` varchar(50) DEFAULT NULL,
      `check-out_time` varchar(50) DEFAULT NULL,
      `gps` varchar(100) DEFAULT NULL,
      `photos` longtext,
      `guards` longtext,
      `checklist` longtext,
      `observations` longtext,
      `suggestions` text,
      `attachments` longtext,
      `lecture_details` text,
      `random_checking` text,
      `overall_remarks` text,
      `status` varchar(50) DEFAULT NULL,
      `created_on` varchar(100) DEFAULT NULL,
      PRIMARY KEY (`oid`),
      KEY `idx_fodvr_custom_visit_id` (`custom_visit_id`),
      CONSTRAINT `fk_day_report_custom_visit` FOREIGN KEY (`custom_visit_id`) REFERENCES `FIELD_OFFICER_NEW_CLIENT_VISITS` (`oid`) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `FIELD_OFFICER_NIGHT_VISIT_REPORTS` (
      `oid` varchar(100) NOT NULL,
      `employee_oid` bigint DEFAULT NULL,
      `report_id` varchar(255) DEFAULT NULL,
      `unit` varchar(255) DEFAULT NULL,
      `client_id` int DEFAULT NULL,
      `site_id` int DEFAULT NULL,
      `custom_visit_id` bigint DEFAULT NULL,
      `visit_date` varchar(50) DEFAULT NULL,
      `visit_type` varchar(50) DEFAULT NULL,
      `officer` varchar(255) DEFAULT NULL,
      `shift` varchar(50) DEFAULT NULL,
      `check-in_time` varchar(50) DEFAULT NULL,
      `check-out_time` varchar(50) DEFAULT NULL,
      `gps` varchar(100) DEFAULT NULL,
      `photos` longtext,
      `guards` longtext,
      `checklist` longtext,
      `observations` longtext,
      `suggestions` text,
      `attachments` longtext,
      `officer_signature` longtext,
      `lecture_details` text,
      `random_checking` text,
      `overall_remarks` text,
      `status` varchar(50) DEFAULT NULL,
      `created_on` varchar(100) DEFAULT NULL,
      PRIMARY KEY (`oid`),
      KEY `idx_fonvr_custom_visit_id` (`custom_visit_id`),
      CONSTRAINT `fk_night_report_custom_visit` FOREIGN KEY (`custom_visit_id`) REFERENCES `FIELD_OFFICER_NEW_CLIENT_VISITS` (`oid`) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `FIELD_OFFICER_GENERAL_VISIT_REPORTS` (
      `oid` varchar(255) NOT NULL,
      `employee_oid` bigint DEFAULT NULL,
      `officer` varchar(255) DEFAULT NULL,
      `report_id` varchar(255) DEFAULT NULL,
      `client_id` int DEFAULT NULL,
      `client_name` varchar(255) DEFAULT NULL,
      `site_id` int DEFAULT NULL,
      `custom_visit_id` bigint DEFAULT NULL,
      `site_name` varchar(255) DEFAULT NULL,
      `person_visited` text,
      `reason_of_visit` text,
      `created_on` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
      `visit_date` varchar(50) DEFAULT NULL,
      `remark` text,
      `check-in_time` varchar(50) DEFAULT NULL,
      `check-out_time` varchar(50) DEFAULT NULL,
      `start_time` varchar(50) DEFAULT NULL,
      `end_time` varchar(50) DEFAULT NULL,
      `gps` varchar(255) DEFAULT NULL,
      PRIMARY KEY (`oid`),
      KEY `idx_fogvr_custom_visit_id` (`custom_visit_id`),
      CONSTRAINT `fk_general_report_custom_visit` FOREIGN KEY (`custom_visit_id`) REFERENCES `FIELD_OFFICER_NEW_CLIENT_VISITS` (`oid`) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `ATTENDANCE_CELL` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `EMPLOYEE` bigint NOT NULL,
      `attendance_date` date NOT NULL,
      `attendance_state` varchar(50) DEFAULT 'PRESENT',
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `ATTENDANCE_TIME_LOG` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `ATTENDANCE_CELL` bigint NOT NULL,
      `in_time` datetime DEFAULT NULL,
      `out_time` datetime DEFAULT NULL,
      `SHIFT_DESIGNATION_COUNT` bigint DEFAULT NULL,
      `track_history_enabled_at_punch_in` tinyint DEFAULT 1,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS `FIELD_OFFICER_ATTENDANCE_LOCATION` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `attendance_time_log` bigint NOT NULL,
      `punch_type` varchar(10) NOT NULL,
      `latitude` float DEFAULT NULL,
      `longitude` float DEFAULT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    # Clean previous test run data
    c.execute("SET FOREIGN_KEY_CHECKS = 0")
    c.execute("TRUNCATE TABLE FIELD_OFFICER_DAY_VISIT_REPORTS")
    c.execute("TRUNCATE TABLE FIELD_OFFICER_NIGHT_VISIT_REPORTS")
    c.execute("TRUNCATE TABLE FIELD_OFFICER_GENERAL_VISIT_REPORTS")
    c.execute("TRUNCATE TABLE SITE_VISIT_SESSIONS")
    c.execute("TRUNCATE TABLE FIELD_OFFICER_NEW_CLIENT_VISITS")
    c.execute("TRUNCATE TABLE FIELD_OFFICER_VISIT_FREQUENCY")
    c.execute("TRUNCATE TABLE FIELD_OFFICER_ASSIGNED_VISITS")
    c.execute("TRUNCATE TABLE SITE_GATE_QRCODE")
    c.execute("TRUNCATE TABLE SITE")
    c.execute("TRUNCATE TABLE CLIENTT")
    c.execute("TRUNCATE TABLE EMPLOYEE")
    c.execute("TRUNCATE TABLE BRANCH")
    c.execute("TRUNCATE TABLE ATTENDANCE_TIME_LOG")
    c.execute("TRUNCATE TABLE ATTENDANCE_CELL")
    c.execute("SET FOREIGN_KEY_CHECKS = 1")

    # Seed initial test data
    c.execute("INSERT INTO BRANCH (oid, name) VALUES (1, 'Pune Central')")
    c.execute("INSERT INTO EMPLOYEE (oid, emp_code, name, BRANCH) VALUES (10221, 'EMP10221', 'Rajesh Sharma', 1)")
    c.execute("INSERT INTO EMPLOYEE (oid, emp_code, name, BRANCH) VALUES (9999, 'EMP9999', 'Vikram Singh', 1)")

    # Punch in officer 10221 for today
    today_str = date.today().isoformat()
    now_dt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("INSERT INTO ATTENDANCE_CELL (oid, EMPLOYEE, attendance_date, attendance_state) VALUES (1, 10221, %s, 'PRESENT')", (today_str,))
    c.execute("INSERT INTO ATTENDANCE_TIME_LOG (oid, ATTENDANCE_CELL, in_time, out_time) VALUES (1, 1, %s, NULL)", (now_dt,))

    # Client & Site for registered visits
    c.execute("INSERT INTO CLIENTT (oid, name, company_vender_code) VALUES (101, 'Alpha Corp', 'AC01')")
    c.execute("INSERT INTO SITE (oid, name, CLIENTT, BRANCH) VALUES (201, 'Alpha Tech Hub', 101, 1)")
    c.execute("INSERT INTO SITE_GATE_QRCODE (oid, SITE, latitude, longitude, radius) VALUES (1, 201, 18.5100, 73.8500, 100)")

    # Plan 1: PUBLISHED Plan for 10221 with 1 registered visit and 1 custom visit
    c.execute("""
    INSERT INTO FIELD_OFFICER_ASSIGNED_VISITS (oid, plan_code, planning_type, week_start_date, week_end_date, employee_oid, status, created_at)
    VALUES (10, 'VP-001', 'WEEKLY', '2026-10-12', '2026-10-18', 10221, 'PUBLISHED', '2026-10-12 09:00:00')
    """)
    c.execute("INSERT INTO FIELD_OFFICER_VISIT_FREQUENCY (oid, plan_oid, site_oid, visit_frequency) VALUES (1, 10, 201, 2)")
    c.execute("""
    INSERT INTO FIELD_OFFICER_NEW_CLIENT_VISITS (oid, plan_oid, branch_oid, client_name, site_name, address, latitude, longitude, visit_frequency)
    VALUES (500, 10, 1, 'Custom Client Beta', 'Beta Hub Pune', 'Kalyani Nagar', 18.5500, 73.9000, 1)
    """)

    # Plan 2: DRAFT Plan for 10221 with 1 custom visit
    c.execute("""
    INSERT INTO FIELD_OFFICER_ASSIGNED_VISITS (oid, plan_code, planning_type, week_start_date, week_end_date, employee_oid, status, created_at)
    VALUES (20, 'VP-002', 'WEEKLY', '2026-10-12', '2026-10-18', 10221, 'DRAFT', '2026-10-12 10:00:00')
    """)
    c.execute("""
    INSERT INTO FIELD_OFFICER_NEW_CLIENT_VISITS (oid, plan_oid, branch_oid, client_name, site_name, address, latitude, longitude, visit_frequency)
    VALUES (600, 20, 1, 'Draft Client Gamma', 'Gamma Site', 'Hinjewadi', 18.5900, 73.7400, 1)
    """)

    conn.commit()
    conn.close()
    print("Database `fo_dev_test` setup and seeded successfully.")

def run_tests():
    setup_test_database()

    # Re-import DB connection pool in app to ensure it uses fo_dev_test
    import app.database
    app.database.DB_HOST = "localhost"
    app.database.DB_USER = "root"
    app.database.DB_PASSWORD = "root"
    app.database.DB_NAME = "fo_dev_test"
    app.database._db_pool = None  # Reset pool

    from starlette.testclient import TestClient
    from main import app

    client = TestClient(app)

    # Auth helper
    def make_token(emp_id: int, role: str = "OFFICER") -> str:
        payload = {"id": emp_id, "employee_id": emp_id, "name": "Rajesh Sharma", "role": role}
        raw_b64 = base64.b64encode(json.dumps(payload).encode()).decode()
        return f"Bearer {raw_b64}"

    auth_10221 = make_token(10221)
    auth_9999 = make_token(9999)

    print("\n--- TEST 1: Strict 401 Unauthorized Token Rejection ---")
    # Missing token
    r = client.get("/api/planned-visits")
    print(f"GET /api/planned-visits (no token) -> Status: {r.status_code}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    r = client.post("/api/officer-visits/reports", json={})
    print(f"POST /api/officer-visits/reports (no token) -> Status: {r.status_code}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    r = client.post("/api/officer-rounds/reports", json={})
    print(f"POST /api/officer-rounds/reports (no token) -> Status: {r.status_code}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    r = client.post("/api/general-visits", json={})
    print(f"POST /api/general-visits (no token) -> Status: {r.status_code}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    # Invalid token
    r = client.post("/api/officer-visits/reports", json={}, headers={"Authorization": "Bearer badtoken123"})
    print(f"POST /api/officer-visits/reports (invalid token) -> Status: {r.status_code}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    print("[PASS] Test 1 Passed: 401 enforced across endpoints.")

    print("\n--- TEST 2: Retrieval of Unified Planned Visits (Registered + Custom) ---")
    r = client.get("/api/planned-visits?empOid=10221", headers={"Authorization": auth_10221})
    print(f"GET /api/planned-visits -> Status: {r.status_code}")
    assert r.status_code == 200
    visits = r.json()
    print(f"Returned {len(visits)} planned visit(s).")
    assert len(visits) == 2, f"Expected 2 visits (1 registered, 1 custom), got {len(visits)}"

    registered_v = next((v for v in visits if not v.get("isCustomVisit")), None)
    custom_v = next((v for v in visits if v.get("isCustomVisit")), None)

    assert registered_v is not None, "Registered visit missing from response"
    assert custom_v is not None, "Custom visit missing from response"

    print(f"Registered Visit: id={registered_v.get('id')}, siteId={registered_v.get('siteId')}, siteName={registered_v.get('siteName')}, isCustom={registered_v.get('isCustomVisit')}")
    print(f"Custom Visit: id={custom_v.get('id')}, customVisitId={custom_v.get('customVisitId')}, siteName={custom_v.get('siteName')}, isCustom={custom_v.get('isCustomVisit')}")

    assert registered_v.get("siteId") == 201
    assert registered_v.get("customVisitId") is None
    assert custom_v.get("customVisitId") == 500
    assert custom_v.get("siteId") is None
    assert custom_v.get("siteName") == "Beta Hub Pune"
    assert custom_v.get("clientName") == "Custom Client Beta"
    print("[PASS] Test 2 Passed: Unified planned visits returned correctly.")

    print("\n--- TEST 3: Check-in to Custom Visit (Policy A GPS Session) ---")
    check_in_payload = {
        "employee_id": 10221,
        "custom_visit_id": 500,
        "site_id": None,
        "latitude": 18.5501,
        "longitude": 73.9002,
        "site_name": "Beta Hub Pune"
    }
    r = client.post("/api/gps/manual-site-check-in", json=check_in_payload, headers={"Authorization": auth_10221})
    print(f"POST /api/gps/manual-site-check-in -> Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 200
    res_data = r.json()
    assert res_data.get("success") is True

    # Verify session in DB
    conn = mysql.connector.connect(host="localhost", user="root", password="root", database="fo_dev_test")
    c = conn.cursor(dictionary=True)
    c.execute("SELECT * FROM SITE_VISIT_SESSIONS WHERE Employee = 10221 AND status = 'IN_PROGRESS'")
    session_row = c.fetchone()
    conn.close()

    assert session_row is not None, "Active session not found in SITE_VISIT_SESSIONS"
    print(f"Active Session in DB: oid={session_row['oid']}, site_id={session_row['site_id']}, custom_visit_id={session_row['custom_visit_id']}, status={session_row['status']}")
    assert session_row["custom_visit_id"] == 500
    assert session_row["site_id"] is None

    # Verify active session API
    r = client.get("/api/gps/active-site-visit-session?employee_id=10221", headers={"Authorization": auth_10221})
    print(f"GET /api/gps/active-site-visit-session -> Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 200
    active_res = r.json()
    assert active_res.get("has_active_session") is True
    assert active_res.get("active_session", {}).get("custom_visit_id") == 500
    assert active_res.get("active_session", {}).get("site_id") is None
    print("[PASS] Test 3 Passed: Check-in to custom visit recorded with custom_visit_id and null site_id.")

    print("\n--- TEST 4: Rejection of Report Submission on DRAFT Plan ---")
    draft_report_payload = {
        "custom_visit_id": 600,
        "site_id": None,
        "client_id": None,
        "site_name": "Gamma Site",
        "visit_date": "2026-10-16",
        "visit_type": "Custom Visit",
        "shift": "Day",
        "officer": "Rajesh Sharma",
        "employee_oid": 10221,
        "start_time": "10:00",
        "end_time": "10:30",
        "gps": "18.5900, 73.7400"
    }
    r = client.post("/api/officer-visits/reports", json=draft_report_payload, headers={"Authorization": auth_10221})
    print(f"POST /api/officer-visits/reports (DRAFT plan) -> Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 400
    assert "draft" in r.json().get("detail", "").lower()
    print("[PASS] Test 4 Passed: Report submission on DRAFT plan rejected with 400.")

    print("\n--- TEST 5: Rejection of Report Submission by Unauthorized Officer ---")
    unauth_payload = {
        "custom_visit_id": 500,
        "site_id": None,
        "client_id": None,
        "site_name": "Beta Hub Pune",
        "visit_date": "2026-10-16",
        "visit_type": "Custom Visit",
        "shift": "Day",
        "officer": "Vikram Singh",
        "employee_oid": 9999,
        "start_time": "10:00",
        "end_time": "10:30",
        "gps": "18.5500, 73.9000"
    }
    r = client.post("/api/officer-visits/reports", json=unauth_payload, headers={"Authorization": auth_9999})
    print(f"POST /api/officer-visits/reports (Officer 9999 on 10221's visit) -> Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 403
    print("[PASS] Test 5 Passed: Unauthorized officer submission rejected with 403.")

    print("\n--- TEST 6: Successful Submission of Day, Night, and General Reports for Custom Visit ---")
    # 6a. Day Report
    day_payload = {
        "custom_visit_id": 500,
        "site_id": None,
        "client_id": None,
        "site_name": "Beta Hub Pune",
        "unit": "Beta Hub Pune",
        "visit_date": "2026-10-16",
        "visit_type": "Custom Visit",
        "shift": "Day",
        "officer": "Rajesh Sharma",
        "employee_oid": 10221,
        "start_time": "10:00",
        "end_time": "10:30",
        "gps": "18.5501, 73.9002",
        "checklist": [{"question": "Gate Security", "status": "Satisfactory"}],
        "status": "Completed"
    }
    r = client.post("/api/officer-visits/reports", json=day_payload, headers={"Authorization": auth_10221})
    print(f"POST /api/officer-visits/reports (Day Report) -> Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code in (200, 201)
    day_report_res = r.json()

    # 6b. Night Report
    night_payload = {
        "custom_visit_id": 500,
        "site_id": None,
        "client_id": None,
        "site_name": "Beta Hub Pune",
        "unit": "Beta Hub Pune",
        "visit_date": "2026-10-16",
        "visit_type": "Custom Visit",
        "shift": "Night",
        "officer": "Rajesh Sharma",
        "employee_oid": 10221,
        "start_time": "22:00",
        "end_time": "22:30",
        "gps": "18.5501, 73.9002",
        "checklist": [{"question": "Perimeter Patrol", "status": "Satisfactory"}],
        "status": "Completed"
    }
    r = client.post("/api/officer-rounds/reports", json=night_payload, headers={"Authorization": auth_10221})
    print(f"POST /api/officer-rounds/reports (Night Report) -> Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code in (200, 201)

    # 6c. General Report
    general_payload = {
        "custom_visit_id": 500,
        "site_id": None,
        "client_id": None,
        "client_name": "Custom Client Beta",
        "site_name": "Beta Hub Pune",
        "person_visited": "Operations Head",
        "reason_of_visit": "Client Review Meeting",
        "visit_date": "2026-10-16",
        "start_time": "11:00",
        "end_time": "11:45",
        "gps": "18.5501, 73.9002",
        "officer": "Rajesh Sharma",
        "employee_oid": 10221,
        "visit_type": "Custom Visit"
    }
    r = client.post("/api/general-visits", json=general_payload, headers={"Authorization": auth_10221})
    print(f"POST /api/general-visits (General Report) -> Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code in (200, 201)
    print("[PASS] Test 6 Passed: Day, Night, and General reports submitted successfully.")

    print("\n--- TEST 7: Database Persistence & Identifier Isolation Verification ---")
    conn = mysql.connector.connect(host="localhost", user="root", password="root", database="fo_dev_test")
    c = conn.cursor(dictionary=True)

    # Check Day Report
    c.execute("SELECT * FROM FIELD_OFFICER_DAY_VISIT_REPORTS WHERE employee_oid = 10221")
    day_row = c.fetchone()
    print(f"Day Report Row: oid={day_row['oid']}, site_id={day_row['site_id']}, custom_visit_id={day_row['custom_visit_id']}, unit={day_row['unit']}")
    assert day_row["custom_visit_id"] == 500
    assert day_row["site_id"] is None

    # Check Night Report
    c.execute("SELECT * FROM FIELD_OFFICER_NIGHT_VISIT_REPORTS WHERE employee_oid = 10221")
    night_row = c.fetchone()
    print(f"Night Report Row: oid={night_row['oid']}, site_id={night_row['site_id']}, custom_visit_id={night_row['custom_visit_id']}, unit={night_row['unit']}")
    assert night_row["custom_visit_id"] == 500
    assert night_row["site_id"] is None

    # Check General Report
    c.execute("SELECT * FROM FIELD_OFFICER_GENERAL_VISIT_REPORTS WHERE employee_oid = 10221")
    gen_row = c.fetchone()
    print(f"General Report Row: oid={gen_row['oid']}, site_id={gen_row['site_id']}, custom_visit_id={gen_row['custom_visit_id']}, site_name={gen_row['site_name']}")
    assert gen_row["custom_visit_id"] == 500
    assert gen_row["site_id"] is None

    conn.close()
    print("[PASS] Test 7 Passed: Strict identifier isolation verified (custom_visit_id=500, site_id=NULL).")

    print("\n--- TEST 8: Check-out of Custom Visit Session ---")
    check_out_payload = {
        "employee_id": 10221,
        "custom_visit_id": 500,
        "site_id": None,
        "latitude": 18.5502,
        "longitude": 73.9003
    }
    r = client.post("/api/gps/manual-site-check-out", json=check_out_payload, headers={"Authorization": auth_10221})
    print(f"POST /api/gps/manual-site-check-out -> Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 200
    assert r.json().get("success") is True

    # Verify session status is COMPLETED
    conn = mysql.connector.connect(host="localhost", user="root", password="root", database="fo_dev_test")
    c = conn.cursor(dictionary=True)
    c.execute("SELECT * FROM SITE_VISIT_SESSIONS WHERE Employee = 10221 AND custom_visit_id = 500")
    completed_session = c.fetchone()
    conn.close()

    print(f"Completed Session in DB: status={completed_session['status']}, duration_minutes={completed_session['duration_minutes']}, check_out_time={completed_session['check_out_time']}")
    assert completed_session["status"] == "COMPLETED"
    assert completed_session["check_out_time"] is not None

    # Verify active session is now None
    r = client.get("/api/gps/active-site-visit-session?employee_id=10221", headers={"Authorization": auth_10221})
    assert r.status_code == 200
    assert r.json().get("has_active_session") is False
    print("[PASS] Test 8 Passed: Check-out successfully completed session.")

    print("\n--- TEST 9: Foreign Key ON DELETE RESTRICT Verification ---")
    conn = mysql.connector.connect(host="localhost", user="root", password="root", database="fo_dev_test")
    c = conn.cursor()
    fk_restricted = False
    try:
        c.execute("DELETE FROM FIELD_OFFICER_NEW_CLIENT_VISITS WHERE oid = 500")
        conn.commit()
    except mysql.connector.Error as err:
        print(f"Attempted DELETE FROM FIELD_OFFICER_NEW_CLIENT_VISITS WHERE oid = 500 -> Caught expected FK error: {err}")
        fk_restricted = True
    conn.close()

    assert fk_restricted is True, "Expected ON DELETE RESTRICT foreign key error, but deletion succeeded!"
    print("[PASS] Test 9 Passed: Foreign key ON DELETE RESTRICT preserved historical integrity.")

    print("\n=======================================================")
    print("ALL 9 END-TO-END INTEGRATION TESTS PASSED PERFECTLY!")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
