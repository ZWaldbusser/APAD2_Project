"""Current Projects gRPC adapter, snapshot fallback and authentication boundaries."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import grpc

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from gateway.routes import hardware as hardware_routes
from projects import client as projects
from services import hardware
from support import isolate_routes
from users.client import UsersServiceError


class ProjectsApiTests(unittest.TestCase):
    def setUp(self):
        isolate_routes(self)
        self.client = app.app.test_client()

    def test_detail_passes_agency_and_saves_then_serves_snapshot(self):
        result = projects.messages.GetProjectResponse(project_info=projects.messages.Project(
            org_id="DAL", project_id="P001", project_name="Saved project"))
        path = "/api/projects-service/projects/P001?orgId=DAL"
        with patch.object(projects, "call", return_value=result) as upstream:
            response = self.client.get(path, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json["meta"]["stale"])
        upstream.assert_called_once_with("GetProject", projects.messages.GetProjectRequest(
            project_id="P001", org_id="DAL"))
        with patch.object(projects, "call", side_effect=projects.ProjectsServiceError("Down")):
            response = self.client.get(path, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["meta"]["stale"])
        self.assertEqual(response.json["projectInfo"]["projectName"], "Saved project")

    def test_upstream_errors_without_snapshots_are_preserved(self):
        for status in (400, 401, 403, 404, 409, 422, 503):
            with patch.object(projects, "call", side_effect=projects.ProjectsServiceError("Failed", status)):
                response = self.client.get("/api/projects-service/projects/P001?orgId=DAL", headers=self.headers)
            self.assertEqual(response.status_code, status)
            self.assertEqual(response.json, {"error": "Failed"})

    def test_project_proxy_requires_service_session(self):
        with patch.object(projects, "call") as upstream:
            response = self.client.post("/api/projects-service/projects/create_project", json={})
        self.assertEqual(response.status_code, 401)
        upstream.assert_not_called()

    def test_users_outage_blocks_protected_snapshot_reads(self):
        payload = projects.messages.SearchProjectsResponse(project_list=[
            projects.messages.ProjectSummary(project_id="P001", project_name="Saved", org_id="DAL")])
        path = "/api/projects-service/projects/search_project"
        with patch.object(projects, "call", return_value=payload):
            self.assertEqual(self.client.post(path, json={}, headers=self.headers).status_code, 200)
        self.auth.side_effect = UsersServiceError("Users unavailable", 503)
        with patch.object(projects, "call") as upstream:
            response = self.client.post(path, json={}, headers=self.headers)
        self.assertEqual(response.status_code, 503)
        upstream.assert_not_called()

    def test_missing_and_ambiguous_projects_do_not_allocate(self):
        for project_list, status in (([], 404), ([{}, {}], 409)):
            with patch.object(projects, "search_projects", return_value=(200, {"projectList": project_list})), \
                    patch.object(hardware, "set_allocation") as allocate:
                response = self.client.post("/api/hardware/hw-1/allocations/P001", headers=self.headers,
                    json={"quantity": 1, "expected_version": 1, "reason": "Initial allocation"})
            self.assertEqual(response.status_code, status)
            allocate.assert_not_called()

    def test_project_search_uses_grpc_and_adds_freshness(self):
        payload = projects.messages.SearchProjectsResponse(project_list=[
            projects.messages.ProjectSummary(project_id="P001", project_name="Project", org_id="DAL")])
        with patch.object(projects, "call", return_value=payload) as upstream:
            response = self.client.post("/api/projects-service/projects/search_project", json={}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["projectList"], [{"projectId": "P001", "projectName": "Project", "orgId": "DAL"}])
        upstream.assert_called_once_with("SearchProjects", projects.messages.SearchProjectsRequest())
        self.assertEqual(response.json["meta"]["source"], "live")
