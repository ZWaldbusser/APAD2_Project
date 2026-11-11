"""Inventory response contract through the working gRPC adapter."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("JWT_SECRET_KEY", "test-key-with-at-least-32-characters")
import app
import hardwareDatabase as hardware_db
from hardware import hardware_pb2 as messages


class HardwareResponseTests(unittest.TestCase):
    def test_inventory_preserves_ids_capacity_and_filters(self):
        result = messages.ListHardwareResponse(items=[messages.Hardware(
            id="hw-1", name="Monitor", total=100, reserved=10, out=5,
            available=95, unallocated=90, version=3,
        )], total=1, page=2, size=10)
        with patch.object(hardware_db.hardware_grpc, "call", return_value=result) as upstream:
            response = app.app.test_client().post("/api/hardware", json={"page": 2, "size": 10, "category": "Monitor"})
        self.assertEqual(response.status_code, 200)
        item = response.json["items"][0]
        self.assertEqual((item["id"], item["_id"], item["unallocated"], item["version"]), ("hw-1", "hw-1", 90, 3))
        upstream.assert_called_once_with("ListHardware", messages.ListHardwareRequest(page=2, size=10, category="Monitor"))

    def test_invalid_body_does_not_reach_upstream(self):
        with patch.object(hardware_db.hardware_grpc, "call") as upstream:
            self.assertEqual(app.app.test_client().post("/api/hardware", json=[]).status_code, 400)
            upstream.assert_not_called()
