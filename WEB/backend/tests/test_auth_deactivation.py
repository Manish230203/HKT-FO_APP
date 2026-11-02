"""
Automated Test Suite for Single Device Registration and Auth Deactivation
Validates that:
1. Deactivated employees (active=0) receive HTTP 403 Forbidden on /auth/login.
2. Already registered employees (app_registered=1) receive HTTP 403 Forbidden on /auth/login with Single Device Registration message.
3. First-time logging employees (active=1, app_registered=0) receive HTTP 200 OK and database updates app_registered to 1.
4. Active tokens for deactivated employees receive HTTP 401 Unauthorized on /auth/me.
5. Active tokens whose registration was reset by admin (app_registered=0) receive HTTP 401 Unauthorized on /auth/me.
"""

import os
import sys
import unittest
import base64
import json
from unittest.mock import MagicMock
from fastapi import HTTPException

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.routes.admin_routes import admin_login, get_current_admin

class TestAuthDeactivation(unittest.TestCase):
    def test_login_rejected_for_deactivated_employee(self):
        """Active=0 must raise HTTP 403 Forbidden."""
        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.first.return_value = {
            "oid": 8801,
            "emp_code": "INACT01",
            "name": "Inactive Field Officer",
            "active": 0,
            "app_registered": 0,
            "patrol_app_registered": 0,
            "role_name": "Field Officer"
        }
        mock_db.execute.return_value = mock_result

        with self.assertRaises(HTTPException) as ctx:
            admin_login(data={"identifier": "INACT01", "password": "password123"}, db=mock_db)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertTrue("inactive" in ctx.exception.detail.lower() or "deactivated" in ctx.exception.detail.lower())

    def test_login_rejected_for_already_registered_device(self):
        """app_registered=1 must raise HTTP 403 Forbidden with Single Device Registration message."""
        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.first.return_value = {
            "oid": 8802,
            "emp_code": "REG01",
            "name": "Already Registered Officer",
            "active": 1,
            "app_registered": 1,
            "patrol_app_registered": 1,
            "role_name": "Field Officer"
        }
        mock_db.execute.return_value = mock_result

        with self.assertRaises(HTTPException) as ctx:
            admin_login(data={"identifier": "REG01", "password": "password123"}, db=mock_db)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("already been registered on a device", ctx.exception.detail)

    def test_login_allowed_for_first_time_unregistered_employee(self):
        """active=1 and app_registered=0 must update app_registered=1 in DB and return 200 OK with token."""
        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.first.return_value = {
            "oid": 8803,
            "emp_code": "ACT01",
            "name": "First Time Field Officer",
            "active": 1,
            "app_registered": 0,
            "patrol_app_registered": 0,
            "role_name": "Field Officer",
            "site_id": 10,
            "date_of_joining": "2020-01-01"
        }
        mock_db.execute.return_value = mock_result

        res = admin_login(data={"identifier": "ACT01", "password": "password123"}, db=mock_db)
        self.assertTrue(res.get("success"))
        self.assertIn("access_token", res)
        self.assertEqual(res["user"]["employee_id"], "ACT01")

        # Verify that an UPDATE was executed to set app_registered = 1
        executed_sqls = [getattr(call[0][0], "text", str(call[0][0])) for call in mock_db.execute.call_args_list if call[0]]
        has_update_call = any("app_registered = 1" in s for s in executed_sqls)
        self.assertTrue(has_update_call, f"Must update app_registered = 1 in database on first login. Executed: {executed_sqls}")
        mock_db.commit.assert_called()

    def test_auth_me_invalidates_deactivated_employee_session(self):
        """A valid bearer token must be rejected with 401 if employee became active=0."""
        user_payload = {
            "id": 8804,
            "name": "Left Officer",
            "role": "Field Officer",
            "employee_id": "LEFT01"
        }
        token = base64.b64encode(json.dumps(user_payload).encode()).decode()
        auth_header = f"Bearer {token}"

        mock_db = MagicMock()
        mock_result = MagicMock()
        # DB returns employee with active=0
        mock_result.mappings.return_value.first.return_value = {
            "oid": 8804,
            "emp_code": "LEFT01",
            "name": "Left Officer",
            "active": 0,
            "app_registered": 0,
            "patrol_app_registered": 0,
            "role_name": "Field Officer"
        }
        mock_db.execute.return_value = mock_result

        with self.assertRaises(HTTPException) as ctx:
            get_current_admin(authorization=auth_header, db=mock_db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("invalidated", ctx.exception.detail.lower())

    def test_auth_me_invalidates_session_when_admin_resets_registration(self):
        """A valid bearer token must be rejected with 401 if admin manually reset app_registered=0."""
        user_payload = {
            "id": 8805,
            "name": "Reset Officer",
            "role": "Field Officer",
            "employee_id": "RESET01"
        }
        token = base64.b64encode(json.dumps(user_payload).encode()).decode()
        auth_header = f"Bearer {token}"

        mock_db = MagicMock()
        mock_result = MagicMock()
        # DB returns employee with app_registered=0 (admin reset device)
        mock_result.mappings.return_value.first.return_value = {
            "oid": 8805,
            "emp_code": "RESET01",
            "name": "Reset Officer",
            "active": 1,
            "app_registered": 0,
            "patrol_app_registered": 0,
            "role_name": "Field Officer"
        }
        mock_db.execute.return_value = mock_result

        with self.assertRaises(HTTPException) as ctx:
            get_current_admin(authorization=auth_header, db=mock_db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("reset", ctx.exception.detail.lower())

    def test_require_admin_user_accepts_admin_role(self):
        """Administrator role passes authorization."""
        from app.routes.admin_routes import require_admin_user
        user_payload = {"id": 1, "name": "Admin", "role": "Admin", "employee_id": "ADM01"}
        token = base64.b64encode(json.dumps(user_payload).encode()).decode()
        auth_header = f"Bearer {token}"

        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.first.return_value = {
            "oid": 1, "emp_code": "ADM01", "name": "Admin", "active": 1, "app_registered": 1, "patrol_app_registered": 1, "role_name": "Admin"
        }
        mock_db.execute.return_value = mock_result

        admin_user = require_admin_user(authorization=auth_header, db=mock_db)
        self.assertEqual(admin_user["employee_id"], "ADM01")

    def test_require_admin_user_rejects_non_admin_role(self):
        """Field Officer / Staff role raises HTTP 403 Forbidden on admin endpoint."""
        from app.routes.admin_routes import require_admin_user
        user_payload = {"id": 2, "name": "Field Officer Bob", "role": "Field Officer", "employee_id": "FO02"}
        token = base64.b64encode(json.dumps(user_payload).encode()).decode()
        auth_header = f"Bearer {token}"

        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.mappings.return_value.first.return_value = {
            "oid": 2, "emp_code": "FO02", "name": "Field Officer Bob", "active": 1, "app_registered": 1, "patrol_app_registered": 1, "role_name": "Field Officer"
        }
        mock_db.execute.return_value = mock_result

        with self.assertRaises(HTTPException) as ctx:
            require_admin_user(authorization=auth_header, db=mock_db)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("administrator", ctx.exception.detail.lower())

if __name__ == "__main__":
    unittest.main(verbosity=2)
