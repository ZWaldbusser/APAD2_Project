"""Gateway behaviour: validation, allow-list, snapshot fallback, tenant isolation, circuit breaker."""
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from edge import store as edge
from gateway import resilience
from gateway.core import read_through
from gateway.policy import mappers, validators
from hardware.client import HardwareServiceError


def page(*items):
    return {"items": list(items), "total": len(items), "page": 1, "size": 100}


def hw(i, **kw):
    base = {"id": i, "name": f" Item {i} ", "total": 5, "reserved": 0, "out": 1, "available": 4,
            "version": 3, "secret_internal": "x"}
    return {**base, **kw}


def fetch_hw(payload):
    return lambda: payload


def down():
    raise HardwareServiceError("Hardware service is unavailable", 503)


def run(fetch, org=None, params=None):
    return read_through("hardware", "listHardware", org, params or {}, fetch,
                        validators.validate_hardware_page, mappers.map_page(mappers.HARDWARE_ITEM_KEEP))


class GatewayTests(unittest.TestCase):
    def setUp(self):
        edge.set_store(edge.MemoryStore())
        resilience._breakers.clear()

    def test_live_validates_maps_and_snapshots(self):
        status, body = run(fetch_hw(page(hw("a"), hw("a"), {"name": "no id"}, hw("c", out=9))))
        self.assertEqual(status, 200)
        self.assertEqual([i["id"] for i in body["items"]], ["a", "c"])  # dup + missing id dropped
        self.assertNotIn("secret_internal", body["items"][0])           # allow-list
        self.assertEqual(body["items"][0]["name"], "Item a")            # normalised
        self.assertIn("warning", body["items"][1])                      # reconciliation flag
        self.assertEqual(body["meta"]["source"], "live")
        self.assertFalse(body["meta"]["stale"])

    def test_outage_serves_stale_snapshot(self):
        run(fetch_hw(page(hw("a"))))
        status, body = run(down)
        self.assertEqual(status, 200)
        self.assertEqual(body["meta"]["source"], "cache")
        self.assertTrue(body["meta"]["stale"])
        self.assertEqual(body["items"][0]["id"], "a")

    def test_outage_without_snapshot_raises(self):
        with self.assertRaises(HardwareServiceError):
            run(down)

    def test_client_errors_are_not_masked_by_cache(self):
        run(fetch_hw(page(hw("a"))))

        def forbidden():
            raise HardwareServiceError("nope", 403)
        with self.assertRaises(HardwareServiceError):
            run(forbidden)

    def test_tenant_isolation(self):
        run(fetch_hw(page(hw("a"))), org="org-1")
        with self.assertRaises(HardwareServiceError):
            run(down, org="org-2")

    def test_circuit_opens_then_falls_back_without_calling_upstream(self):
        run(fetch_hw(page(hw("a"))))
        calls = []

        def counting_down():
            calls.append(1)
            down()
        for _ in range(config.BREAKER_FAILURES):
            run(counting_down)
        self.assertEqual(resilience.breaker_states()["hardware"], "open")
        before = len(calls)
        status, body = run(counting_down)
        self.assertEqual(len(calls), before)  # not called while open
        self.assertTrue(body["meta"]["stale"])

    def test_expired_snapshot_is_not_served(self):
        run(fetch_hw(page(hw("a"))))
        future = datetime.now(timezone.utc) + timedelta(days=2)
        with patch("edge.store.datetime") as clock:
            clock.now.return_value = future
            with self.assertRaises(HardwareServiceError):
                run(down)

    def test_different_request_params_do_not_share_snapshots(self):
        run(fetch_hw(page(hw("a"))), params={"page": 1})
        with self.assertRaises(HardwareServiceError):
            run(down, params={"page": 2})

    def test_store_failure_preserves_live_read_but_cannot_supply_fallback(self):
        with patch.object(edge._store, "put", side_effect=RuntimeError("Store offline")):
            self.assertEqual(run(fetch_hw(page(hw("a"))))[0], 200)
        with patch.object(edge._store, "get", side_effect=RuntimeError("Store offline")):
            with self.assertRaises(HardwareServiceError):
                run(down)

    def test_cross_project_allocations_rejected(self):
        v = validators.validate_allocation_page("P1")
        out = v(page({"id": "1", "hardware_id": "h", "project_id": "P1", "quantity": 1, "out": 0},
                     {"id": "2", "hardware_id": "h", "project_id": "OTHER", "quantity": 1, "out": 0}))
        self.assertEqual([i["id"] for i in out["items"]], ["1"])


if __name__ == "__main__":
    unittest.main()
