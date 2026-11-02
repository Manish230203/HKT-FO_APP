"""
Field Officer Deactivation Service
Handles deactivation and app deregistration of left field officers whose date_of_leaving has arrived.

Features:
- Idempotent and safe: only updates employees where active != 0, app_registered != 0, or patrol_app_registered != 0.
- Dry-run mode for safe preview and validation without modifying database rows.
- PII masking for phone numbers in logs and output payloads.
- Structured audit logging to app/audit_logs/ for all live operations.
- Reversible rollback procedure restoring the exact original status for all affected employees.
- MySQL Advisory Locking (GET_LOCK / RELEASE_LOCK) to prevent concurrent execution across multiple API workers.
- Configurable background scheduler task designed for FastAPI lifespan (disabled by default).
- CLI entry point supporting --dry-run, --live, and --rollback.
"""

import os
import sys
import time
import json
import logging
import asyncio
from datetime import date, datetime
from typing import Optional, Dict, Any, List, Union
from contextlib import contextmanager

from app.database import get_db_connection
from app.config import (
    ENABLE_FIELD_OFFICER_DEACTIVATION_SCHEDULER,
    FIELD_OFFICER_DEACTIVATION_SCHEDULER_INTERVAL_HOURS,
    FIELD_OFFICER_DEACTIVATION_SCHEDULER_DRY_RUN,
    ENABLE_LEFT_GUARDS_SCHEDULER,
    LEFT_GUARDS_SCHEDULER_INTERVAL_HOURS,
    LEFT_GUARDS_SCHEDULER_DRY_RUN
)

logger = logging.getLogger("field_officer_deactivation")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [FieldOfficerDeactivationService] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

ADVISORY_LOCK_NAME = "deactivate_field_officers_job_lock"
LEGACY_ADVISORY_LOCK_NAME = "deactivate_left_guards_job_lock"
AUDIT_LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "audit_logs")

def mask_phone_number(phone: Optional[str]) -> Optional[str]:
    """Masks phone number to protect personal information in logs and audit trails."""
    if not phone:
        return None
    cleaned = str(phone).strip()
    if len(cleaned) <= 4:
        return "****"
    return "*" * (len(cleaned) - 4) + cleaned[-4:]

