-- ============================================================================
-- MIGRATION: 001_add_custom_visit_id_to_sessions_and_reports.sql
-- Description: Adds nullable custom_visit_id with ON DELETE RESTRICT foreign key
--              to SITE_VISIT_SESSIONS and all three visit report tables.
-- Target DB: MySQL 8.0+ (InnoDB)
-- ============================================================================

-- 1. SITE_VISIT_SESSIONS
ALTER TABLE `SITE_VISIT_SESSIONS`
    ADD COLUMN `custom_visit_id` BIGINT NULL DEFAULT NULL AFTER `site_name`,
    ADD CONSTRAINT `fk_svs_custom_visit`
        FOREIGN KEY (`custom_visit_id`)
        REFERENCES `FIELD_OFFICER_NEW_CLIENT_VISITS` (`oid`)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    ADD INDEX `idx_svs_custom_visit_id` (`custom_visit_id`);

-- 2. FIELD_OFFICER_DAY_VISIT_REPORTS
ALTER TABLE `FIELD_OFFICER_DAY_VISIT_REPORTS`
    ADD COLUMN `custom_visit_id` BIGINT NULL DEFAULT NULL AFTER `site_id`,
    ADD CONSTRAINT `fk_day_report_custom_visit`
        FOREIGN KEY (`custom_visit_id`)
        REFERENCES `FIELD_OFFICER_NEW_CLIENT_VISITS` (`oid`)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    ADD INDEX `idx_day_report_custom_visit_id` (`custom_visit_id`);

-- 3. FIELD_OFFICER_NIGHT_VISIT_REPORTS
ALTER TABLE `FIELD_OFFICER_NIGHT_VISIT_REPORTS`
    ADD COLUMN `custom_visit_id` BIGINT NULL DEFAULT NULL AFTER `site_id`,
    ADD CONSTRAINT `fk_night_report_custom_visit`
        FOREIGN KEY (`custom_visit_id`)
        REFERENCES `FIELD_OFFICER_NEW_CLIENT_VISITS` (`oid`)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    ADD INDEX `idx_night_report_custom_visit_id` (`custom_visit_id`);

-- 4. FIELD_OFFICER_GENERAL_VISIT_REPORTS
ALTER TABLE `FIELD_OFFICER_GENERAL_VISIT_REPORTS`
    ADD COLUMN `custom_visit_id` BIGINT NULL DEFAULT NULL AFTER `site_id`,
    ADD CONSTRAINT `fk_general_report_custom_visit`
        FOREIGN KEY (`custom_visit_id`)
        REFERENCES `FIELD_OFFICER_NEW_CLIENT_VISITS` (`oid`)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    ADD INDEX `idx_general_report_custom_visit_id` (`custom_visit_id`);
