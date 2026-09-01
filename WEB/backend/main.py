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

# Ensure database tables exist
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Warning creating tables on startup: {e}")

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
app.include_router(attendance_router)
app.include_router(gps_router)
app.include_router(patrol_router)


@app.get("/")
def read_root():
    return {"status": "success", "message": "F.O. Pages Backend API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
