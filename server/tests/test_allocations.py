"""Allocation integration contracts; upstream calls are isolated from live writes."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("JWT_SECRET_KEY", "allocation-test-key")

import app
import hardwareDatabase as hardware_db


class AllocationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()
        token = app.jwt.encode({"user_id": "user-1"}, app.SECRET_KEY, algorithm="HS256")
        self.headers = {"Authorization": f"Bearer {token}"}
        self.body = {"expected_version": 3, "reason": "Initial project allocation", "quantity": 10}

    def test_filtered_allocations_preserve_pagination_and_project_quantities(self):
        payload = {"items": [{"hardware_id": "hw-1", "project_id": "Test-Project",
                              "quantity": 10, "out": 5, "version": 2}],
                   "total": 1, "page": 2, "size": 10}
        with patch.object(hardware_db, "_request", return_value=(200, payload)) as upstream:
            response = self.client.get("/api/allocations?project_id=Test-Project&page=2&size=10", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), payload)
        self.assertEqual(upstream.call_args.args, ("GET", "/allocations"))
        self.assertEqual(dict(upstream.call_args.kwargs["params"]),
                         {"project_id": "Test-Project", "page": "2", "size": "10"})

    def test_allocation_put_forwards_hardware_version_and_quantity(self):
        with patch.object(app.projects_db, "queryProject", return_value={"projectId": "Test-Project"}), \
                patch.object(hardware_db, "_request", return_value=(200, {"version": 4})) as upstream:
            response = self.client.put("/api/hardware/hw-1/allocations/Test-Project", json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        upstream.assert_called_once_with("PUT", "/hardware/hw-1/allocations/Test-Project", json=self.body)

    def test_version_conflict_is_preserved_for_retry(self):
        with patch.object(app.projects_db, "queryProject", return_value={"projectId": "Test-Project"}), \
                patch.object(hardware_db, "_request", return_value=(409, {"detail": "Stale version"})):
            response = self.client.put("/api/hardware/hw-1/allocations/Test-Project", json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json(), {"detail": "Stale version"})

    def test_allocation_service_timeout_returns_503(self):
        with patch.object(hardware_db, "_request",
                          side_effect=RuntimeError("Hardware service is unreachable: read timed out")):
            response = self.client.get("/api/allocations", headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json(),
                         {"error": "Hardware service is unreachable: read timed out"})

    def test_invalid_allocations_never_reach_upstream(self):
        for invalid in ({"quantity": -1}, {"quantity": 1.5}, {"quantity": True},
                        {"expected_version": 0}, {"reason": ""}):
            with self.subTest(invalid=invalid), patch.object(hardware_db, "_request") as upstream:
                response = self.client.put("/api/hardware/hw-1/allocations/Test-Project",
                                           json={**self.body, **invalid}, headers=self.headers)
                self.assertEqual(response.status_code, 400)
                upstream.assert_not_called()

    def test_allocations_require_authentication(self):
        self.assertEqual(self.client.get("/api/allocations?project_id=Test-Project").status_code, 401)
        self.assertEqual(self.client.put("/api/hardware/hw-1/allocations/Test-Project", json=self.body).status_code, 401)

    def test_missing_project_does_not_allocate(self):
        with patch.object(app.projects_db, "queryProject", return_value=None), \
                patch.object(hardware_db, "_request") as upstream:
            response = self.client.put("/api/hardware/hw-1/allocations/Test-Project", json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 404)
        upstream.assert_not_called()

    def test_checkin_uses_upstream_records_without_local_usage(self):
        records = {"items": [{"_id": "checkout-1", "quantity": 5, "returned": 0, "version": 2}]}
        with patch.object(app.projects_db, "queryProject", return_value={"hwSets": {}}), \
                patch.object(hardware_db, "_request", side_effect=[(200, records), (200, {})]) as upstream:
            response = self.client.post("/api/hardware/checkin", headers=self.headers,
                                        json={"name": "Monitor", "hardwareId": "hw-1", "projectId": "Test-Project", "quantity": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(upstream.call_args_list[0].kwargs["params"]["hardware_id"], "hw-1")
        self.assertEqual(upstream.call_args.kwargs["json"],
                         {"expected_version": 2, "reason": "Project Test-Project check-in", "quantity": 2})


if __name__ == "__main__":
    unittest.main()