def write_audit_log(audit_data: Dict[str, Any]) -> str:
    """Persists a secure, structured audit record of deactivation sync for exact recovery."""
    os.makedirs(AUDIT_LOG_DIR, exist_ok=True)
    sync_id = audit_data.get("sync_id", f"field_officer_deactivation_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    audit_filepath = os.path.join(AUDIT_LOG_DIR, f"{sync_id}.json")
    
    # Compute SHA-256 integrity checksum of employee records
    import hashlib
    employees_repr = json.dumps(audit_data.get("employees", []), sort_keys=True)
    audit_data["integrity_checksum"] = hashlib.sha256(employees_repr.encode("utf-8")).hexdigest()

    temp_filepath = f"{audit_filepath}.tmp"
    with open(temp_filepath, "w", encoding="utf-8") as f:
        json.dump(audit_data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())

    try:
        os.chmod(temp_filepath, 0o600)
    except Exception:
        pass

    os.replace(temp_filepath, audit_filepath)
    logger.info(f"Audit log saved securely to: {audit_filepath}")
    return audit_filepath

@contextmanager
def acquire_advisory_lock(conn, lock_name: str = ADVISORY_LOCK_NAME, timeout: int = 0):
    """
    Context manager for MySQL advisory lock.
    Returns True if the lock was acquired, False if already held by another worker/connection.
    Guarantees the lock is released upon exit even if unhandled exceptions occur.
    """
    cursor = conn.cursor()
    acquired = False
    try:
        cursor.execute("SELECT GET_LOCK(%s, %s)", (lock_name, timeout))
        res = cursor.fetchone()
        acquired = bool(res and res[0] == 1)
        yield acquired
    finally:
        if acquired:
            try:
                cursor.execute("SELECT RELEASE_LOCK(%s)", (lock_name,))
                cursor.fetchall()
            except Exception as e:
                logger.warning(f"Error releasing advisory lock '{lock_name}': {e}")
        try:
            cursor.close()
        except Exception:
            pass

def deactivate_field_officers(
    conn=None,
    dry_run: bool = True,
    target_date: Optional[date] = None
) -> Dict[str, Any]:
    """
    Finds and deactivates field officers whose valid date_of_leaving is on or before target_date.
    
    Status updates applied:
      - active = 0
      - app_registered = 0
      - patrol_app_registered = 0
    """
    start_time = time.time()
    effective_date = target_date or date.today()
    if isinstance(effective_date, str):
        effective_date = datetime.strptime(effective_date, "%Y-%m-%d").date()

    close_conn_on_exit = False
    if conn is None:
        conn = get_db_connection()
        if not conn:
            raise RuntimeError("Failed to establish database connection for deactivation service.")
        close_conn_on_exit = True

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)

        # 1. Select all candidate employees meeting leaving criteria
        find_query = """
            SELECT oid, emp_code, name, mobile, date_of_leaving, active, app_registered, patrol_app_registered
            FROM EMPLOYEE
            WHERE date_of_leaving IS NOT NULL
              AND CAST(date_of_leaving AS CHAR) NOT LIKE '0000%'
              AND date_of_leaving > '1970-01-01'
              AND date_of_leaving <= %s
              AND (active != 0 OR app_registered != 0 OR patrol_app_registered != 0)
            ORDER BY date_of_leaving ASC, oid ASC
        """
        cursor.execute(find_query, (effective_date,))
        field_officers: List[Dict[str, Any]] = cursor.fetchall() or []
        count = len(field_officers)

        duration = time.time() - start_time
        affected_list = [
            {
                "oid": g.get("oid"),
                "emp_code": g.get("emp_code"),
                "name": g.get("name"),
                "mobile_masked": mask_phone_number(g.get("mobile")),
                "date_of_leaving": str(g.get("date_of_leaving")),
                "current_status": {
                    "active": g.get("active"),
                    "app_registered": g.get("app_registered"),
                    "patrol_app_registered": g.get("patrol_app_registered"),
                },
                "target_status": {
                    "active": 0,
                    "app_registered": 0,
                    "patrol_app_registered": 0,
                },
                "previous_state": {
                    "active": g.get("active"),
                    "app_registered": g.get("app_registered"),
                    "patrol_app_registered": g.get("patrol_app_registered"),
                }
            }
            for g in field_officers
        ]

        if dry_run:
            logger.info(
                f"[DRY-RUN] Evaluated deactivation up to {effective_date}. "
                f"Found {count} candidate field officer(s) requiring deactivation."
            )
            for g in affected_list:
                logger.info(
                    f"  -> Candidate: OID={g['oid']}, Code={g['emp_code']}, Name={g['name']}, "
                    f"LeavingDate={g['date_of_leaving']}, CurrentStatus={g['current_status']}"
                )
            return {
                "status": "dry_run",
                "dry_run": True,
                "target_date": str(effective_date),
                "matched_count": count,
                "updated_count": 0,
                "affected_employees": affected_list,
                "duration_ms": round(duration * 1000, 2),
                "message": f"Dry-run complete. Identified {count} field officer(s) eligible for deactivation."
            }

        # 2. Live Update execution (Transactional with Audit Coupling)
        if count > 0:
            update_query = """
                UPDATE EMPLOYEE
                SET active = 0,
                    app_registered = 0,
                    patrol_app_registered = 0
                WHERE date_of_leaving IS NOT NULL
                  AND CAST(date_of_leaving AS CHAR) NOT LIKE '0000%'
                  AND date_of_leaving > '1970-01-01'
                  AND date_of_leaving <= %s
                  AND (active != 0 OR app_registered != 0 OR patrol_app_registered != 0)
            """
            cursor.execute(update_query, (effective_date,))
            rows_updated = cursor.rowcount
            duration = time.time() - start_time

            # Generate structured audit record
            sync_id = f"field_officer_deactivation_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            audit_record = {
                "sync_id": sync_id,
                "timestamp": datetime.now().isoformat(),
                "target_date": str(effective_date),
                "updated_count": rows_updated,
                "employees": [
                    {
                        "oid": g["oid"],
                        "emp_code": g["emp_code"],
                        "date_of_leaving": g["date_of_leaving"],
                        "original_state": g["current_status"],
                        "new_state": g["target_status"]
                    }
                    for g in affected_list
                ]
            }
            # Crucial: Write and flush audit log BEFORE committing database transaction.
            # If writing fails, an exception is raised, caught by except, and conn.rollback() is called.
            audit_file = write_audit_log(audit_record)

            # Commit transaction only after audit trail is safely written
            conn.commit()

            logger.info(
                f"[LIVE] Successfully deactivated {rows_updated} field officer(s) with date_of_leaving <= {effective_date}."
            )
            return {
                "status": "success",
                "dry_run": False,
                "target_date": str(effective_date),
                "matched_count": count,
                "updated_count": rows_updated,
                "affected_employees": affected_list,
                "audit_file": audit_file,
                "sync_id": sync_id,
                "duration_ms": round(duration * 1000, 2),
                "message": f"Successfully deactivated {rows_updated} field officer(s)."
            }
        else:
            logger.info(f"[LIVE] All field officer records clean up to {effective_date}. No deactivations needed.")
            return {
                "status": "success",
                "dry_run": False,
                "target_date": str(effective_date),
                "matched_count": 0,
                "updated_count": 0,
                "affected_employees": [],
                "duration_ms": round(duration * 1000, 2),
                "message": "No active field officers found with date_of_leaving on or before target date."
            }

    except Exception as e:
        if conn and not dry_run:
            try:
                conn.rollback()
            except Exception:
                pass
        logger.error(f"Error during field officer deactivation execution: {e}", exc_info=True)
        raise
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if close_conn_on_exit and conn:
            try:
                conn.close()
            except Exception:
                pass

