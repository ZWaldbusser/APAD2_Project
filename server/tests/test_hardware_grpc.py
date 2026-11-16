"""Exercise real protobuf serialization and gRPC calls against an in-process service."""

import base64
import os
import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import Mock, patch

import grpc

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("JWT_SECRET_KEY", "grpc-hardware-test-key")

import app
import hardwareDatabase as hardware_db
from hardware import client
from hardware import hardware_pb2 as messages
from hardware import hardware_pb2_grpc as services


class HardwareService(services.HardwareServiceServicer):
    def __init__(self):
        self.calls = []
        self.failure = None
        self.fail_once = False
        self.pages = {1: messages.ListCheckoutsResponse(items=[messages.Checkout(
            id="checkout-1", quantity=5, returned=1, version=2,
        )], total=1, page=1, size=100)}

    def record(self, method, request, context):
        self.calls.append((method, request, dict(context.invocation_metadata())))
        if self.failure:
            status = self.failure
            if self.fail_once:
                self.failure = None
            context.abort(status, "Hardware test failure")

    def ListHardware(self, request, context):
        self.record("ListHardware", request, context)
        return messages.ListHardwareResponse(
            items=[messages.Hardware(id="hw-1", name="Monitor")], total=1, page=1, size=100,
        )

    def AllocateHardware(self, request, context):
        self.record("AllocateHardware", request, context)
        return messages.Hardware(id=request.hardware_id, name="Monitor", version=4, reserved=request.quantity)

    def ListAllocations(self, request, context):
        self.record("ListAllocations", request, context)
        return messages.ListAllocationsResponse(items=[messages.Allocation(
            hardware_id="hw-1", project_id=request.project_id, quantity=10, out=2,
        )], total=1, page=1, size=100)

    def CreateCheckout(self, request, context):
        self.record("CreateCheckout", request, context)
        return messages.Checkout(id="new-checkout", quantity=request.quantity, version=1)

    def ListCheckouts(self, request, context):
        self.record("ListCheckouts", request, context)
        return self.pages[request.page]

    def ReturnCheckout(self, request, context):
        self.record("ReturnCheckout", request, context)
        return messages.Checkout(id=request.checkout_id, returned=request.quantity, version=3)


