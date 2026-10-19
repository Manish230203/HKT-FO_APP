import mysql.connector

def run_test():
    conn = mysql.connector.connect(host='localhost', user='root', password='root')
    cursor = conn.cursor()

    print("1. Creating test database `fo_dev_test`...")
    cursor.execute("DROP DATABASE IF EXISTS fo_dev_test")
    cursor.execute("CREATE DATABASE fo_dev_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    cursor.execute("USE fo_dev_test")

    print("2. Creating prerequisite tables...")
    cursor.execute("""
    CREATE TABLE `BRANCH` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `name` varchar(100) NOT NULL,
      `COMPANY` bigint DEFAULT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    cursor.execute("""
    CREATE TABLE `USER_ACCOUNT` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `user_id` varchar(100) NOT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    cursor.execute("""
    CREATE TABLE `EMPLOYEE` (
      `oid` bigint NOT NULL AUTO_INCREMENT,
      `emp_code` varchar(50) NOT NULL,
      `name` varchar(100) NOT NULL,
      `BRANCH` bigint DEFAULT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    cursor.execute("""
    CREATE TABLE `FIELD_OFFICER_ASSIGNED_VISITS` (
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

    cursor.execute("""
    CREATE TABLE `FIELD_OFFICER_NEW_CLIENT_VISITS` (
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

    cursor.execute("""
    CREATE TABLE `SITE_VISIT_SESSIONS` (
      `oid` int NOT NULL AUTO_INCREMENT,
      `Employee` int NOT NULL,
      `site_id` int DEFAULT NULL,
      `site_name` varchar(255) DEFAULT NULL,
      `check_in_time` datetime DEFAULT NULL,
      `check_out_time` datetime DEFAULT NULL,
      `duration_minutes` float DEFAULT NULL,
      `status` varchar(50) NOT NULL,
      `raw_points_count` int NOT NULL,
      `entry_latitude` float NOT NULL,
      `entry_longitude` float NOT NULL,
      `exit_latitude` float DEFAULT NULL,
      `exit_longitude` float DEFAULT NULL,
      `created_at` datetime DEFAULT NULL,
      PRIMARY KEY (`oid`),
      KEY `ix_SITE_VISIT_SESSIONS_site_id` (`site_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    cursor.execute("""
    CREATE TABLE `FIELD_OFFICER_DAY_VISIT_REPORTS` (
      `oid` varchar(100) NOT NULL,
      `employee_oid` bigint DEFAULT NULL,
      `report_id` varchar(255) DEFAULT NULL,
      `unit` varchar(255) DEFAULT NULL,
      `client_id` int DEFAULT NULL,
      `site_id` int DEFAULT NULL,
      `visit_date` varchar(50) DEFAULT NULL,
      `visit_type` varchar(50) DEFAULT NULL,
      `officer` varchar(255) DEFAULT NULL,
      `shift` varchar(50) DEFAULT NULL,
      `check-in_time` varchar(50) DEFAULT NULL,
      `check-out_time` varchar(50) DEFAULT NULL,
      `gps` varchar(100) DEFAULT NULL,
      `status` varchar(50) DEFAULT NULL,
      `created_on` varchar(100) DEFAULT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    cursor.execute("""
    CREATE TABLE `FIELD_OFFICER_NIGHT_VISIT_REPORTS` (
      `oid` varchar(100) NOT NULL,
      `employee_oid` bigint DEFAULT NULL,
      `report_id` varchar(255) DEFAULT NULL,
      `unit` varchar(255) DEFAULT NULL,
      `client_id` int DEFAULT NULL,
      `site_id` int DEFAULT NULL,
      `visit_date` varchar(50) DEFAULT NULL,
      `visit_type` varchar(50) DEFAULT NULL,
      `officer` varchar(255) DEFAULT NULL,
      `shift` varchar(50) DEFAULT NULL,
      `check-in_time` varchar(50) DEFAULT NULL,
      `check-out_time` varchar(50) DEFAULT NULL,
      `gps` varchar(100) DEFAULT NULL,
      `status` varchar(50) DEFAULT NULL,
      `created_on` varchar(100) DEFAULT NULL,
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    cursor.execute("""
    CREATE TABLE `FIELD_OFFICER_GENERAL_VISIT_REPORTS` (
      `oid` varchar(255) NOT NULL,
      `employee_oid` bigint DEFAULT NULL,
      `officer` varchar(255) DEFAULT NULL,
      `report_id` varchar(255) DEFAULT NULL,
      `client_id` int DEFAULT NULL,
      `client_name` varchar(255) DEFAULT NULL,
      `site_id` int DEFAULT NULL,
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
      PRIMARY KEY (`oid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
    """)

    print("3. Executing Migration Script...")
    with open('migrations/001_add_custom_visit_id_to_sessions_and_reports.sql', 'r') as f:
        migration_sql = f.read()

    for statement in migration_sql.split(';'):
        stmt = statement.strip()
        if stmt:
            cursor.execute(stmt)

    print("   Migration applied successfully!")

    print("4. Testing data insertion and ON DELETE RESTRICT behavior...")
    cursor.execute("INSERT INTO BRANCH (oid, name) VALUES (1, 'Pune')")
    cursor.execute("INSERT INTO EMPLOYEE (oid, emp_code, name, BRANCH) VALUES (10221, 'EMP01', 'Rajesh', 1)")
    cursor.execute("INSERT INTO FIELD_OFFICER_ASSIGNED_VISITS (oid, plan_code, planning_type, employee_oid, status) VALUES (66, 'VP-060', 'WEEKLY', 10221, 'PUBLISHED')")
    cursor.execute("INSERT INTO FIELD_OFFICER_NEW_CLIENT_VISITS (oid, plan_oid, branch_oid, client_name, site_name, address, latitude, longitude, visit_frequency) VALUES (4, 66, 1, 'Client ABC', 'Location XYZ', 'Pune', 18.5, 73.8, 2)")

    # Insert a custom visit session
    cursor.execute("INSERT INTO SITE_VISIT_SESSIONS (Employee, site_id, custom_visit_id, site_name, status, raw_points_count, entry_latitude, entry_longitude) VALUES (10221, NULL, 4, 'Location XYZ', 'IN_PROGRESS', 1, 18.5, 73.8)")
    
    # Try deleting the custom visit from FIELD_OFFICER_NEW_CLIENT_VISITS -> Should be BLOCKED by RESTRICT
    restrict_blocked = False
    try:
        cursor.execute("DELETE FROM FIELD_OFFICER_NEW_CLIENT_VISITS WHERE oid = 4")
    except mysql.connector.Error as err:
        if err.errno == 1451:
            restrict_blocked = True
            print("   PASS: Delete was blocked by ON DELETE RESTRICT (errno 1451):", err.msg)
        else:
            print("   Unexpected error:", err)

    assert restrict_blocked, "ERROR: ON DELETE RESTRICT did not block deletion!"

    # Clean up session, delete custom visit
    cursor.execute("DELETE FROM SITE_VISIT_SESSIONS WHERE custom_visit_id = 4")
    cursor.execute("DELETE FROM FIELD_OFFICER_NEW_CLIENT_VISITS WHERE oid = 4")
    print("   PASS: Deletion allowed after dependent session removed.")

    print("5. Testing Rollback Script...")
    with open('migrations/001_rollback_custom_visit_id_from_sessions_and_reports.sql', 'r') as f:
        rollback_sql = f.read()

    for statement in rollback_sql.split(';'):
        stmt = statement.strip()
        if stmt:
            cursor.execute(stmt)

    print("   Rollback applied successfully!")

    # Verify custom_visit_id column is gone
    cursor.execute("SHOW COLUMNS FROM SITE_VISIT_SESSIONS LIKE 'custom_visit_id'")
    assert cursor.fetchone() is None, "Column custom_visit_id still exists after rollback!"
    print("   PASS: Verified column is cleanly removed by rollback.")

    print("6. Re-applying migration so fo_dev_test is ready for tests...")
    for statement in migration_sql.split(';'):
        stmt = statement.strip()
        if stmt:
            cursor.execute(stmt)
    print("   Migration re-applied successfully!")

    cursor.close()
    conn.close()
    print("\nALL MIGRATION AND ROLLBACK TESTS PASSED!")

if __name__ == '__main__':
    run_test()
