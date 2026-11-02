"""
Automated Backwards-Compatibility Test Suite for Legacy Left Guards References
Validates that existing scripts or external tools importing legacy identifiers
(deactivate_left_guards, ENABLE_LEFT_GUARDS_SCHEDULER, etc.) continue to function seamlessly.
"""

import os
import sys
import unittest
from datetime import date, timedelta
import mysql.connector

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.services.employee_deactivation_service import (
    deactivate_left_guards,
    rollback_deactivation,
    acquire_advisory_lock,
    ADVISORY_LOCK_NAME,
    LEGACY_ADVISORY_LOCK_NAME
)
from app.config import (
    ENABLE_LEFT_GUARDS_SCHEDULER,
    LEFT_GUARDS_SCHEDULER_INTERVAL_HOURS,
    LEFT_GUARDS_SCHEDULER_DRY_RUN
)

DEV_DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "root",
    "database": "qrda_test",
    "port": 3306
}

class TestLegacyLeftGuardsCompatibility(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = mysql.connector.connect(**DEV_DB_CONFIG)
        cls.cursor = cls.conn.cursor(dictionary=True)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.cursor.execute("DELETE FROM employee WHERE emp_code LIKE 'TST_LEG_%'")
            cls.conn.commit()
        except Exception:
            pass
        cls.cursor.close()
        cls.conn.close()

    def setUp(self):
        self.cursor.execute("DELETE FROM employee WHERE emp_code LIKE 'TST_LEG_%'")
        self.conn.commit()

    def test_legacy_function_dry_run_and_execution(self):
        """Verify calling deactivate_left_guards executes without error."""
        today = date.today()
        past_date = today - timedelta(days=2)
        test_oid = 99981

        self.cursor.execute("""
            INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
            VALUES (%s, 'TST_LEG_01', 'Legacy Guard', '9999000081', %s, 1, 1, 1)
        """, (test_oid, past_date))
        self.conn.commit()

        # 1. Dry run via legacy function name
        dry_res = deactivate_left_guards(conn=self.conn, dry_run=True, target_date=today)
        self.assertEqual(dry_res["status"], "dry_run")
        self.assertEqual(dry_res["matched_count"], 1)

        # 2. Live run via legacy function name
        live_res = deactivate_left_guards(conn=self.conn, dry_run=False, target_date=today)
        self.assertEqual(live_res["status"], "success")
        self.assertEqual(live_res["updated_count"], 1)

        # Verify DB changed
        self.cursor.execute("SELECT active FROM employee WHERE oid = %s", (test_oid,))
        row = self.cursor.fetchone()
        self.assertEqual(row["active"], 0)

        # Clean audit file
        if "audit_file" in live_res and os.path.isfile(live_res["audit_file"]):
            os.remove(live_res["audit_file"])

    def test_legacy_advisory_lock_name_compatibility(self):
        """Verify acquiring lock under legacy lock name works."""
        with acquire_advisory_lock(self.conn, LEGACY_ADVISORY_LOCK_NAME, timeout=0) as acquired:
            self.assertTrue(acquired)

    def test_legacy_scheduler_configuration_presence(self):
        """Verify legacy scheduler config variables are boolean/float as expected."""
        self.assertIsInstance(ENABLE_LEFT_GUARDS_SCHEDULER, bool)
        self.assertFalse(ENABLE_LEFT_GUARDS_SCHEDULER)
        self.assertIsInstance(LEFT_GUARDS_SCHEDULER_INTERVAL_HOURS, float)
        self.assertIsInstance(LEFT_GUARDS_SCHEDULER_DRY_RUN, bool)

    def test_legacy_sync_file_rollback_compatibility(self):
        """Verify that rollback_deactivation can restore old sync_*.json format audit logs."""
        import json
        import hashlib
        today = date.today()
        test_oid = 99982

        self.cursor.execute("""
            INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
            VALUES (%s, 'TST_LEG_02', 'Old Audit Guard', '9999000082', %s, 0, 0, 0)
        """, (test_oid, today))
        self.conn.commit()

        # Construct legacy format audit record (sync_YYYYMMDD_HHMMSS)
        legacy_employees = [
            {
                "oid": test_oid,
                "emp_code": "TST_LEG_02",
                "date_of_leaving": str(today),
                "original_state": {"active": 1, "app_registered": 1, "patrol_app_registered": 1},
                "new_state": {"active": 0, "app_registered": 0, "patrol_app_registered": 0}
            }
        ]
        checksum = hashlib.sha256(json.dumps(legacy_employees, sort_keys=True).encode()).hexdigest()
        legacy_audit_data = {
            "sync_id": "sync_20261026_120000",
            "timestamp": "2026-10-26T12:00:00",
            "target_date": str(today),
            "updated_count": 1,
            "employees": legacy_employees,
            "integrity_checksum": checksum
        }

        rollback_res = rollback_deactivation(audit_source=legacy_audit_data, conn=self.conn)
        self.assertEqual(rollback_res["status"], "success")
        self.assertEqual(rollback_res["restored_count"], 1)

        # Verify DB restored
        self.cursor.execute("SELECT active, app_registered, patrol_app_registered FROM employee WHERE oid = %s", (test_oid,))
        row = self.cursor.fetchone()
        self.assertEqual(row["active"], 1)
        self.assertEqual(row["app_registered"], 1)
        self.assertEqual(row["patrol_app_registered"], 1)

if __name__ == "__main__":
    unittest.main(verbosity=2)
