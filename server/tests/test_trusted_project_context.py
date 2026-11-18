"""Protected browser requests use verified identity, not supplied actor IDs."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from projects import client as projects
from projects import projects_pb2 as messages
import hardwareDatabase as hardware
from hardware import hardware_pb2 as hardware_messages
from hardware.client import HardwareServiceError
from auth_support import authenticate


class TrustedProjectContextTests(unittest.TestCase):
    def setUp(self):
        self.headers = authenticate(self)
        self.http = app.app.test_client()

    def test_creation_uses_verified_creator(self):
        with patch.object(projects, "call", return_value=messages.CreateProjectResponse()) as provider:
            response = self.http.post(
                "/api/projects-service/projects/create_project",
                headers=self.headers,
                json={"orgId": "AUS", "projectId": "P1", "projectName": "Test",
                      "projectDesc": "Purpose", "budget": 20, "creatorId": "other-user"},
            )
        self.assertEqual(response.status_code, 200)
        request = provider.call_args.args[1]
        self.assertEqual(request.creator_id, "user-1")
        self.assertEqual(request.org_id, "AUS")

    def test_invalid_create_contract_never_reaches_projects(self):
        valid = {"projectId": "P1", "projectName": "Test", "projectDesc": "Purpose", "budget": 20}
        for fields in ({"projectDesc": ""}, {"projectName": ""}, {"projectId": ""},
                       {"budget": -1}, {"budget": 1.5}, {"budget": True}):
            with self.subTest(fields=fields), patch.object(
                projects, "call", return_value=messages.CreateProjectResponse(),
            ) as provider:
                response = self.http.post("/api/projects-service/projects/create_project",
                                          headers=self.headers, json={**valid, **fields})
                self.assertEqual(response.status_code, 400)
                provider.assert_not_called()

    def test_membership_search_filters_the_verified_user_instead_of_another_id(self):
        result = messages.SearchProjectsResponse(project_list=[messages.ProjectSummary(
            org_id="AUS", project_id="P1", project_name="Own project", joined_users=["user-1"],
        )])
        with patch.object(projects, "call", return_value=result) as provider:
            response = self.http.post(
                "/api/projects-service/projects/search_project", headers=self.headers,
                json={"userId": "other-user"},
            )
        self.assertEqual(response.status_code, 200)
        request = provider.call_args.args[1]
        self.assertEqual((request.user_id, request.org_id), ("user-1", "AUS"))
        self.assertEqual(response.json["projectList"][0]["joined_users"], ["user-1"])

    def test_search_rejects_a_foreign_agency_before_contacting_projects(self):
        with patch.object(projects, "call", return_value=messages.SearchProjectsResponse()) as provider:
            response = self.http.post(
                "/api/projects-service/projects/search_project",
                headers=self.headers, json={"orgId": "DAL"},
            )
        self.assertEqual(response.status_code, 403)
        provider.assert_not_called()

    def test_membership_actions_use_verified_actor_and_agency(self):
        for action in ("join", "leave"):
            with self.subTest(action=action), patch.object(
                projects, "call", return_value=messages.MembershipResponse(),
            ) as provider:
                response = self.http.post(
                    f"/api/projects-service/projects/{action}_project",
                    headers=self.headers,
                    json={"projectId": "P1", "userId": "other-user"},
                )
                self.assertEqual(response.status_code, 200)
                request = provider.call_args.args[1]
                self.assertEqual((request.user_id, request.org_id), ("user-1", "AUS"))

    def test_incomplete_verified_identity_never_reaches_projects(self):
        for agency, user_id, status in (("OTHER", "user-1", 403), ("AUS", "", 401)):
            with self.subTest(agency=agency, user_id=user_id):
                headers = authenticate(self, agency=agency, user_id=user_id)
                with patch.object(projects, "call", return_value=messages.SearchProjectsResponse()) as provider:
                    response = self.http.post(
                        "/api/projects-service/projects/search_project", headers=headers, json={},
                    )
                self.assertEqual(response.status_code, status)
                provider.assert_not_called()

    def test_foreign_hardware_context_is_rejected_before_any_provider_call(self):
        cases = [
            ("/api/hardware/checkout", {"projectId": "P1", "name": "Monitor", "quantity": 1}),
            ("/api/hardware/checkin", {"projectId": "P1", "name": "Monitor", "quantity": 1}),
            ("/api/listAllocations", {"projectId": "P1"}),
            ("/api/hardware/checkouts", {"projectId": "P1"}),
            ("/api/hardware/H1/availability", {"projectId": "P1"}),
            ("/api/hardware/H1/allocations/P1", {"quantity": 1, "expected_version": 1, "reason": "Test allocation"}),
        ]
        for path, data in cases:
            with self.subTest(path=path), patch.object(
                projects, "call", side_effect=projects.ProjectsServiceError("Unexpected provider call"),
            ) as project_provider, patch.object(
                hardware.hardware_grpc, "call", side_effect=HardwareServiceError("Unexpected provider call"),
            ) as hardware_provider:
                response = self.http.post(path, headers=self.headers, json={**data, "orgId": "DAL"})
                self.assertEqual(response.status_code, 403)
                project_provider.assert_not_called()
                hardware_provider.assert_not_called()

    def test_hardware_refuses_project_ids_shared_by_multiple_agencies(self):
        def project_response(method, request):
            if method == "GetProject":
                return messages.GetProjectResponse(project_info=messages.Project(
                    org_id="AUS", project_id="P1", project_name="Own project",
                ))
            return messages.SearchProjectsResponse(project_list=[
                messages.ProjectSummary(org_id="AUS", project_id="P1", project_name="Own project"),
                messages.ProjectSummary(org_id="DAL", project_id="P1", project_name="Other project"),
            ])

        with patch.object(projects, "call", side_effect=project_response), patch.object(
            hardware.hardware_grpc, "call", return_value=hardware_messages.ListAllocationsResponse(),
        ) as provider:
            response = self.http.post(
                "/api/listAllocations", headers=self.headers, json={"projectId": "P1"},
            )
        self.assertEqual(response.status_code, 409)
        provider.assert_not_called()

    def test_foreign_project_data_is_not_returned_even_if_provider_ignores_scope(self):
        result = messages.SearchProjectsResponse(project_list=[messages.ProjectSummary(
            org_id="DAL", project_id="P1", project_name="Other agency",
        )])
        with patch.object(projects, "call", return_value=result):
            response = self.http.post("/api/projects-service/projects/search_project",
                                      headers=self.headers, json={})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("projectList", response.json)

    def test_every_agency_scoped_project_route_rejects_foreign_context(self):
        cases = [("create_project", {}), ("join_project", {}), ("leave_project", {})]
        for action, data in cases:
            with self.subTest(action=action), patch.object(projects, "call") as provider:
                response = self.http.post(f"/api/projects-service/projects/{action}",
                                          headers=self.headers, json={**data, "orgId": "DAL"})
                self.assertEqual(response.status_code, 403)
                provider.assert_not_called()
        with patch.object(projects, "call") as provider:
            response = self.http.get("/api/projects-service/projects/P1?orgId=DAL", headers=self.headers)
            self.assertEqual(response.status_code, 403)
            response = self.http.post("/api/projects-service/get_budget_context",
                                      headers=self.headers, json={"orgId": "DAL"})
            self.assertEqual(response.status_code, 403)
            provider.assert_not_called()

    def test_missing_project_or_invalid_body_cannot_request_all_allocations(self):
        for body in ({}, [], {"projectId": ""}):
            with self.subTest(body=body), patch.object(hardware.hardware_grpc, "call") as provider:
                response = self.http.post("/api/listAllocations", headers=self.headers, json=body)
                self.assertEqual(response.status_code, 400)
                provider.assert_not_called()

    def test_provider_cannot_supply_another_users_membership_results(self):
        result = messages.SearchProjectsResponse(project_list=[messages.ProjectSummary(
            org_id="AUS", project_id="P1", project_name="Another member", joined_users=["user-2"],
        )])
        with patch.object(projects, "call", return_value=result):
            response = self.http.post("/api/projects-service/projects/search_project",
                                      headers=self.headers, json={"user_id": "user-2"})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("projectList", response.json)

    def test_budget_context_keeps_verified_agency_and_unwraps_provider_status(self):
        result = messages.GetBudgetContextResponse(org_id="AUS", budget=100, unpriced_items=1)
        with patch.object(projects, "call", return_value=result) as provider:
            response = self.http.post("/api/projects-service/get_budget_context",
                                      headers=self.headers,
                                      json={"budget": 100, "items": [{"description": "Monitor", "quantity": 1}]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["orgId"], "AUS")
        self.assertIsNone(response.json["withinBudget"])
        self.assertEqual(provider.call_args.args[1].org_id, "AUS")


if __name__ == "__main__":
    unittest.main()
