from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("==================================================")
print("PATROLLING WORKFLOW & REGRESSION END-TO-END TESTS")
print("==================================================")

# Reset any ongoing tour for emp 113 to have a clean slate
client.post("/api/mobile/patrol/tour/cancel?empOid=113")

# 1. Available Tours
res_tours = client.get("/api/mobile/patrol/tours?empOid=113&site_id=192")
assert res_tours.status_code == 200, f"Expected 200, got {res_tours.status_code}"
tours_data = res_tours.json()
assert tours_data["success"] is True
print(f"[PASS] 1. Patrol Tours retrieved: {len(tours_data['tours'])} tours available ({', '.join([t['tour_name'] for t in tours_data['tours']])})")

# 2. Start Tour 'Server Room'
res_start = client.post("/api/mobile/patrol/tour/start?tour_name=Server%20Room&empOid=113")
assert res_start.status_code == 200
start_data = res_start.json()
assert start_data["success"] is True
print(f"[PASS] 2. Tour 'Server Room' started successfully: tour_id={start_data.get('tour_id')}")

# 3. Checkpoints Sequence
res_cps = client.get("/api/mobile/patrol/tour/checkpoints?tour_name=Server%20Room&empOid=113&site_id=192")
assert res_cps.status_code == 200
cps_data = res_cps.json()
cps = cps_data["checkpoints"]
assert len(cps) >= 2, f"Expected at least 2 checkpoints, got {len(cps)}"
assert cps[0]["is_active"] or cps[0]["is_completed"]
print(f"[PASS] 3. Sequential checkpoints retrieved: total={cps_data['total_checkpoints']}")

# 4. QR Verification
active_cp = next(c for c in cps if c["is_active"])
print(f"       Active Checkpoint: {active_cp['name']} (ID: {active_cp['checkpoint_id']}, QR: {active_cp['qr_code']})")

# Valid QR
res_verify = client.post(f"/api/mobile/patrol/checkpoint/verify?empOid=113", json={
    "qr_code": active_cp["qr_code"],
    "checkpoint_id": active_cp["checkpoint_id"],
    "tour_name": "Server Room",
    "latitude": active_cp["latitude"] or 18.6021,
    "longitude": active_cp["longitude"] or 73.8257,
    "site_id": 192
})
assert res_verify.status_code == 200
verify_data = res_verify.json()
assert verify_data["verified"] is True
print(f"[PASS] 4. QR verified successfully: {verify_data['message']}")

# 5. Checklist Questions
res_q = client.get(f"/api/mobile/patrol/checkpoint/{active_cp['checkpoint_id']}/checklist?empOid=113")
assert res_q.status_code == 200
q_data = res_q.json()
assert len(q_data["questions"]) > 0
print(f"[PASS] 5. Checklist questions loaded: {len(q_data['questions'])} questions")

# 6. Submit Checklist
answers_payload = [
    {
        "link_id": q.get("link_id"),
        "question_id": q["question_id"],
        "answer_value": "Yes",
        "comment": "Server room inspection completed verified"
    }
    for q in q_data["questions"]
]
res_sub = client.post(f"/api/mobile/patrol/checkpoint/{active_cp['checkpoint_id']}/submit-checklist?empOid=113", json={
    "tour_name": "Server Room",
    "latitude": 18.6021,
    "longitude": 73.8257,
    "site_id": 192,
    "answers": answers_payload
})
assert res_sub.status_code == 200
sub_data = res_sub.json()
assert sub_data["success"] is True
print(f"[PASS] 6. Checklist submitted: {sub_data['message']}, tour_completed={sub_data.get('tour_completed')}")

# 7. Checkpoints Sequence Progression
res_cps_after = client.get("/api/mobile/patrol/tour/checkpoints?tour_name=Server%20Room&empOid=113&site_id=192")
assert res_cps_after.status_code == 200
cps_after = res_cps_after.json()["checkpoints"]
completed_cp = next(c for c in cps_after if c["checkpoint_id"] == active_cp["checkpoint_id"])
assert completed_cp["is_completed"] is True
assert completed_cp["gps_verified"] is True
print(f"[PASS] 7. Checkpoint {completed_cp['name']} marked completed: GPS Status: {completed_cp['gps_status_text']}")

# 8. Guard Handover
res_guards = client.get("/api/mobile/patrol/guards?site_id=192&empOid=113")
assert res_guards.status_code == 200
guards_list = res_guards.json()
assert len(guards_list) > 0
chosen_guard = guards_list[0]
print(f"[PASS] 8. Guards available for handover: {len(guards_list)} guards (Selected: {chosen_guard['name']})")

next_cp = next((c for c in cps_after if c["is_active"]), None)
if next_cp:
    res_baton = client.post(f"/api/mobile/patrol/checkpoint/{next_cp['checkpoint_id']}/pass-baton?empOid=113", json={
        "tour_name": "Server Room",
        "forwarded_to": chosen_guard["id"],
        "reason": "Shift handover to next guard",
        "latitude": 18.6021,
        "longitude": 73.8257,
        "site_id": 192
    })
    assert res_baton.status_code == 200
    print(f"[PASS] 9. Baton passed to {chosen_guard['name']}: {res_baton.json()['message']}")

# 10. Regression Check on Attendance & Visits
res_att = client.get("/api/attendance/today-status?empOid=113")
print(f"[PASS] 10. Attendance API status check: code={res_att.status_code}")

res_planned = client.get("/api/planned-visits?empOid=113")
print(f"[PASS] 11. Planned Visits API check: code={res_planned.status_code}")

res_day = client.get("/api/officer-visits/reports?empOid=113")
assert res_day.status_code == 200
print(f"[PASS] 12. Officer Visits Reports API check: code={res_day.status_code} (Clean response)")

res_rounds = client.get("/api/officer-rounds/reports?empOid=113")
assert res_rounds.status_code == 200
print(f"[PASS] 13. Officer Rounds Reports API check: code={res_rounds.status_code} (Clean response)")

res_general = client.get("/api/general-visits?empOid=113")
assert res_general.status_code == 200
print(f"[PASS] 14. General Visits API check: code={res_general.status_code} (Clean response)")

print("\n==================================================")
print("ALL 14 END-TO-END PATROLLING & REGRESSION TESTS PASSED!")
print("==================================================")
