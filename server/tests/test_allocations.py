"""Flask-to-gRPC allocation contract, isolated from live data."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
import hardwareDatabase as hardware_db
from hardware import hardware_pb2 as messages
from hardware.client import HardwareServiceError
from projects import projects_pb2 as project_messages
from auth_support import authenticate
from projects_support import start_projects


class AllocationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()
        self.headers = authenticate(self, agency="DAL")
        self.projects = start_projects(self, [project_messages.Project(
            org_id="DAL", project_id="project-1", project_name="Project",
        )])
        self.body = {"expected_version": 3, "reason": "Initial allocation", "quantity": 10, "orgId": "DAL"}
        self.path = "/api/hardware/hw-1/allocations/project-1"

    def test_list_forwards_filters_and_pagination(self):
        result = messages.ListAllocationsResponse(items=[messages.Allocation(
            hardware_id="hw-1", project_id="project-1", quantity=10, out=5, version=2,
        )], total=11, page=2, size=10)
        with patch.object(hardware_db.hardware_grpc, "call", return_value=result) as upstream:
            response = self.client.post("/api/listAllocations", headers=self.headers,
                json={"projectId": "project-1", "page": 2, "size": 10})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["items"][0]["out"], 5)
        upstream.assert_called_once_with("ListAllocations", messages.ListAllocationsRequest(
            project_id="project-1", page=2, size=10))

    def test_allocate_validates_remote_project_and_uses_inventory_version(self):
        with patch.object(hardware_db.hardware_grpc, "call", return_value=messages.Hardware(version=4)) as upstream:
            response = self.client.post(self.path, json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.projects.calls[0][1].org_id, "DAL")
        upstream.assert_called_once_with("AllocateHardware", messages.AllocateHardwareRequest(
            hardware_id="hw-1", project_id="project-1", expected_version=3,
            quantity=10, reason="Initial allocation"))

    def test_conflicts_and_unavailable_are_preserved(self):
        for status in (409, 503):
            with patch.object(hardware_db.hardware_grpc, "call", side_effect=HardwareServiceError("Upstream failed", status)):
                response = self.client.post(self.path, json=self.body, headers=self.headers)
            self.assertEqual(response.status_code, status)
            self.assertEqual(response.json, {"error": "Upstream failed"})

    def test_invalid_input_and_missing_project_never_allocate(self):
        for invalid in ({"quantity": -1}, {"quantity": 1.5}, {"quantity": True},
                        {"expected_version": 0}, {"reason": ""}):
            with patch.object(hardware_db.hardware_grpc, "call") as upstream:
                response = self.client.post(self.path, json={**self.body, **invalid}, headers=self.headers)
                self.assertEqual(response.status_code, 400)
                upstream.assert_not_called()
        self.projects.records.clear()
        with patch.object(hardware_db.hardware_grpc, "call") as upstream:
            self.assertEqual(self.client.post(self.path, json=self.body, headers=self.headers).status_code, 404)
            upstream.assert_not_called()

    def test_routes_require_authentication(self):
        self.assertEqual(self.client.post("/api/listAllocations", json={}).status_code, 401)
        self.assertEqual(self.client.post(self.path, json=self.body).status_code, 401)
