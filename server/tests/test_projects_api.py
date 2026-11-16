"""Projects adapter error, agency, and routing behavior."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import requests
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("JWT_SECRET_KEY", "test-key-with-at-least-32-characters")
import app
from services import projects


class ProjectsApiTests(unittest.TestCase):
    def setUp(self):
        token = app.jwt.encode({"user_id": "user-1"}, app.SECRET_KEY, algorithm="HS256")
        self.headers = {"Authorization": f"Bearer {token}"}
        self.client = app.app.test_client()

    def test_detail_query_and_upstream_errors_are_preserved(self):
        for status in (200, 404, 409, 422, 503):
            payload = {"errorMessage": "Project API response"}
            with patch.object(projects, "call", return_value=(status, payload)) as upstream:
                response = self.client.get("/api/projects-service/projects/P001?orgId=DAL", headers=self.headers)
            self.assertEqual(response.status_code, status)
            self.assertEqual(response.json, payload)
            upstream.assert_called_once_with("GET", "/projects/P001", data=None, params={"orgId": "DAL"})

    def test_project_proxy_requires_local_session(self):
        with patch.object(projects, "call") as upstream:
            response = self.client.post("/api/projects-service/projects/create_project", json={})
            self.assertEqual(response.status_code, 401)
            upstream.assert_not_called()

    def test_transport_failure_and_invalid_json_return_service_errors(self):
        with patch.dict(os.environ, {"PROJECTS_API_BASE_URL": "https://projects.test"}):
            with patch.object(projects.requests, "request", side_effect=requests.Timeout()):
                self.assertEqual(self.client.post("/api/projects-service/projects/search_project", json={}, headers=self.headers).status_code, 503)
            invalid = Mock(status_code=502)
            invalid.json.side_effect = ValueError()
            with patch.object(projects.requests, "request", return_value=invalid):
                self.assertEqual(self.client.post("/api/projects-service/projects/search_project", json={}, headers=self.headers).status_code, 502)

    def test_missing_and_ambiguous_projects_do_not_allocate(self):
        for project_list, status in (([], 404), ([{}, {}], 409)):
            with patch.object(projects, "call", return_value=(200, {"projectList": project_list})), \
                    patch.object(app.hardware_db, "set_allocation") as allocate:
                response = self.client.post("/api/hardware/hw-1/allocations/P001", headers=self.headers,
                    json={"quantity": 1, "expected_version": 1, "reason": "Initial allocation"})
                self.assertEqual(response.status_code, status)
                allocate.assert_not_called()

    def test_project_list_forwards_upstream_search_results(self):
        payload = {"projectList": [
            {"projectId": "P001", "projectName": "Member project", "orgId": "AUS"},
            {"projectId": "P002", "projectName": "Other project", "orgId": "DAL"},
        ]}
        with patch.object(projects, "call", return_value=(200, payload)) as upstream:
            response = self.client.post(
                "/api/projects-service/projects/search_project",
                json={},
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, payload)
        upstream.assert_called_once_with(
            "POST", "/projects/search_project", data={}, params={}
        )
