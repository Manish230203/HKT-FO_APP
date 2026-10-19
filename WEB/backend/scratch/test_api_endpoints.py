from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("1. Testing GET /api/mobile/patrol/tours?empOid=113&site_id=192")
r1 = client.get("/api/mobile/patrol/tours?empOid=113&site_id=192")
print("Status:", r1.status_code)
print("Data:", r1.json())

print("\n2. Testing GET /api/mobile/patrol/tour/checkpoints?tour_name=Parking&empOid=113&site_id=192")
r2 = client.get("/api/mobile/patrol/tour/checkpoints?tour_name=Parking&empOid=113&site_id=192")
print("Status:", r2.status_code)
print("Data:", r2.json())

print("\n3. Testing GET /api/mobile/patrol/guards?site_id=192&empOid=113")
r3 = client.get("/api/mobile/patrol/guards?site_id=192&empOid=113")
print("Status:", r3.status_code)
print("Data sample:", r3.json()[:2] if isinstance(r3.json(), list) else r3.json())

print("\n4. Testing GET /api/mobile/patrol/checkpoint/88/checklist?empOid=113")
r4 = client.get("/api/mobile/patrol/checkpoint/88/checklist?empOid=113")
print("Status:", r4.status_code)
print("Data:", r4.json())
