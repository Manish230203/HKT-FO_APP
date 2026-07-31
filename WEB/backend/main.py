from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.officer_patrol import router as officer_router
from app.patrolling.routes import admin_routes
import uvicorn

app = FastAPI(title="F.O. Pages API", description="Standalone backend for Field Officer ")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for the standalone project
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes under prefix /api
app.include_router(officer_router, prefix="/api")
app.include_router(admin_routes.router, prefix="/api")

@app.get("/")
def read_root():
    return {"status": "success", "message": "F.O. Pages Backend API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