class HardwareGrpcTests(unittest.TestCase):
    def setUp(self):
        self.service = HardwareService()
        self.server = grpc.server(ThreadPoolExecutor(max_workers=2))
        services.add_HardwareServiceServicer_to_server(self.service, self.server)
        port = self.server.add_insecure_port("127.0.0.1:0")
        self.server.start()
        self.addCleanup(lambda: self.server.stop(0).wait())
        env = patch.dict(os.environ, {
            "HARDWARE_API_BASE_URL_grpc": f"http://127.0.0.1:{port}",
            "HARDWARE_API_KEY": "test-code",
            "HARDWARE_API_TEAM": "front-end",
            "HARDWARE_API_TIMEOUT_SECONDS": "2",
        })
        env.start()
        self.addCleanup(env.stop)
        self.http = app.app.test_client()
        token = app.jwt.encode({"user_id": "user-1"}, app.SECRET_KEY, algorithm="HS256")
        self.headers = {"Authorization": f"Bearer {token}"}
        self.body = {"name": "Monitor", "hardwareId": "hw-1", "projectId": "project-1", "quantity": 2}

    def post(self, action, body=None):
        with patch.object(app.projects_api, "query_project", return_value={"projectId": "project-1"}):
            return self.http.post(f"/api/hardware/{action}", headers=self.headers, json=body or self.body)

    def test_checkout_uses_protobuf_auth_and_idempotency(self):
        response = self.post("checkout")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"message": "Checkout successful"})
        method, request, metadata = self.service.calls[0]
        self.assertEqual(method, "CreateCheckout")
        self.assertEqual((request.hardware_id, request.project_id, request.user_id, request.quantity),
                         ("hw-1", "project-1", "user-1", 2))
        self.assertTrue(request.HasField("quantity"))
        self.assertTrue(request.request_id)
        self.assertEqual(metadata["idempotency-key"], request.request_id)
        self.assertEqual(metadata["authorization"],
                         "Basic " + base64.b64encode(b"front-end:test-code").decode())

    def test_name_lookup_also_uses_grpc(self):
        body = {key: value for key, value in self.body.items() if key != "hardwareId"}
        self.assertEqual(self.post("checkout", body).status_code, 200)
        self.assertEqual([call[0] for call in self.service.calls], ["ListHardware", "CreateCheckout"])
        self.assertEqual(self.service.calls[1][1].hardware_id, "hw-1")

    def test_checkin_filters_records_and_sends_checkout_version(self):
        self.assertEqual(self.post("checkin").status_code, 200)
        listing, returning = self.service.calls
        self.assertEqual(listing[0], "ListCheckouts")
        self.assertEqual((listing[1].hardware_id, listing[1].project_id, listing[1].user_id),
                         ("hw-1", "project-1", "user-1"))
        self.assertTrue(listing[1].HasField("outstanding"))
        self.assertTrue(listing[1].outstanding)
        self.assertEqual(returning[0], "ReturnCheckout")
        self.assertEqual((returning[1].checkout_id, returning[1].quantity, returning[1].expected_version),
                         ("checkout-1", 2, 2))

    def test_checkin_fetches_all_pages_before_returning(self):
        self.service.pages = {
            page: messages.ListCheckoutsResponse(items=[messages.Checkout(
                id=f"checkout-{page}", quantity=1, version=page,
            )], total=2, page=page, size=1) for page in (1, 2)
        }
        self.assertEqual(self.post("checkin").status_code, 200)
        self.assertEqual([call[0] for call in self.service.calls],
                         ["ListCheckouts", "ListCheckouts", "ReturnCheckout", "ReturnCheckout"])
        returns = self.service.calls[2:]
        self.assertEqual([call[1].quantity for call in returns], [1, 1])
        self.assertNotEqual(returns[0][1].request_id, returns[1][1].request_id)

    def test_excess_return_does_not_partially_mutate(self):
        response = self.post("checkin", {**self.body, "quantity": 5})
        self.assertEqual(response.status_code, 400)
        self.assertEqual([call[0] for call in self.service.calls], ["ListCheckouts"])

    def test_transient_retry_reuses_request_id(self):
        self.service.failure = grpc.StatusCode.UNAVAILABLE
        self.service.fail_once = True
        self.assertEqual(self.post("checkout").status_code, 200)
        self.assertEqual(len(self.service.calls), 2)
        self.assertEqual(self.service.calls[0][1], self.service.calls[1][1])
        self.assertTrue(self.service.calls[0][1].request_id)

    def test_rpc_errors_are_mapped_without_retrying_conflicts(self):
        for code, expected in (
            (grpc.StatusCode.INVALID_ARGUMENT, 400),
            (grpc.StatusCode.UNAUTHENTICATED, 401),
            (grpc.StatusCode.PERMISSION_DENIED, 403),
            (grpc.StatusCode.NOT_FOUND, 404),
            (grpc.StatusCode.FAILED_PRECONDITION, 400),
            (grpc.StatusCode.ABORTED, 409),
            (grpc.StatusCode.ALREADY_EXISTS, 409),
            (grpc.StatusCode.RESOURCE_EXHAUSTED, 429),
            (grpc.StatusCode.UNAVAILABLE, 503),
            (grpc.StatusCode.DEADLINE_EXCEEDED, 503),
        ):
            with self.subTest(code=code):
                self.service.calls.clear()
                self.service.failure = code
                response = self.post("checkout")
                self.assertEqual(response.status_code, expected)
                self.assertEqual(response.get_json(), {"error": "Hardware test failure"})
                self.assertEqual(len(self.service.calls), 2 if code == grpc.StatusCode.UNAVAILABLE else 1)

    def test_invalid_quantity_never_reaches_hardware(self):
        for quantity in (0, -1, True, 1.5, "2"):
            self.assertEqual(self.post("checkout", {**self.body, "quantity": quantity}).status_code, 400)
        self.assertEqual(self.service.calls, [])

    def test_signup_keeps_mongo_and_project_creation_uses_api(self):
        with patch.object(app.users_db, "create_user", return_value="user-2") as create_user:
            response = self.http.post("/api/signup", json={"userID": "alice", "password": "test"})
        self.assertEqual(response.status_code, 201)
        create_user.assert_called_once_with("alice", "test")
        body = {"orgId": "AUS", "projectId": "project-1", "projectName": "Project",
                "creatorId": "alice", "budget": 100, "hardwareList": []}
        with patch.object(app.projects_api, "call", return_value=(200, {"success": True})) as upstream:
            response = self.http.post("/api/projects-service/projects/create_project",
                                      headers=self.headers, json=body)
        self.assertEqual(response.status_code, 200)
        upstream.assert_called_once_with("POST", "/projects/create_project", data=body, params={})
        self.assertEqual(self.service.calls, [])

    def test_create_allocate_and_read_share_remote_project_without_mongo(self):
        body = {"orgId": "DAL", "projectId": "remote-only", "projectName": "Remote project",
                "creatorId": "alice", "budget": 100,
                "hardwareList": [{"hardwareId": "hw-1", "allocation": 10}]}
        created = Mock(status_code=200)
        created.json.return_value = {"success": True}
        detail = Mock(status_code=200)
        detail.json.return_value = {"projectInfo": body}
        with patch.dict(os.environ, {"PROJECTS_API_BASE_URL": "https://projects.test"}), \
                patch.object(app.projects_api.requests, "request", side_effect=[created, detail]) as upstream, \
                patch.object(app.db, "db") as mongo:
            response = self.http.post("/api/projects-service/projects/create_project", headers=self.headers, json=body)
            self.assertEqual(response.status_code, 200)
            response = self.http.post("/api/hardware/hw-1/allocations/remote-only", headers=self.headers,
                json={"orgId": "DAL", "quantity": 10, "expected_version": 3, "reason": "Initial allocation"})
            self.assertEqual(response.status_code, 200)
            response = self.http.post("/api/listAllocations", headers=self.headers, json={"projectId": "remote-only"})
            self.assertEqual(response.json["items"][0]["quantity"], 10)
            mongo.__getitem__.assert_not_called()
        self.assertEqual(upstream.call_args_list[0].args, ("POST", "https://projects.test/projects/create_project"))
        self.assertEqual(upstream.call_args_list[1].kwargs["params"], {"orgId": "DAL"})
        self.assertEqual([call[0] for call in self.service.calls], ["AllocateHardware", "ListAllocations"])
        self.assertEqual(self.service.calls[0][1].project_id, "remote-only")

    def test_endpoint_normalizes_tls_and_local_targets(self):
        self.assertEqual(client._endpoint("https://example.test"), ("example.test:443", True))
        self.assertEqual(client._endpoint("example.test:50051"), ("example.test:50051", True))
        self.assertEqual(client._endpoint("http://localhost:50051"), ("localhost:50051", False))
        for value in ("", "https://example.test/api", "https://example.test?key=secret"):
            with self.subTest(value=value), self.assertRaises(client.HardwareServiceError):
                client._endpoint(value)


if __name__ == "__main__":
    unittest.main()
