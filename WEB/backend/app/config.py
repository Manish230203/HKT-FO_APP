import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

# Uploads & Face Matching Configuration
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
FACE_MATCH_THRESHOLD = 0.50

# Employee Deactivation Scheduler Configuration (Field Officer Deactivation Service)
ENABLE_FIELD_OFFICER_DEACTIVATION_SCHEDULER = (
    os.getenv("ENABLE_FIELD_OFFICER_DEACTIVATION_SCHEDULER")
    or os.getenv("ENABLE_LEFT_GUARDS_SCHEDULER", "false")
).lower() in ("true", "1", "yes")

FIELD_OFFICER_DEACTIVATION_SCHEDULER_INTERVAL_HOURS = float(
    os.getenv("FIELD_OFFICER_DEACTIVATION_SCHEDULER_INTERVAL_HOURS")
    or os.getenv("LEFT_GUARDS_SCHEDULER_INTERVAL_HOURS", "24")
)

FIELD_OFFICER_DEACTIVATION_SCHEDULER_DRY_RUN = (
    os.getenv("FIELD_OFFICER_DEACTIVATION_SCHEDULER_DRY_RUN")
    or os.getenv("LEFT_GUARDS_SCHEDULER_DRY_RUN", "true")
).lower() in ("true", "1", "yes")

# Backwards Compatibility Aliases
ENABLE_LEFT_GUARDS_SCHEDULER = ENABLE_FIELD_OFFICER_DEACTIVATION_SCHEDULER
LEFT_GUARDS_SCHEDULER_INTERVAL_HOURS = FIELD_OFFICER_DEACTIVATION_SCHEDULER_INTERVAL_HOURS
LEFT_GUARDS_SCHEDULER_DRY_RUN = FIELD_OFFICER_DEACTIVATION_SCHEDULER_DRY_RUN

