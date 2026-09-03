from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from app.routes.officer_patrol import router as officer_router
from app.routes.attendance import router as attendance_router
from app.routes.gps import router as gps_router
from app.routes.patrol_routes import router as patrol_router
from app.routes.admin_routes import router as admin_router
from app.database import engine, Base
from app.models import patrol_models
import uvicorn

# Ensure database tables exist (Commented out to prevent automatic table creation)
# try:
#     Base.metadata.create_all(bind=engine)
# except Exception as e:
#     print(f"Warning creating tables on startup: {e}")

app = FastAPI(title="F.O. Pages API", description="Standalone backend for Field Officer ")

# Ensure uploads directory exists and mount static files
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes under prefix /api and root
app.include_router(officer_router, prefix="/api")
app.include_router(attendance_router, prefix="/api")
app.include_router(gps_router, prefix="/api")
app.include_router(patrol_router, prefix="/api")
app.include_router(admin_router, prefix="/api")

# Support root-level legacy endpoints
app.include_router(officer_router)
app.include_router(attendance_router)
app.include_router(gps_router)
app.include_router(patrol_router)
app.include_router(admin_router)


@app.on_event("startup")
def sync_missing_report_checkin_times():
    try:
        from app.database import get_db_connection
        conn = get_db_connection()
        if conn:
            c = conn.cursor()
            tables = [
                "FIELD_OFFICER_DAY_VISIT_REPORTS",
                "FIELD_OFFICER_NIGHT_VISIT_REPORTS",
                "FIELD_OFFICER_GENERAL_VISIT_REPORTS"
            ]
            for tbl in tables:
                sql = f"""
                    UPDATE {tbl} r
                    JOIN (
                        SELECT Employee, site_id, DATE(check_in_time) as s_date,
                               MIN(DATE_FORMAT(check_in_time, '%H:%i')) as session_check_in,
                               MAX(DATE_FORMAT(check_out_time, '%H:%i')) as session_check_out
                        FROM SITE_VISIT_SESSIONS
                        GROUP BY Employee, site_id, DATE(check_in_time)
                    ) svs ON (
                        (svs.Employee = r.employee_oid OR svs.Employee = (SELECT emp_code FROM EMPLOYEE WHERE oid = r.employee_oid LIMIT 1))
                        AND svs.site_id = r.site_id
                        AND svs.s_date = DATE(COALESCE(r.visit_date, r.created_on))
                    )
                    SET r.`check-in_time` = svs.session_check_in,
                        r.`check-out_time` = COALESCE(NULLIF(r.`check-out_time`, ''), svs.session_check_out)
                    WHERE r.`check-in_time` IS NULL OR r.`check-in_time` = '';
                """
                c.execute(sql)
            conn.commit()
            c.close()
            conn.close()
            print("Successfully backfilled missing report check-in times from SITE_VISIT_SESSIONS.")
    except Exception as e:
        print(f"Report check-in time backfill warning: {e}")

@app.get("/")
def read_root():
    return {"status": "success", "message": "F.O. Pages Backend API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