# Backwards compatibility alias
deactivate_left_guards = deactivate_field_officers

def rollback_deactivation(
    audit_source: Union[str, Dict[str, Any]],
    conn=None,
    db_config: Optional[Dict[str, Any]] = None,
    abort_on_conflict: bool = True
) -> Dict[str, Any]:
    """
    Safely rolls back an audited deactivation by restoring each employee's EXACT
    original status values (active, app_registered, patrol_app_registered).
    Does NOT blindly set fields to 1 or alter date_of_leaving.
    
    Safety:
    - Validates SHA-256 integrity checksum of audit file if present.
    - Inspects current DB state for each employee before updating:
      * Detects missing employees (records deleted since sync).
      * Detects status conflicts (records modified/reactivated since sync).
    - If abort_on_conflict is True and conflicts/missing employees exist, rolls back and aborts without modifying records.
    """
    import hashlib
    if isinstance(audit_source, str):
        if not os.path.isfile(audit_source):
            raise FileNotFoundError(f"Audit file not found: {audit_source}")
        with open(audit_source, "r", encoding="utf-8") as f:
            audit_data = json.load(f)
    elif isinstance(audit_source, dict):
        audit_data = audit_source
    else:
        raise ValueError("audit_source must be a file path string or dictionary")

    # Verify audit integrity checksum if present
    if "integrity_checksum" in audit_data:
        employees_repr = json.dumps(audit_data.get("employees", []), sort_keys=True)
        computed_hash = hashlib.sha256(employees_repr.encode("utf-8")).hexdigest()
        if audit_data["integrity_checksum"] != computed_hash:
            raise ValueError("Audit log integrity verification failed: Checksum mismatch! File has been altered.")

    employees = audit_data.get("employees", [])
    if not employees:
        return {"status": "noop", "restored_count": 0, "message": "No employees found in audit log."}

    close_conn_on_exit = False
    if conn is None:
        if db_config:
            import mysql.connector
            conn = mysql.connector.connect(**db_config)
        else:
            conn = get_db_connection()
        if not conn:
            raise RuntimeError("Could not establish database connection for rollback.")
        close_conn_on_exit = True

    conflicts = []
    missing_employees = []
    cursor = conn.cursor(dictionary=True)
    try:
        # Pre-check all employees for conflicts and missing records
        for emp in employees:
            oid = emp.get("oid")
            emp_code = emp.get("emp_code")
            expected_new = emp.get("new_state", {"active": 0, "app_registered": 0, "patrol_app_registered": 0})

            cursor.execute("SELECT oid, emp_code, active, app_registered, patrol_app_registered FROM EMPLOYEE WHERE oid = %s", (oid,))
            curr = cursor.fetchone()

            if not curr:
                missing_employees.append({
                    "oid": oid,
                    "emp_code": emp_code,
                    "reason": "EMPLOYEE_NOT_FOUND"
                })
                continue

            # Verify that current DB state matches expected deactivated state (active=0, app_reg=0, patrol_reg=0)
            if (curr["active"] != expected_new.get("active", 0) or
                curr["app_registered"] != expected_new.get("app_registered", 0) or
                curr["patrol_app_registered"] != expected_new.get("patrol_app_registered", 0)):
                conflicts.append({
                    "oid": oid,
                    "emp_code": emp_code,
                    "current_db_status": {
                        "active": curr["active"],
                        "app_registered": curr["app_registered"],
                        "patrol_app_registered": curr["patrol_app_registered"]
                    },
                    "expected_deactivated_status": expected_new,
                    "reason": "STATUS_MODIFIED_SINCE_SYNC"
                })

        if (conflicts or missing_employees) and abort_on_conflict:
            conn.rollback()
            logger.warning(
                f"Rollback aborted due to conflicts: {len(conflicts)} conflict(s), {len(missing_employees)} missing."
            )
            return {
                "status": "conflict_detected",
                "restored_count": 0,
                "conflicts": conflicts,
                "missing_employees": missing_employees,
                "message": f"Rollback aborted: Found {len(conflicts)} status conflict(s) and {len(missing_employees)} missing record(s). No changes made."
            }

        # Apply exact restoration
        restored = []
        restore_query = """
            UPDATE EMPLOYEE
            SET active = %s,
                app_registered = %s,
                patrol_app_registered = %s
            WHERE oid = %s
        """
        for emp in employees:
            oid = emp.get("oid")
            # If not aborting on conflict, skip conflicting or missing ones
            if any(c["oid"] == oid for c in conflicts) or any(m["oid"] == oid for m in missing_employees):
                continue

            orig = emp.get("original_state") or emp.get("previous_state") or {}
            orig_active = orig.get("active", 1)
            orig_app_reg = orig.get("app_registered", 0)
            orig_patrol_reg = orig.get("patrol_app_registered", 0)

            cursor.execute(restore_query, (orig_active, orig_app_reg, orig_patrol_reg, oid))
            restored.append({
                "oid": oid,
                "emp_code": emp.get("emp_code"),
                "restored_state": {
                    "active": orig_active,
                    "app_registered": orig_app_reg,
                    "patrol_app_registered": orig_patrol_reg
                }
            })

        conn.commit()
        logger.info(f"Rollback complete: Restored exact status for {len(restored)} employee(s).")
        return {
            "status": "success",
            "restored_count": len(restored),
            "restored_employees": restored,
            "conflicts_skipped": len(conflicts),
            "missing_skipped": len(missing_employees),
            "message": f"Successfully restored exact original status for {len(restored)} employee(s)."
        }
    except Exception as e:
        conn.rollback()
        logger.error(f"Error during deactivation rollback: {e}", exc_info=True)
        raise
    finally:
        cursor.close()
        if close_conn_on_exit and conn:
            conn.close()


