"""Fallback contracts, isolated from Atlas and live providers."""
import copy
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from edge import AGES, Edge, MemoryStore, MongoStore, InvalidSnapshot, create_edge
from hardware.client import HardwareServiceError
from projects.client import ProjectsServiceError

CATALOG = {"items": [{"id": "h1", "name": "Laptop", "category": "computing",
    "description": "", "asset_tag": "", "serial": "", "status": "active",
    "total": 10, "reserved": 2, "out": 1, "version": 1, "available": 9, "unallocated": 8}],
    "total": 1, "page": 1, "size": 100}
SUMMARY = {"orgId": "AUS", "projectId": "P1", "projectName": "Project", "joined_users": ["u1"]}
DETAIL = {**SUMMARY, "projectDesc": "Purpose", "creatorId": "u1", "budget": 100,
          "hardwareList": [{"hardwareId": "h1", "allocation": 2}]}


class EdgeTests(unittest.TestCase):
    def setUp(self):
        self.edge = Edge(MemoryStore())
        self.live = Mock(return_value=(200, copy.deepcopy(CATALOG)))
        self.failed = Mock(side_effect=HardwareServiceError("Down", 503))

    def read(self, live=None, params=None, scope="public"):
        return self.edge.read("hardware", "catalog", scope, params or {}, live or self.live)

    def test_live_first_refresh_allowlist_and_fallback(self):
        self.live.return_value[1]["secret"] = "discard"
        self.live.return_value[1]["items"][0]["secret"] = "discard"
        self.assertEqual(self.read()[1]["meta"]["source"], "live")
        live = self.read()[1]
        self.assertEqual(self.live.call_count, 2)
        self.assertNotIn("secret", live)
        self.assertNotIn("secret", live["items"][0])
        cached = self.read(self.failed)[1]
        self.assertTrue(cached["meta"]["stale"])
        self.assertEqual(cached["meta"]["source"], "cache")
        self.assertIn("savedAt", cached["meta"])

    def test_parameters_scope_and_endpoint_must_match(self):
        self.read(params={"page": 1})
        for params, scope in [({"page": 2}, "public"), ({"page": 1}, "AUS")]:
            with self.assertRaises(HardwareServiceError):
                self.read(self.failed, params, scope)
        with self.assertRaises(HardwareServiceError):
            self.edge.read("hardware", "allocations", "public", {"page": 1}, self.failed)

    def test_expiry_rejected_before_cleanup_and_age_policies(self):
        self.read()
        row = next(iter(self.edge.store.rows.values()))
        self.assertEqual((row["expiresAt"] - row["savedAt"]).total_seconds(), 86400)
        self.assertEqual(AGES, {"catalog": 86400, "allocations": 3600, "detail": 21600, "search": 21600})
        row["expiresAt"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        with self.assertRaises(HardwareServiceError):
            self.read(self.failed)

    def test_invalid_whole_response_uses_previous_snapshot_without_overwriting(self):
        self.read()
        bad = copy.deepcopy(CATALOG)
        bad["items"].append({"id": "broken"})
        cached = self.read(Mock(return_value=(200, bad)))[1]
        self.assertEqual(cached["meta"]["source"], "cache")
        self.assertEqual(len(cached["items"]), 1)
        self.assertEqual(self.edge.metrics["validation_failures"], 1)
        self.edge.store = MemoryStore()
        with self.assertRaises(InvalidSnapshot):
            self.read(Mock(return_value=(200, bad)))

    def test_client_errors_never_use_snapshots(self):
        self.read()
        for status in (400, 401, 403, 404, 409, 429):
            with self.assertRaises(HardwareServiceError):
                self.read(Mock(side_effect=HardwareServiceError("Rejected", status)))

    def test_circuit_opens_and_recovers(self):
        self.read()
        for _ in range(4):
            self.read(self.failed)
        self.assertEqual(self.failed.call_count, 3)
        self.assertTrue(self.edge.health()["circuits"]["hardware"]["open"])
        with patch("edge.time.monotonic", return_value=10**12):
            self.assertEqual(self.read()[1]["meta"]["source"], "live")
        self.assertFalse(self.edge.health()["circuits"]["hardware"]["open"])

    def test_store_failure_and_payload_limit_preserve_live_reads(self):
        self.edge.store = Mock(name="broken store")
        self.edge.store.put.side_effect = OSError("Down")
        self.assertEqual(self.read()[0], 200)
        self.edge.store.get.side_effect = OSError("Down")
        with self.assertRaises(HardwareServiceError):
            self.read(self.failed)
        self.assertEqual(self.edge.metrics["store_write_failures"], 1)
        self.assertEqual(self.edge.metrics["store_read_failures"], 1)
        self.edge.store = MemoryStore()
        self.edge.max_bytes = 1
        self.assertEqual(self.read()[0], 200)
        self.assertEqual(len(self.edge.store.rows), 0)

    def test_project_and_allocation_validation(self):
        for kind, payload, params in [
            ("detail", {"projectInfo": DETAIL}, {"projectId": "P1"}),
            ("search", {"projectList": [SUMMARY]}, {"userId": "u1"}),
            ("allocations", {"items": [{"id": "a1", "hardware_id": "h1", "project_id": "P1",
                "quantity": 2, "out": 1, "version": 1}], "total": 1, "page": 1, "size": 100}, {"projectId": "P1"}),
        ]:
            self.edge.read("projects", kind, "AUS", params, lambda: (200, payload))
            cached = self.edge.read("projects", kind, "AUS", params,
                                    Mock(side_effect=ProjectsServiceError("Down")))[1]
            self.assertTrue(cached["meta"]["stale"])
        with self.assertRaises(InvalidSnapshot):
            Edge().read("projects", "detail", "DAL", {}, lambda: (200, {"projectInfo": DETAIL}))

    def test_store_modes_are_chosen_once(self):
        with patch.dict(os.environ, {"EDGE_STORE": "auto"}), patch("edge.MongoStore", side_effect=OSError()):
            self.assertEqual(create_edge().store.name, "memory")
        with patch.dict(os.environ, {"EDGE_STORE": "mongo"}), patch("edge.MongoStore", side_effect=OSError()):
            self.assertIsNone(create_edge().store)
        with patch.dict(os.environ, {"EDGE_STORE": "off"}):
            self.assertIsNone(create_edge().store)
        with patch.dict(os.environ, {"EDGE_STORE": "memory"}):
            self.assertEqual(create_edge().store.name, "memory")

    def test_mongo_ttl_upsert_and_expiry_filter(self):
        with patch("edge.MongoClient") as client:
            store = MongoStore("mongodb://localhost", "test")
        rows = client.return_value.__getitem__.return_value.__getitem__.return_value
        rows.create_index.assert_called_once_with("expiresAt", expireAfterSeconds=0)
        now = datetime.now(timezone.utc)
        store.get("key", now)
        rows.find_one.assert_called_once_with({"_id": "key", "expiresAt": {"$gt": now}})
        store.put({"_id": "key"})
        rows.replace_one.assert_called_once_with({"_id": "key"}, {"_id": "key"}, upsert=True)


class EdgeRouteTests(unittest.TestCase):
    def setUp(self):
        import app
        self.app = app
        self.http = app.app.test_client()
        self.edge = Edge(MemoryStore())
        edge_patch = patch.dict(app.app.extensions, {"edge": self.edge})
        edge_patch.start()
        self.addCleanup(edge_patch.stop)

    def test_authentication_and_agency_are_checked_before_fallback(self):
        from users.client import UsersServiceError
        headers = {"Authorization": "Bearer test"}
        path = "/api/projects-service/projects/P1"
        with patch.object(self.app, "validate_access_token", return_value=("u1", "AUS")), \
             patch("routes.projects.get_project", return_value=(200, {"projectInfo": DETAIL})):
            self.assertEqual(self.http.get(path, headers=headers).status_code, 200)
        with patch.object(self.app, "validate_access_token", return_value=("u1", "AUS")), \
             patch("routes.projects.get_project", side_effect=ProjectsServiceError("Down")):
            self.assertTrue(self.http.get(path, headers=headers).json["meta"]["stale"])
            self.assertEqual(self.http.get(path + "?orgId=DAL", headers=headers).status_code, 403)
        with patch.object(self.app, "validate_access_token", side_effect=UsersServiceError("Down", 503)):
            self.assertEqual(self.http.get(path, headers=headers).status_code, 503)
        self.assertEqual(self.http.get(path).status_code, 401)

    def test_allocations_can_fall_back_when_project_dependency_is_unavailable(self):
        payload = {"items": [], "total": 0, "page": 1, "size": 100}
        headers = {"Authorization": "Bearer test"}
        with patch.object(self.app, "validate_access_token", return_value=("u1", "AUS")), \
             patch.object(self.app, "_query_project", return_value=DETAIL), \
             patch.object(self.app.hardware_db, "get_allocations", return_value=(200, payload)):
            self.assertEqual(self.http.post("/api/listAllocations", headers=headers, json={"projectId": "P1"}).status_code, 200)
        with patch.object(self.app, "validate_access_token", return_value=("u1", "AUS")), \
             patch.object(self.app, "_query_project", side_effect=ProjectsServiceError("Down")):
            response = self.http.post("/api/listAllocations", headers=headers, json={"projectId": "P1"})
            self.assertTrue(response.json["meta"]["stale"])

    def test_failed_writes_never_access_store_and_health_is_liveness_only(self):
        self.edge.store = Mock()
        with patch.object(self.app, "validate_access_token", return_value=("u1", "AUS")), \
             patch.object(self.app, "_query_project", side_effect=ProjectsServiceError("Down")):
            response = self.http.post("/api/hardware/checkout", headers={"Authorization": "Bearer test"},
                json={"name": "Laptop", "quantity": 1, "projectId": "P1"})
            self.assertEqual(response.status_code, 503)
        self.edge.store.get.assert_not_called()
        self.edge.store.put.assert_not_called()
        self.edge.store = None
        self.assertEqual(self.http.get("/api/health").json["status"], "ok")
