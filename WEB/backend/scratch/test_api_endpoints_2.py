from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("\n--- Testing Checkpoint Verification ---")
# 1. Test invalid QR code
r_bad = client.post("/api/mobile/patrol/checkpoint/verify?empOid=113", json={
    "qr_code": "WRONG_QR_123",
    "checkpoint_id": 88,
    "tour_name": "Parking",
    "latitude": 18.4526,
    "longitude": 73.8485
})
print("Bad QR status:", r_bad.status_code, r_bad.json().get("detail"))

# 2. Test valid QR code
r_good = client.post("/api/mobile/patrol/checkpoint/verify?empOid=113", json={
    "qr_code": "CP-192-1791964335632",
    "checkpoint_id": 88,
    "tour_name": "Parking",
    "latitude": 18.4526,
    "longitude": 73.8485
})
print("Good QR status:", r_good.status_code)
print("Good QR response:", r_good.json())

# 3. Test submitting checklist answers
r_submit = client.post("/api/mobile/patrol/checkpoint/88/submit-checklist?empOid=113", json={
    "tour_name": "Parking",
    "latitude": 18.4526,
    "longitude": 73.8485,
    "site_id": 192,
    "answers": [
        {
            "link_id": 354,
            "question_id": 1,
            "answer_value": "Yes",
            "comment": "Registers checked and verified"
        },
        {
            "link_id": 355,
            "question_id": 4,
            "answer_value": "Yes",
            "comment": "Temp normal"
        }
    ]
})
print("\nSubmit checklist status:", r_submit.status_code)
print("Submit checklist response:", r_submit.json())

# 4. Now verify that Checkpoint 1 is COMPLETED and Checkpoint 2 is UNLOCKED
r_unlocked = client.get("/api/mobile/patrol/tour/checkpoints?tour_name=Parking&empOid=113&site_id=192")
print("\nAfter submission checkpoints state:")
for cp in r_unlocked.json()["checkpoints"]:
    print(f"   CP {cp['order']} ({cp['name']}): status={cp['status']}, is_active={cp['is_active']}, is_completed={cp['is_completed']}, is_locked={cp['is_locked']}")
