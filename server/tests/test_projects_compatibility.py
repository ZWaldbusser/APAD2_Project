"""Current Projects wire behavior through the actual Flask/gRPC adapters."""
import sys
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory
import grpc

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from auth_support import authenticate


def mutation_wire_type():
    # Independent provider descriptor: v1.7 success=1, error_message=2.
    file = descriptor_pb2.FileDescriptorProto(name="test_mutation.proto", package="provider", syntax="proto3")
    message = file.message_type.add(name="MutationResult")
    message.field.add(name="success", number=1, type=8)
    message.field.add(name="error_message", number=2, type=9)
    pool = descriptor_pool.DescriptorPool()
    pool.Add(file)
    return message_factory.GetMessageClass(pool.FindMessageTypeByName("provider.MutationResult"))


class ProjectsCompatibilityTests(unittest.TestCase):
    def test_unavailable_reads_retry_once_but_mutations_never_repeat_automatically(self):
        from projects_support import start_projects
        headers=authenticate(self)
        provider=start_projects(self,[])
        provider.failure=grpc.StatusCode.UNAVAILABLE
        paths=[("search",2),("create",1),("join",1),("leave",1)]
        for action,expected in paths:
            provider.calls.clear()
            response=app.app.test_client().post(f"/api/projects-service/projects/{action}_project",headers=headers,
                json={"projectId":"P1","projectName":"Library","projectDesc":"Purpose","budget":10})
            self.assertEqual(response.status_code,503)
            self.assertEqual(len(provider.calls),expected)

    def test_missing_mismatched_or_unavailable_profiles_cannot_send_a_membership_write(self):
        from projects_support import start_projects
        from users import users_pb2 as user_messages
        provider=start_projects(self,[])
        profiles=[user_messages.User(id="other-user",agency_code="AUS",username="wrong.person"),
                  user_messages.User(id="user-1",agency_code="DAL",username="wrong.agency"),
                  user_messages.User(id="user-1",agency_code="AUS",username="")]
        for profile in profiles:
            with self.subTest(profile=profile.username):
                headers=authenticate(self,profile=profile)
                response=app.app.test_client().post("/api/projects-service/projects/join_project",headers=headers,
                    json={"projectId":"P1","userName":"spoofed.name"})
                self.assertEqual(response.status_code,502)
        headers=authenticate(self,profile_error=grpc.StatusCode.UNAVAILABLE)
        response=app.app.test_client().post("/api/projects-service/projects/leave_project",headers=headers,json={"projectId":"P1"})
        self.assertEqual(response.status_code,503)
        self.assertEqual(provider.calls,[])

    def test_rpc_diagnostics_preserve_method_status_and_time_without_credentials_or_request_bodies(self):
        from projects_support import start_projects
        headers=authenticate(self)
        provider=start_projects(self,[])
        provider.failure=grpc.StatusCode.UNAVAILABLE
        provider.failure_detail="Database paused; authorization=Bearer sensitive-fixture; https://user:password@example.invalid/private"
        with self.assertLogs("projects.client",level="WARNING") as logs:
            response=app.app.test_client().post("/api/projects-service/projects/search_project",headers=headers,json={})
        self.assertEqual(response.status_code,503)
        output=" ".join(logs.output)
        self.assertIn("SearchProjects",output)
        self.assertIn("UNAVAILABLE",output)
        self.assertIn("occurred_at=",output)
        self.assertIn("Database paused",output)
        for secret in ("sensitive-fixture","user:password","isolated-access-token"):
            self.assertNotIn(secret,output)
            self.assertNotIn(secret,response.get_data(as_text=True))

    def test_price_refresh_metadata_keeps_its_source_value_without_guessing_a_timezone(self):
        from projects_support import start_projects
        headers=authenticate(self)
        start_projects(self,[])
        response=app.app.test_client().post("/api/projects-service/get_unit_price",headers=headers,json={"category":"Laptops"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json.get("dataAsOf"),"2026-11-22 08:00:00")
        self.assertEqual(response.json["unitPrice"]["Austin"]["median"],75)
        self.assertEqual(response.json["unitPrice"]["Dallas"],"not available")

    def test_legacy_short_timeout_cannot_cut_off_cold_start_reads_on_either_transport(self):
        import os
        from unittest.mock import Mock, patch
        from projects import client, projects_pb2 as messages
        stub=Mock()
        stub.SearchProjects.return_value=messages.SearchProjectsResponse()
        rest=Mock(status_code=200)
        rest.json.return_value={"success":True}
        with patch.dict(os.environ,{"PROJECTS_GRPC_TARGET":"http://deadline-fixture:50051","PROJECTS_API_BASE_URL":"https://projects.example","PROJECTS_API_TIMEOUT_SECONDS":"10"}):
            with self.subTest(transport="grpc"), patch("projects.client.services.ProjectsServiceStub",return_value=stub):
                client.search_projects({"orgId":"AUS"})
                self.assertGreaterEqual(stub.SearchProjects.call_args.kwargs["timeout"],59)
            with self.subTest(transport="rest"), patch("services.projects.requests.request",return_value=rest) as http:
                client.projects_rest.call("POST","/get_budget_context",data={})
                self.assertGreaterEqual(http.call_args.kwargs["timeout"],60)

    def test_notification_name_comes_from_the_authenticated_profile_not_the_browser(self):
        from projects_support import start_projects
        headers=authenticate(self)
        provider=start_projects(self,[])
        for action in ("join","leave"):
            with self.subTest(action=action):
                response=app.app.test_client().post(f"/api/projects-service/projects/{action}_project",headers=headers,
                    json={"projectId":"P1","userId":"spoofed-id","userName":"spoofed.name","user_name":"another.spoof"})
                self.assertEqual(response.status_code,200)
                self.assertTrue(response.json["success"])
                request=provider.calls[-1][1]
                self.assertEqual((request.org_id,request.user_id,request.user_name),("AUS","user-1","trusted.staff"))

    def test_provider_declines_survive_transport_instead_of_becoming_success(self):
        import os
        from unittest.mock import patch
        wire = mutation_wire_type()
        calls = []
        def decline(request, context):
            calls.append(request)
            return wire(success=False, error_message="Project changes were declined")
        server = grpc.server(ThreadPoolExecutor(max_workers=2))
        server.add_generic_rpc_handlers((grpc.method_handlers_generic_handler(
            "projects.v1.ProjectsService", {name:grpc.unary_unary_rpc_method_handler(decline,response_serializer=lambda result:result.SerializeToString())
                for name in ("CreateProject","JoinProject","LeaveProject")},
        ),))
        port = server.add_insecure_port("127.0.0.1:0")
        server.start()
        self.addCleanup(lambda: server.stop(0).wait())
        headers = authenticate(self)
        with patch.dict(os.environ, {"PROJECTS_GRPC_TARGET":f"http://127.0.0.1:{port}"}):
            for action in ("create","join","leave"):
                with self.subTest(action=action):
                    response = app.app.test_client().post(f"/api/projects-service/projects/{action}_project", headers=headers,
                        json={"projectId":"P1","projectName":"Library","projectDesc":"Purpose","budget":10})
                    self.assertEqual(response.status_code,200)
                    self.assertEqual(response.json,{"success":False,"errorMessage":"Project changes were declined"})
        self.assertEqual(len(calls),3)


if __name__=="__main__":unittest.main()
