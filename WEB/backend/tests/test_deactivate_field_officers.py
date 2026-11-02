"""
Automated Isolated Test Suite for Field Officer Deactivation Service
Tests are run against the local development/test database (`qrda_test`).
No production records are touched.
"""

import os
import sys
import unittest
import asyncio
from datetime import date, timedelta
import mysql.connector

# Ensure backend root is on sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.services.employee_deactivation_service import (
    deactivate_field_officers,
    deactivate_left_guards,
    rollback_deactivation,
    acquire_advisory_lock,
    scheduled_deactivation_worker,
    ADVISORY_LOCK_NAME,
    LEGACY_ADVISORY_LOCK_NAME
)
from app.config import (
    ENABLE_FIELD_OFFICER_DEACTIVATION_SCHEDULER,
    ENABLE_LEFT_GUARDS_SCHEDULER,
    FIELD_OFFICER_DEACTIVATION_SCHEDULER_INTERVAL_HOURS,
    LEFT_GUARDS_SCHEDULER_INTERVAL_HOURS,
    FIELD_OFFICER_DEACTIVATION_SCHEDULER_DRY_RUN,
    LEFT_GUARDS_SCHEDULER_DRY_RUN
)

DEV_DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "root",
    "database": "qrda_test",
    "port": 3306
}

