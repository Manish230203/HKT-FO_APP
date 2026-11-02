"""
Integration and Unit Test Suite for Dynamic Site Tour & Nested Checkpoint Checklist.
Validates all endpoints, request shapes, and response mappings against FastAPI app.
Does NOT write test data to production database.
"""

import os
import sys
import json
import unittest
from unittest.mock import MagicMock
from fastapi import HTTPException

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.routes.tour_routes import (
    get_tours_assigned_to_site,
    get_tours_assigned_to_custom_visit,
    get_tour_blueprint,
    start_tour_visit,
    verify_tour_checkpoint,
    submit_tour_checkpoint_responses,
    sync_offline_tour,
    complete_tour_visit,
    TourStartRequest,
    CheckpointVerifyRequest,
    QuestionResponseItem,
    CheckpointResponsesSubmitRequest,
    OfflineSyncPayload,
    TourCompleteRequest,
    haversine_distance_meters,
)


class TestDynamicTourAPI(unittest.TestCase):

    def setUp(self):
        self.mock_db = MagicMock()

    def test_haversine_distance_calculation(self):
        # Known distance between two points ~ 222 meters
        dist = haversine_distance_meters(18.6023, 73.8258, 18.6043, 73.8258)
        self.assertAlmostEqual(dist, 222.3, delta=5.0)

    def test_assigned_to_site_discovery(self):
        # Mock site query return
        exec_mock = MagicMock()
        exec_mock.fetchone.return_value = (15, "Test Industrial Park", 6)
        exec_mock.fetchall.return_value = [(101, "Site Patrolling Tour - Test", "VP-001", "Site Patrolling Tour", 30, 1, "DAILY")]
        exec_mock.scalar.return_value = 2
        self.mock_db.execute.return_value = exec_mock

        res = get_tours_assigned_to_site(site_id=15, db=self.mock_db, emp_oid=10208)
        self.assertTrue(res["success"])
        self.assertEqual(res["site_id"], 15)
        self.assertEqual(res["site_name"], "Test Industrial Park")
        self.assertIsInstance(res["tours"], list)
        self.assertGreater(len(res["tours"]), 0)
        first_tour = res["tours"][0]
        self.assertIn("tour_oid", first_tour)
        self.assertIn("title", first_tour)
        self.assertIn("total_checkpoints", first_tour)

    def test_assigned_to_custom_visit_discovery(self):
        exec_mock = MagicMock()
        exec_mock.fetchone.return_value = ("Client X", "Site Alpha", "Pune Road")
        self.mock_db.execute.return_value = exec_mock

        res = get_tours_assigned_to_custom_visit(custom_visit_id=25, db=self.mock_db, emp_oid=10208)
        self.assertTrue(res["success"])
        self.assertEqual(res["custom_visit_id"], 25)
        self.assertEqual(res["client_name"], "Client X")
        self.assertEqual(res["site_name"], "Site Alpha")
        self.assertGreater(len(res["tours"]), 0)

    def test_tour_blueprint_loading(self):
        exec_mock = MagicMock()
        # Mock tour checkpoint rows (9 columns)
        exec_mock.fetchall.side_effect = [
            [
                (1, "Main Gate Checkpoint", 1, "GPS_AND_QR", 18.6023, 73.8258, 100, "GATE-01", 1),
                (2, "Server Room Checkpoint", 2, "GPS_ONLY", 18.6025, 73.8260, 100, None, 1)
            ],
            # Questions for CP 1
            [
                (201, "Is security gate locked?", 1, "YES_NO", json.dumps(["Yes", "No"]), 1, 1, json.dumps(["No"]), 1, 1, 3, 1)
            ],
            # Questions for CP 2
            [
                (202, "Server room temperature ok?", 1, "SATISFACTORY_UNSATISFACTORY", json.dumps(["Satisfactory", "Unsatisfactory"]), 1, 0, json.dumps(["Unsatisfactory"]), 0, 0, 2, 0)
            ]
        ]
        self.mock_db.execute.return_value = exec_mock

        res = get_tour_blueprint(tour_oid=101, site_id=15, db=self.mock_db, emp_oid=10208)
        self.assertTrue(res["success"])
        blueprint = res["blueprint"]
        self.assertEqual(blueprint["oid"], 101)
        self.assertIn("checkpoints", blueprint)
        self.assertEqual(len(blueprint["checkpoints"]), 2)

        first_cp = blueprint["checkpoints"][0]
        self.assertEqual(first_cp["name"], "Main Gate Checkpoint")
        self.assertEqual(first_cp["verification_mode"], "GPS_AND_QR")
        self.assertIn("questions", first_cp)

        # Validate question structure
        first_q = first_cp["questions"][0]
        self.assertEqual(first_q["response_type"], "YES_NO")
        self.assertTrue(first_q["is_mandatory"])
        self.assertTrue(first_q["is_critical"])
        self.assertIn("failure_values", first_q)
        self.assertEqual(first_q["min_photos"], 1)
        self.assertIn("failure_values", first_q)
        self.assertIn("min_photos", first_q)

    def test_tour_start_idempotency_and_schema(self):
        payload = TourStartRequest(
            tour_oid=101,
            site_oid=15,
            execution_uuid="3b9a099a-0000-4000-8000-000000000001",
            start_latitude=18.5204,
            start_longitude=73.8567
        )

        # Simulate existing tour in FIELD_OFFICER_DAY_VISIT_REPORTS (Idempotency test)
        exec_mock = MagicMock()
        exec_mock.fetchone.return_value = (555, "ongoing")
        self.mock_db.execute.return_value = exec_mock

        res = start_tour_visit(data=payload, db=self.mock_db, emp_oid=10208)
        self.assertTrue(res["success"])
        self.assertEqual(res["tour_visit_oid"], 555)
        self.assertEqual(res["execution_uuid"], "3b9a099a-0000-4000-8000-000000000001")
        self.assertEqual(res["status"], "ongoing")

    def test_checkpoint_verification_gps_success_and_failure(self):
        exec_mock = MagicMock()
        exec_mock.fetchone.return_value = (1, "Front Gate", "GPS_ONLY", 18.6023, 73.8258, 100, None)
        self.mock_db.execute.return_value = exec_mock

        # 1. Close coordinates (within geofence of 18.6023, 73.8258)
        req_success = CheckpointVerifyRequest(
            checkpoint_oid=1,
            latitude=18.60235,
            longitude=73.82585,
            accuracy=10.0
        )
        res = verify_tour_checkpoint(tour_visit_oid=555, data=req_success, db=self.mock_db, emp_oid=10208)
        self.assertTrue(res["success"])
        self.assertTrue(res["verified"])
        self.assertTrue(res["gps_verified"])

        # 2. Coordinates > 500m away (must throw HTTP 400)
        req_far = CheckpointVerifyRequest(
            checkpoint_oid=1,
            latitude=18.6100, # ~900m away
            longitude=73.8258,
            accuracy=10.0
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_tour_checkpoint(tour_visit_oid=555, data=req_far, db=self.mock_db, emp_oid=10208)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("GPS verification failed", ctx.exception.detail)

    def test_checkpoint_responses_submission(self):
        exec_mock = MagicMock()
        exec_mock.fetchone.return_value = ("Test Question", "TEXT", 1, 0)
        self.mock_db.execute.return_value = exec_mock

        req = CheckpointResponsesSubmitRequest(
            checkpoint_oid=1,
            responses=[
                QuestionResponseItem(
                    question_oid=2001,
                    response_value="Satisfactory",
                    comment=None,
                    is_critical_violation=False,
                    is_failure=False,
                    photo_urls=["/uploads/tours/tour_1_2001_abc.jpg"]
                ),
                QuestionResponseItem(
                    question_oid=2002,
                    response_value="No",
                    comment="Register not signed by guard",
                    is_critical_violation=True,
                    is_failure=True,
                    photo_urls=[]
                )
            ],
            latitude=18.6023,
            longitude=73.8258
        )
        res = submit_tour_checkpoint_responses(tour_visit_oid=555, data=req, db=self.mock_db, emp_oid=10208)
        self.assertTrue(res["success"])
        self.assertEqual(res["checkpoint_oid"], 1)
        self.assertEqual(res["saved_count"], 2)

    def test_offline_sync_and_completion(self):
        exec_mock = MagicMock()
        exec_mock.fetchone.return_value = (555, "In Progress")
        exec_mock.scalar.return_value = "Test Officer"
        self.mock_db.execute.return_value = exec_mock

        sync_payload = OfflineSyncPayload(
            execution_uuid="sync-uuid-999",
            tour_oid=101,
            site_oid=15,
            checkpoints={"1": {"status": "completed"}}
        )
        sync_res = sync_offline_tour(payload=sync_payload, db=self.mock_db, emp_oid=10208)
        self.assertTrue(sync_res["success"])
        self.assertEqual(sync_res["execution_uuid"], "sync-uuid-999")

        complete_req = TourCompleteRequest(
            execution_uuid="sync-uuid-999",
            notes="All checkpoints completed successfully",
            end_latitude=18.6023,
            end_longitude=73.8258
        )
        comp_res = complete_tour_visit(tour_visit_oid=555, data=complete_req, db=self.mock_db, emp_oid=10208)
        self.assertTrue(comp_res["success"])
        self.assertEqual(comp_res["status"], "COMPLETED")
        self.assertTrue(comp_res["report_submitted"])


if __name__ == "__main__":
    unittest.main()
