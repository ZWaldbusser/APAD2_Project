"""Run with: python -m unittest discover -s server/tests"""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("JWT_SECRET_KEY", "hardware-response-test-key")

import app
import hardwareDatabase as hardware_db


class HardwareResponseTests(unittest.TestCase):
    def setUp(self):
        self.item = {
            "_id": "hardware-1",
            "name": "Monitor",
            "category": "Monitor",
            "description": "Full description",
            "asset_tag": "MON-001",
            "serial": "12345678",
            "total": 1000,
            "status": "active",
            "out": 5,
            "reserved": 10,
            "version": 3,
            "name_key": "monitor",
            "asset_key": "mon-001",
        }
        self.payload = {"items": [self.item], "total": 1, "page": 1, "size": 25}

    def test_route_preserves_complete_upstream_response(self):
        with patch.object(hardware_db, "_request", return_value=(200, self.payload)) as upstream:
            response = app.app.test_client().get("/api/hardware")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), self.payload)
        self.assertEqual(dict(upstream.call_args.kwargs["params"]), {})

    def test_route_forwards_pagination_and_filters(self):
        with patch.object(hardware_db, "_request", return_value=(200, self.payload)) as upstream:
            response = app.app.test_client().get("/api/hardware?page=2&size=10&category=Monitor")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            dict(upstream.call_args.kwargs["params"]),
            {"page": "2", "size": "10", "category": "Monitor"},
        )

    def test_checkout_uses_original_hardware_id(self):
        with patch.object(hardware_db, "_request", side_effect=[
            (200, self.payload), (201, {}),
        ]) as upstream:
            success, _ = hardware_db.checkout_hardware("Monitor", 2, "project-1", "user-1")
        self.assertTrue(success)
        self.assertEqual(upstream.call_args.kwargs["json"]["hardware_id"], "hardware-1")

    def test_checkin_uses_original_hardware_id(self):
        records = {"items": [{"_id": "checkout-1", "quantity": 5, "returned": 0, "version": 1}]}
        with patch.object(hardware_db, "_request", side_effect=[
            (200, self.payload), (200, records), (200, {}),
        ]) as upstream:
            success, _ = hardware_db.checkin_hardware("Monitor", 2, "project-1", "user-1")
        self.assertTrue(success)
        self.assertEqual(upstream.call_args_list[1].kwargs["params"]["hardware_id"], "hardware-1")

    def test_legacy_array_response_is_preserved_and_searchable(self):
        with patch.object(hardware_db, "_request", return_value=(200, [self.item])):
            self.assertEqual(hardware_db.get_all_hardware(), [self.item])
            self.assertEqual(hardware_db._find_hardware("Monitor"), self.item)

    def test_upstream_failure_remains_an_error(self):
        with patch.object(hardware_db, "_request", return_value=(503, {"detail": "Unavailable"})):
            response = app.app.test_client().get("/api/hardware")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json(), {"error": "Unavailable"})


if __name__ == "__main__":
    unittest.main()