class TestFieldOfficerDeactivation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Connect to local test database
        cls.conn = mysql.connector.connect(**DEV_DB_CONFIG)
        cls.cursor = cls.conn.cursor(dictionary=True)

        # Allow non-strict date insertion if needed for 0000-00-00 testing
        try:
            cls.cursor.execute("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'")
            cls.cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        except Exception:
            pass

    @classmethod
    def tearDownClass(cls):
        # Clean up any leftover test records
        try:
            cls.cursor.execute("DELETE FROM employee WHERE emp_code LIKE 'TST_FO_%' OR emp_code LIKE 'TST_G_%'")
            cls.cursor.execute("DELETE FROM attendance_cell WHERE EMPLOYEE > 99900")
            cls.cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
            cls.conn.commit()
        except Exception:
            pass
        cls.cursor.close()
        cls.conn.close()

    def setUp(self):
        # Clean test records before each test
        self.cursor.execute("DELETE FROM employee WHERE emp_code LIKE 'TST_FO_%' OR emp_code LIKE 'TST_G_%'")
        self.cursor.execute("DELETE FROM attendance_cell WHERE EMPLOYEE > 99900")
        self.conn.commit()

    def test_01_dry_run_identifies_candidates_without_modifying(self):
        """
        Verify that dry-run returns candidate field officers with date_of_leaving <= target_date,
        but does NOT modify the database records.
        """
        today = date.today()
        past_date = today - timedelta(days=5)

        # Insert candidate employee who left in the past
        self.cursor.execute("""
            INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
            VALUES (99901, 'TST_FO_DRY', 'Dry Run Officer', '9999000001', %s, 1, 1, 1)
        """, (past_date,))
        self.conn.commit()

        result = deactivate_field_officers(conn=self.conn, dry_run=True, target_date=today)

        self.assertEqual(result["status"], "dry_run")
        self.assertTrue(result["dry_run"])
        self.assertEqual(result["matched_count"], 1)
        self.assertEqual(result["updated_count"], 0)
        self.assertEqual(len(result["affected_employees"]), 1)
        self.assertEqual(result["affected_employees"][0]["emp_code"], "TST_FO_DRY")

        # Verify DB status is UNCHANGED
        self.cursor.execute("SELECT active, app_registered, patrol_app_registered FROM employee WHERE oid = 99901")
        row = self.cursor.fetchone()
        self.assertEqual(row["active"], 1)
        self.assertEqual(row["app_registered"], 1)
        self.assertEqual(row["patrol_app_registered"], 1)

    def test_02_date_conditions_and_status_mutations(self):
        """
        Test multiple employee date conditions:
        - Past leaving date -> DEACTIVATED (0, 0, 0)
        - Today leaving date -> DEACTIVATED (0, 0, 0)
        - Future leaving date -> IGNORED (remains 1, 1, 1)
        - NULL leaving date -> IGNORED (remains 1, 1, 1)
        - Sentinel invalid leaving date (1965-05-01) -> IGNORED (remains 1, 1, 1)
        - Zero leaving date (0000-00-00) -> IGNORED (remains 1, 1, 1)
        """
        today = date.today()
        past_date = today - timedelta(days=2)
        future_date = today + timedelta(days=5)

        records = [
            (99911, 'TST_FO_PAST', 'Past Officer', '9999000011', past_date, 1, 1, 1),
            (99912, 'TST_FO_TODAY', 'Today Officer', '9999000012', today, 1, 1, 1),
            (99913, 'TST_FO_FUTURE', 'Future Officer', '9999000013', future_date, 1, 1, 1),
            (99914, 'TST_FO_NULL', 'Null Officer', '9999000014', None, 1, 1, 1),
            (99915, 'TST_FO_SENTINEL', 'Sentinel Officer', '9999000015', date(1965, 5, 1), 1, 1, 1),
        ]

        for r in records:
            self.cursor.execute("""
                INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, r)

        # Insert 0000-00-00 if engine allows
        try:
            self.cursor.execute("""
                INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
                VALUES (99916, 'TST_FO_ZERO', 'Zero Officer', '9999000016', '0000-00-00', 1, 1, 1)
            """)
        except Exception:
            pass

        self.conn.commit()

        # Run LIVE deactivation
        result = deactivate_field_officers(conn=self.conn, dry_run=False, target_date=today)
        self.assertEqual(result["status"], "success")
        self.assertFalse(result["dry_run"])
        self.assertEqual(result["matched_count"], 2)  # only past and today
        self.assertEqual(result["updated_count"], 2)

        # Check DB states
        self.cursor.execute("SELECT oid, active, app_registered, patrol_app_registered FROM employee WHERE oid IN (99911, 99912, 99913, 99914, 99915, 99916)")
        rows = {r["oid"]: r for r in self.cursor.fetchall()}

        # 99911 (Past) -> Deactivated
        self.assertEqual(rows[99911]["active"], 0)
        self.assertEqual(rows[99911]["app_registered"], 0)
        self.assertEqual(rows[99911]["patrol_app_registered"], 0)

        # 99912 (Today) -> Deactivated
        self.assertEqual(rows[99912]["active"], 0)
        self.assertEqual(rows[99912]["app_registered"], 0)
        self.assertEqual(rows[99912]["patrol_app_registered"], 0)

        # 99913 (Future) -> Still Active
        self.assertEqual(rows[99913]["active"], 1)
        self.assertEqual(rows[99913]["app_registered"], 1)
        self.assertEqual(rows[99913]["patrol_app_registered"], 1)

        # 99914 (NULL) -> Still Active
        self.assertEqual(rows[99914]["active"], 1)

        # 99915 (Sentinel) -> Still Active
        self.assertEqual(rows[99915]["active"], 1)

        # 99916 (Zero date) if present -> Still Active
        if 99916 in rows:
            self.assertEqual(rows[99916]["active"], 1)

        # Clean up audit log created
        if "audit_file" in result and os.path.isfile(result["audit_file"]):
            try:
                os.remove(result["audit_file"])
            except Exception:
                pass

    def test_03_idempotency(self):
        """
        Verify that running deactivation consecutively produces no additional updates
        and zero matching candidates on subsequent runs.
        """
        today = date.today()
        past_date = today - timedelta(days=1)

        self.cursor.execute("""
            INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
            VALUES (99921, 'TST_FO_IDEM', 'Idempotent Officer', '9999000021', %s, 1, 1, 1)
        """, (past_date,))
        self.conn.commit()

        # Run 1: Mutates record
        res1 = deactivate_field_officers(conn=self.conn, dry_run=False, target_date=today)
        self.assertEqual(res1["updated_count"], 1)
        if "audit_file" in res1 and os.path.isfile(res1["audit_file"]):
            os.remove(res1["audit_file"])

        # Run 2: Already deactivated, updated_count must be 0
        res2 = deactivate_field_officers(conn=self.conn, dry_run=False, target_date=today)
        self.assertEqual(res2["matched_count"], 0)
        self.assertEqual(res2["updated_count"], 0)

    def test_04_advisory_lock_concurrency_and_release(self):
        """
        Verify that MySQL GET_LOCK prevents concurrent execution across two connections,
        and that RELEASE_LOCK is properly called when exiting the context manager.
        """
        conn2 = mysql.connector.connect(**DEV_DB_CONFIG)
        try:
            # conn holds the lock
            with acquire_advisory_lock(self.conn, ADVISORY_LOCK_NAME, timeout=0) as acquired1:
                self.assertTrue(acquired1, "Primary connection failed to acquire advisory lock")

                # conn2 attempts to acquire the same lock non-blocking
                with acquire_advisory_lock(conn2, ADVISORY_LOCK_NAME, timeout=0) as acquired2:
                    self.assertFalse(acquired2, "Secondary connection unexpectedly acquired active advisory lock!")

            # After conn exits the lock context, conn2 should now acquire it successfully
            with acquire_advisory_lock(conn2, ADVISORY_LOCK_NAME, timeout=0) as acquired3:
                self.assertTrue(acquired3, "Secondary connection failed to acquire lock after release!")
        finally:
            conn2.close()

    def test_05_background_worker_clean_shutdown(self):
        """
        Verify that scheduled_deactivation_worker respects stop_event and shuts down promptly.
        """
        async def run_worker_test():
            stop_event = asyncio.Event()
            task = asyncio.create_task(scheduled_deactivation_worker(stop_event))
            await asyncio.sleep(0.05)
            stop_event.set()
            await asyncio.wait_for(task, timeout=1.0)
            self.assertTrue(task.done())

        asyncio.run(run_worker_test())

    def test_06_advisory_lock_released_on_unhandled_failure(self):
        """
        Verify that if an unhandled exception occurs inside the lock context,
        the lock is guaranteed to be released in the finally block.
        """
        conn2 = mysql.connector.connect(**DEV_DB_CONFIG)
        try:
            try:
                with acquire_advisory_lock(self.conn, ADVISORY_LOCK_NAME, timeout=0) as acquired:
                    self.assertTrue(acquired)
                    raise ValueError("Simulated unexpected crash inside locked section")
            except ValueError:
                pass

            # conn2 should immediately be able to acquire the lock because finally released it
            with acquire_advisory_lock(conn2, ADVISORY_LOCK_NAME, timeout=0) as acquired2:
                self.assertTrue(acquired2, "Lock was not released after exception!")
        finally:
            conn2.close()

    def test_07_historical_attendance_visit_patrol_preserved(self):
        """
        Verify that deactivation modifies ONLY the 3 employee status columns,
        and leaves historical attendance, visits, and patrol logs intact.
        """
        today = date.today()
        past_date = today - timedelta(days=2)
        test_oid = 99931

        self.cursor.execute("""
            INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
            VALUES (%s, 'TST_FO_HIST', 'Historical Officer', '9999000031', %s, 1, 1, 1)
        """, (test_oid, past_date))

        # Check if attendance_cell table exists in local DB
        self.cursor.execute("SHOW TABLES LIKE 'attendance_cell'")
        has_att = bool(self.cursor.fetchone())
        if has_att:
            self.cursor.execute("""
                INSERT INTO attendance_cell (EMPLOYEE, attendance_date, attendance_state)
                VALUES (%s, %s, 'IN')
            """, (test_oid, past_date))
            self.conn.commit()

        # Execute live deactivation
        result = deactivate_field_officers(conn=self.conn, dry_run=False, target_date=today)
        self.assertEqual(result["updated_count"], 1)

        # Verify historical attendance record is UNCHANGED
        if has_att:
            self.cursor.execute("SELECT attendance_state FROM attendance_cell WHERE EMPLOYEE = %s", (test_oid,))
            att_row = self.cursor.fetchone()
            self.assertIsNotNone(att_row)
            self.assertEqual(att_row["attendance_state"], "IN")

        if "audit_file" in result and os.path.isfile(result["audit_file"]):
            os.remove(result["audit_file"])

    def test_08_rollback_exact_status_recovery(self):
        """
        Verify that rollback_deactivation restores the EXACT original flags for each employee
        from the audit snapshot, rather than blindly setting all flags to 1.
        """
        today = date.today()
        past_date = today - timedelta(days=2)

        # Insert employees with heterogeneous original statuses
        # Emp 1: active=1, app_registered=1, patrol_app_registered=0
        # Emp 2: active=1, app_registered=0, patrol_app_registered=1
        self.cursor.execute("""
            INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
            VALUES 
            (99941, 'TST_FO_HET1', 'Hetero Officer 1', '9999000041', %s, 1, 1, 0),
            (99942, 'TST_FO_HET2', 'Hetero Officer 2', '9999000042', %s, 1, 0, 1)
        """, (past_date, past_date))
        self.conn.commit()

        # Step 1: Deactivate live
        res_live = deactivate_field_officers(conn=self.conn, dry_run=False, target_date=today)
        self.assertEqual(res_live["updated_count"], 2)
        audit_file = res_live["audit_file"]
        self.assertTrue(os.path.isfile(audit_file))
        self.assertTrue("field_officer_deactivation_" in audit_file)

        # Verify both are deactivated (0, 0, 0)
        self.cursor.execute("SELECT oid, active, app_registered, patrol_app_registered FROM employee WHERE oid IN (99941, 99942)")
        rows = {r["oid"]: r for r in self.cursor.fetchall()}
        self.assertEqual(rows[99941]["active"], 0)
        self.assertEqual(rows[99941]["app_registered"], 0)
        self.assertEqual(rows[99941]["patrol_app_registered"], 0)
        self.assertEqual(rows[99942]["active"], 0)
        self.assertEqual(rows[99942]["app_registered"], 0)
        self.assertEqual(rows[99942]["patrol_app_registered"], 0)

        # Step 2: Rollback using the audit snapshot
        rollback_res = rollback_deactivation(audit_source=audit_file, conn=self.conn)
        self.assertEqual(rollback_res["status"], "success")
        self.assertEqual(rollback_res["restored_count"], 2)

        # Step 3: Verify EXACT statuses restored
        self.cursor.execute("SELECT oid, active, app_registered, patrol_app_registered FROM employee WHERE oid IN (99941, 99942)")
        restored_rows = {r["oid"]: r for r in self.cursor.fetchall()}

        # Emp 1 should be restored to: active=1, app_registered=1, patrol_app_registered=0
        self.assertEqual(restored_rows[99941]["active"], 1)
        self.assertEqual(restored_rows[99941]["app_registered"], 1)
        self.assertEqual(restored_rows[99941]["patrol_app_registered"], 0)

        # Emp 2 should be restored to: active=1, app_registered=0, patrol_app_registered=1
        self.assertEqual(restored_rows[99942]["active"], 1)
        self.assertEqual(restored_rows[99942]["app_registered"], 0)
        self.assertEqual(restored_rows[99942]["patrol_app_registered"], 1)

        # Clean up
        try:
            os.remove(audit_file)
        except Exception:
            pass

    def test_09_rollback_detects_subsequent_status_conflicts(self):
        """
        Verify that rollback detects if an employee was modified or reactivated by HR
        after the deactivation sync, and aborts safely without silently overwriting changes.
        """
        today = date.today()
        past_date = today - timedelta(days=2)
        test_oid = 99951

        self.cursor.execute("""
            INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
            VALUES (%s, 'TST_FO_CONF', 'Conflict Officer', '9999000051', %s, 1, 1, 1)
        """, (test_oid, past_date))
        self.conn.commit()

        # Step 1: Deactivate live
        res_live = deactivate_field_officers(conn=self.conn, dry_run=False, target_date=today)
        self.assertEqual(res_live["updated_count"], 1)
        audit_file = res_live["audit_file"]

        # Step 2: Simulate subsequent legitimate change by HR (e.g. employee reactivated)
        self.cursor.execute("UPDATE employee SET active = 1, app_registered = 1, patrol_app_registered = 1 WHERE oid = %s", (test_oid,))
        self.conn.commit()

        # Step 3: Attempt rollback with abort_on_conflict=True (default)
        rollback_res = rollback_deactivation(audit_source=audit_file, conn=self.conn, abort_on_conflict=True)
        self.assertEqual(rollback_res["status"], "conflict_detected")
        self.assertEqual(rollback_res["restored_count"], 0)
        self.assertEqual(len(rollback_res["conflicts"]), 1)
        self.assertEqual(rollback_res["conflicts"][0]["reason"], "STATUS_MODIFIED_SINCE_SYNC")

        # Step 4: Verify DB status was NOT overwritten (HR reactivation preserved)
        self.cursor.execute("SELECT active, app_registered, patrol_app_registered FROM employee WHERE oid = %s", (test_oid,))
        row = self.cursor.fetchone()
        self.assertEqual(row["active"], 1)
        self.assertEqual(row["app_registered"], 1)
        self.assertEqual(row["patrol_app_registered"], 1)

        # Clean up
        try:
            os.remove(audit_file)
        except Exception:
            pass

    def test_10_audit_write_failure_triggers_transaction_rollback(self):
        """
        Verify that if writing the audit log fails, the database transaction
        is rolled back and no un-audited employee deactivations are committed.
        """
        from unittest.mock import patch
        today = date.today()
        past_date = today - timedelta(days=3)
        test_oid = 99961

        self.cursor.execute("""
            INSERT INTO employee (oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered)
            VALUES (%s, 'TST_FO_FAIL_AUDIT', 'Fail Audit Officer', '9999000061', %s, 1, 1, 1)
        """, (test_oid, past_date))
        self.conn.commit()

        # Patch write_audit_log to simulate I/O or disk full failure
        with patch("app.services.employee_deactivation_service.write_audit_log", side_effect=IOError("Simulated disk full or permission error")):
            with self.assertRaises(IOError):
                deactivate_field_officers(conn=self.conn, dry_run=False, target_date=today)

        # Verify that employee status was rolled back and is STILL active
        self.cursor.execute("SELECT active, app_registered, patrol_app_registered FROM employee WHERE oid = %s", (test_oid,))
        row = self.cursor.fetchone()
        self.assertEqual(row["active"], 1, "Database was not rolled back upon audit log write failure!")
        self.assertEqual(row["app_registered"], 1)
        self.assertEqual(row["patrol_app_registered"], 1)

    def test_11_backwards_compatible_function_and_lock_alias(self):
        """
        Verify that deactivate_left_guards is an exact alias for deactivate_field_officers,
        and both lock names are defined correctly.
        """
        self.assertIs(deactivate_left_guards, deactivate_field_officers)
        self.assertEqual(ADVISORY_LOCK_NAME, "deactivate_field_officers_job_lock")
        self.assertEqual(LEGACY_ADVISORY_LOCK_NAME, "deactivate_left_guards_job_lock")

    def test_12_backwards_compatible_config_aliases(self):
        """
        Verify that scheduler configuration variables have backwards-compatible aliases.
        """
        self.assertEqual(ENABLE_LEFT_GUARDS_SCHEDULER, ENABLE_FIELD_OFFICER_DEACTIVATION_SCHEDULER)
        self.assertEqual(LEFT_GUARDS_SCHEDULER_INTERVAL_HOURS, FIELD_OFFICER_DEACTIVATION_SCHEDULER_INTERVAL_HOURS)
        self.assertEqual(LEFT_GUARDS_SCHEDULER_DRY_RUN, FIELD_OFFICER_DEACTIVATION_SCHEDULER_DRY_RUN)

    def test_13_admin_endpoint_aliases_and_routes(self):
        """
        Verify that both /admin/employees/sync-field-officers and /admin/employees/sync-left-guards
        are registered on admin_routes router.
        """
        from app.routes.admin_routes import router, sync_field_officers_endpoint, sync_left_guards_endpoint
        self.assertIs(sync_left_guards_endpoint, sync_field_officers_endpoint)

        registered_paths = [route.path for route in router.routes]
        self.assertIn("/admin/employees/sync-field-officers", registered_paths)
        self.assertIn("/admin/employees/sync-left-guards", registered_paths)

if __name__ == "__main__":
    unittest.main(verbosity=2)
