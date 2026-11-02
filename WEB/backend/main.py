from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from app.routes.officer_patrol import router as officer_router
from app.routes.attendance import router as attendance_router
from app.routes.gps import router as gps_router
from app.routes.patrol_routes import router as patrol_router
from app.routes.admin_routes import router as admin_router
from app.routes.tour_routes import router as tour_router
from app.database import engine, Base
from app.models import patrol_models
import uvicorn

# Ensure database tables exist (Commented out to prevent automatic table creation)
# try:
#     Base.metadata.create_all(bind=engine)
# except Exception as e:
#     print(f"Warning creating tables on startup: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    try:
        from app.database import get_db_connection
        conn = get_db_connection()
        if conn:
            c = None
            try:
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
                print("Successfully backfilled missing report check-in times from SITE_VISIT_SESSIONS.")
            finally:
                if c:
                    try: c.close()
                    except Exception: pass
                try: conn.close()
                except Exception: pass
    except Exception as e:
        print(f"Report check-in time backfill warning: {e}")

    # Initialize Field Officer periodic deactivation scheduler worker
    import asyncio
    from app.services.employee_deactivation_service import scheduled_deactivation_worker
    
    stop_deactivation_event = asyncio.Event()
    deactivation_task = asyncio.create_task(scheduled_deactivation_worker(stop_deactivation_event))

    try:
        yield
    finally:
        # Graceful shutdown of deactivation worker
        stop_deactivation_event.set()
        try:
            await asyncio.wait_for(deactivation_task, timeout=5)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            deactivation_task.cancel()

app = FastAPI(title="F.O. Pages API", description="Standalone backend for Field Officer", lifespan=lifespan)

@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request, exc: HTTPException):
    msg = exc.detail if isinstance(exc.detail, str) else (exc.detail.get("message") if isinstance(exc.detail, dict) else str(exc.detail))
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": msg,
            "detail": exc.detail
        },
        headers=exc.headers
    )

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
app.include_router(tour_router, prefix="/api")

# Support root-level legacy endpoints
app.include_router(officer_router)
app.include_router(attendance_router)
app.include_router(gps_router)
app.include_router(patrol_router)
app.include_router(admin_router)
app.include_router(tour_router)


@app.get("/")
def read_root():
    return {"status": "success", "message": "F.O. Pages Backend API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
