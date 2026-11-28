"""Browser-to-Projects gRPC behavior through the Users token check."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import grpc
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from projects import projects_pb2 as messages
from auth_support import authenticate
from projects_support import start_projects


class ProjectsApiTests(unittest.TestCase):
    def setUp(self):
        from edge import Edge
        edge_patch = patch.dict(app.app.extensions, {"edge": Edge()})
        edge_patch.start()
        self.addCleanup(edge_patch.stop)
        self.headers = authenticate(self)
        self.provider = start_projects(self, [
            messages.Project(org_id="AUS", project_id="P1", project_name="Member project",
                             project_desc="Purpose", joined_users=["user-1", "0007"]),
            messages.Project(org_id="AUS", project_id="P2", project_name="Agency project",
                             project_desc="Purpose", joined_users=["user-2"]),
            messages.Project(org_id="DAL", project_id="D1", project_name="Other agency",
                             project_desc="Purpose", joined_users=["user-1"]),
        ])
        self.http = app.app.test_client()

    def test_membership_filter_and_summary_survive_real_protobuf_transport(self):
        response = self.http.post("/api/projects-service/projects/search_project",
                                  headers=self.headers, json={"userId": "user-1"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["meta"], {"source": "live", "stale": False, "service": "projects"})
        self.assertEqual(response.json["projectList"], [{
            "orgId": "AUS", "projectId": "P1", "projectName": "Member project",
            "joined_users": ["user-1", "0007"],
        }])
        self.assertEqual(self.provider.calls[0][1].user_id, "user-1")

    def test_unfiltered_discovery_is_still_limited_to_verified_agency(self):
        response = self.http.post("/api/projects-service/projects/search_project",
                                  headers=self.headers, json={})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([p["projectId"] for p in response.json["projectList"]], ["P1", "P2"])

    def test_detail_and_provider_statuses_use_real_grpc_mapping(self):
        response = self.http.get("/api/projects-service/projects/P1", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["projectInfo"]["joined_users"], ["user-1", "0007"])
        for code, status in ((grpc.StatusCode.NOT_FOUND, 404),
                             (grpc.StatusCode.ALREADY_EXISTS, 409),
                             (grpc.StatusCode.FAILED_PRECONDITION, 409),
                             (grpc.StatusCode.INVALID_ARGUMENT, 400),
                             (grpc.StatusCode.UNAVAILABLE, 503)):
            with self.subTest(code=code):
                self.provider.failure = code
                response = self.http.get("/api/projects-service/projects/P1", headers=self.headers)
                self.assertEqual(response.status_code, status)

    def test_missing_or_wrong_tokens_never_contact_projects(self):
        for headers in ({}, {"Authorization": "Bearer wrong-token"}):
            response = self.http.post("/api/projects-service/projects/search_project",
                                      headers=headers, json={})
            self.assertEqual(response.status_code, 401)
        self.assertEqual(self.provider.calls, [])

    def test_validation_outage_does_not_grant_access(self):
        from users.client import UsersServiceError
        with patch("app.validate_access_token", side_effect=UsersServiceError("Users unavailable", 503)):
            response = self.http.post("/api/projects-service/projects/search_project",
                                      headers=self.headers, json={})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.provider.calls, [])