def run_sync_with_lock(
    dry_run: Optional[bool] = None,
    target_date: Optional[date] = None,
    db_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Executes deactivation guarded by MySQL advisory lock.
    Ensures that only one worker runs the sync when multiple workers are online.
    """
    if dry_run is None:
        dry_run = FIELD_OFFICER_DEACTIVATION_SCHEDULER_DRY_RUN

    if db_config:
        import mysql.connector
        conn = mysql.connector.connect(**db_config)
    else:
        conn = get_db_connection()

    if not conn:
        raise RuntimeError("Could not connect to database for locked sync execution.")

    try:
        with acquire_advisory_lock(conn, ADVISORY_LOCK_NAME, timeout=0) as acquired:
            if not acquired:
                logger.info(f"Advisory lock '{ADVISORY_LOCK_NAME}' is currently held by another worker. Skipping run.")
                return {
                    "status": "skipped",
                    "reason": "lock_held",
                    "message": "Another worker/process is currently executing the sync job."
                }

            logger.info(f"Acquired advisory lock '{ADVISORY_LOCK_NAME}'. Executing deactivation sync (dry_run={dry_run})...")
            return deactivate_field_officers(conn=conn, dry_run=dry_run, target_date=target_date)
    finally:
        try:
            conn.close()
        except Exception:
            pass

async def scheduled_deactivation_worker(stop_event: asyncio.Event):
    """
    Background worker loop to run during FastAPI lifespan.
    Periodically checks if scheduler is enabled and executes with advisory lock.
    Shuts down gracefully when stop_event is set.
    """
    logger.info(
        f"Background deactivation worker registered. Enabled={ENABLE_FIELD_OFFICER_DEACTIVATION_SCHEDULER}, "
        f"Interval={FIELD_OFFICER_DEACTIVATION_SCHEDULER_INTERVAL_HOURS}h, DryRun={FIELD_OFFICER_DEACTIVATION_SCHEDULER_DRY_RUN}"
    )

    interval_seconds = max(60, int(FIELD_OFFICER_DEACTIVATION_SCHEDULER_INTERVAL_HOURS * 3600))

    while not stop_event.is_set():
        if ENABLE_FIELD_OFFICER_DEACTIVATION_SCHEDULER:
            try:
                logger.info("Scheduled trigger firing for field officer deactivation...")
                result = await asyncio.to_thread(
                    run_sync_with_lock,
                    dry_run=FIELD_OFFICER_DEACTIVATION_SCHEDULER_DRY_RUN
                )
                logger.info(f"Scheduled deactivation finished: status={result.get('status')}, matched={result.get('matched_count', 0)}")
            except Exception as e:
                logger.error(f"Unexpected error in background deactivation worker: {e}", exc_info=True)
        else:
            logger.debug("Scheduled deactivation worker is idle (ENABLE_FIELD_OFFICER_DEACTIVATION_SCHEDULER=False).")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            pass

    logger.info("Background deactivation worker has shut down cleanly.")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Field Officer Deactivation Service CLI")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Execute live update against the database. (Default is dry-run mode)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Simulate and print candidate employees without modifying records (default)."
    )
    parser.add_argument(
        "--target-date",
        type=str,
        default=None,
        help="Target date in YYYY-MM-DD format (default: today)."
    )
    parser.add_argument(
        "--rollback",
        type=str,
        default=None,
        help="Path to audit JSON file to execute safe exact status rollback."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force rollback of non-conflicting records even if status conflicts are detected."
    )
    parser.add_argument("--db-host", type=str, default=None, help="Database host override")
    parser.add_argument("--db-user", type=str, default=None, help="Database user override")
    parser.add_argument("--db-password", type=str, default=None, help="Database password override")
    parser.add_argument("--db-name", type=str, default=None, help="Database name override")
    parser.add_argument("--db-port", type=int, default=None, help="Database port override")

    args = parser.parse_args()

    db_override = None
    if args.db_host or args.db_name or args.db_user:
        db_override = {
            "host": args.db_host or "localhost",
            "user": args.db_user or "root",
            "password": args.db_password or "",
            "database": args.db_name or "qrda_test",
            "port": args.db_port or 3306
        }

    print("=" * 70)
    print("      AMA Attendance - Field Officer Deactivation Service (CLI)    ")

    if args.rollback:
        print(f"      Mode: EXACT STATUS ROLLBACK from {args.rollback}")
        if db_override:
            print(f"      Target DB: {db_override['database']} on {db_override['host']}")
        print("=" * 70)
        res = rollback_deactivation(args.rollback, db_config=db_override, abort_on_conflict=not args.force)
    else:
        is_live = args.live
        is_dry_run = not is_live

        parsed_date = None
        if args.target_date:
            parsed_date = datetime.strptime(args.target_date, "%Y-%m-%d").date()

        print(f"      Mode: {'LIVE UPDATE' if not is_dry_run else 'DRY RUN (Simulation)'}")
        if db_override:
            print(f"      Target DB: {db_override['database']} on {db_override['host']}")
        print("=" * 70)
        res = run_sync_with_lock(dry_run=is_dry_run, target_date=parsed_date, db_config=db_override)

    print("\nResult:")
    print(json.dumps(res, indent=2))
    print("=" * 70)
