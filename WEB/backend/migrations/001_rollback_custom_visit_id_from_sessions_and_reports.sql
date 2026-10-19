-- ============================================================================
-- ROLLBACK: 001_rollback_custom_visit_id_from_sessions_and_reports.sql
-- Description: Drops foreign key constraints, indexes, and custom_visit_id column
--              from SITE_VISIT_SESSIONS and all three visit report tables.
-- Target DB: MySQL 8.0+ (InnoDB)
-- ============================================================================

-- 1. SITE_VISIT_SESSIONS
ALTER TABLE `SITE_VISIT_SESSIONS`
    DROP FOREIGN KEY `fk_svs_custom_visit`,
    DROP INDEX `idx_svs_custom_visit_id`,
    DROP COLUMN `custom_visit_id`;

-- 2. FIELD_OFFICER_DAY_VISIT_REPORTS
ALTER TABLE `FIELD_OFFICER_DAY_VISIT_REPORTS`
    DROP FOREIGN KEY `fk_day_report_custom_visit`,
    DROP INDEX `idx_day_report_custom_visit_id`,
    DROP COLUMN `custom_visit_id`;

-- 3. FIELD_OFFICER_NIGHT_VISIT_REPORTS
ALTER TABLE `FIELD_OFFICER_NIGHT_VISIT_REPORTS`
    DROP FOREIGN KEY `fk_night_report_custom_visit`,
    DROP INDEX `idx_night_report_custom_visit_id`,
    DROP COLUMN `custom_visit_id`;

-- 4. FIELD_OFFICER_GENERAL_VISIT_REPORTS
ALTER TABLE `FIELD_OFFICER_GENERAL_VISIT_REPORTS`
    DROP FOREIGN KEY `fk_general_report_custom_visit`,
    DROP INDEX `idx_general_report_custom_visit_id`,
    DROP COLUMN `custom_visit_id`;
