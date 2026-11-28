"""Live-first, bounded read snapshots. This is not an offline write queue."""
import copy
import hashlib
import json
import logging
import os
import time
from collections import Counter, OrderedDict
from datetime import datetime, timedelta, timezone
from threading import RLock

from pymongo import MongoClient

log = logging.getLogger(__name__)
AGES = {"catalog": 86400, "allocations": 3600, "detail": 21600, "search": 21600}


class EdgeUnavailable(RuntimeError):
    status_code = 503


class InvalidSnapshot(RuntimeError):
    status_code = 502


class MemoryStore:
    name = "memory"

    def __init__(self, capacity=256):
        self.rows = OrderedDict()
        self.capacity = capacity
        self.lock = RLock()

    def get(self, key, now):
        with self.lock:
            row = self.rows.get(key)
            if row and row["expiresAt"] <= now:
                del self.rows[key]
                return None
            return copy.deepcopy(row)

    def put(self, row):
        with self.lock:
            self.rows[row["_id"]] = copy.deepcopy(row)
            self.rows.move_to_end(row["_id"])
            while len(self.rows) > self.capacity:
                self.rows.popitem(last=False)


class MongoStore:
    name = "mongo"

    def __init__(self, uri, database):
        self.client = MongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=1500,
                                  connectTimeoutMS=1500, socketTimeoutMS=1500, timeoutMS=2000)
        try:
            self.client.admin.command("ping")
            self.rows = self.client[database]["edge_snapshots"]
            self.rows.create_index("expiresAt", expireAfterSeconds=0)
        except Exception:
            self.client.close()
            raise

    def get(self, key, now):
        # TTL deletion is asynchronous; never rely on cleanup for freshness.
        return self.rows.find_one({"_id": key, "expiresAt": {"$gt": now}})

    def put(self, row):
        self.rows.replace_one({"_id": row["_id"]}, row, upsert=True)


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _number(value):
    return type(value) is int and value >= 0


def validate(kind, payload, params, scope):
    """Validate the complete response and allowlist fields before storage or delivery."""
    def check(condition):
        if not condition:
            raise InvalidSnapshot("The service returned an invalid response")

    check(isinstance(payload, dict))
    if kind in ("catalog", "allocations"):
        check(isinstance(payload.get("items"), list))
        check(all(_number(payload.get(k)) for k in ("total", "page", "size")))
        check(payload["page"] > 0 and payload["size"] > 0)
        check(len(payload["items"]) <= payload["size"] and len(payload["items"]) <= payload["total"])
        rows = []
        texts = (("id", "name", "category", "description", "asset_tag", "serial", "status")
                 if kind == "catalog" else ("id", "hardware_id", "project_id"))
        numbers = (("total", "reserved", "out", "version", "available", "unallocated")
                   if kind == "catalog" else ("quantity", "out", "version"))
        for item in payload["items"]:
            check(isinstance(item, dict))
            check(all(isinstance(item.get(k), str) for k in texts))
            check(all(_number(item.get(k)) for k in numbers))
            if kind == "catalog":
                check(_text(item["id"]) and _text(item["name"]))
            else:
                check(_text(item["hardware_id"]) and item["project_id"] == params["projectId"])
                hardware = params.get("hardware_id") or params.get("hardwareId")
                check(not hardware or item["hardware_id"] == hardware)
                check(item["out"] <= item["quantity"])
            row = {k: item[k] for k in (*texts, *numbers)}
            if kind == "catalog":
                row["_id"] = row["id"]
            rows.append(row)
        return {"items": rows, **{k: payload[k] for k in ("total", "page", "size")}}

    key = "projectInfo" if kind == "detail" else "projectList"
    values = [payload.get(key)] if kind == "detail" else payload.get(key)
    check(isinstance(values, list))
    result = []
    for item in values:
        check(isinstance(item, dict))
        check(all(_text(item.get(k)) for k in ("projectId", "projectName", "orgId")))
        check(item["orgId"] == scope)
        check(not params.get("projectId") or item["projectId"] == params["projectId"])
        members = item.get("joined_users")
        check(isinstance(members, list) and all(_text(member) for member in members))
        check(not params.get("userId") or params["userId"] in members)
        row = {k: item[k] for k in ("projectId", "projectName", "orgId", "joined_users")}
        if kind == "detail":
            check(isinstance(item.get("projectDesc"), str) and isinstance(item.get("creatorId"), str))
            check(_number(item.get("budget")) and isinstance(item.get("hardwareList"), list))
            hardware = []
            for allocation in item["hardwareList"]:
                check(isinstance(allocation, dict))
                check(_text(allocation.get("hardwareId")) and _number(allocation.get("allocation")))
                hardware.append({k: allocation[k] for k in ("hardwareId", "allocation")})
            row.update({k: item[k] for k in ("projectDesc", "creatorId", "budget")})
            row["hardwareList"] = hardware
        result.append(row)
    return {key: result[0] if kind == "detail" else result}


class Edge:
    def __init__(self, store=None, *, max_bytes=1024 * 1024, threshold=3, cooldown=30):
        self.store = store
        self.max_bytes = max_bytes
        self.threshold = threshold
        self.cooldown = cooldown
        self.metrics = Counter()
        self.breakers = {}
        self.lock = RLock()
        self.initialization_failed = False

    def count(self, name):
        with self.lock:
            self.metrics[name] += 1

    def health(self):
        with self.lock:
            return {"store": self.store.name if self.store else "off",
                    "initializationFailed": self.initialization_failed,
                    "metrics": dict(self.metrics),
                    "circuits": {service: {"failures": value[0], "open": value[1] > time.monotonic()}
                                 for service, value in self.breakers.items()}}

    def read(self, service, kind, scope, params, live):
        key = hashlib.sha256(json.dumps([1, service, kind, scope, params],
                            sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        try:
            with self.lock:
                failures, until = self.breakers.get(service, (0, 0))
            if until > time.monotonic():
                self.count("circuit_skips")
                raise EdgeUnavailable("Service circuit is open. Please try again shortly.")
            try:
                status, payload = live()
                if status >= 500:
                    raise EdgeUnavailable("Service is unavailable")
                if not 200 <= status < 300:
                    return status, payload
                payload = validate(kind, payload, params, scope)
            except RuntimeError as error:
                if getattr(error, "status_code", 0) < 500:
                    raise
                with self.lock:
                    failures = self.breakers.get(service, (0, 0))[0] + 1
                    self.breakers[service] = (failures, time.monotonic() + self.cooldown
                                              if failures >= self.threshold else 0)
                self.count("validation_failures" if isinstance(error, InvalidSnapshot) else "service_failures")
                raise
            with self.lock:
                self.breakers[service] = (0, 0)
            self.count("live_successes")
        except RuntimeError as error:
            if getattr(error, "status_code", 0) < 500:
                raise
            if self.store:
                try:
                    now = datetime.now(timezone.utc)
                    row = self.store.get(key, now)
                    if row and row["expiresAt"] > now:
                        payload = validate(kind, row["payload"], params, scope)
                        self.count("cache_hits")
                        return 200, {**payload, "meta": {"source": "cache", "stale": True,
                            "service": service, "savedAt": row["savedAt"].isoformat(),
                            "expiresAt": row["expiresAt"].isoformat()}}
                except Exception:
                    self.count("store_read_failures")
            self.count("cache_misses")
            raise
        now = datetime.now(timezone.utc)
        if self.store:
            if len(json.dumps(payload, allow_nan=False).encode()) <= self.max_bytes:
                try:
                    self.store.put({"_id": key, "payload": payload, "savedAt": now,
                                    "expiresAt": now + timedelta(seconds=AGES[kind])})
                    self.count("snapshot_writes")
                except Exception:
                    self.count("store_write_failures")
            else:
                self.count("oversize_skips")
        return status, {**payload, "meta": {"source": "live", "stale": False, "service": service}}


def create_edge():
    mode = os.getenv("EDGE_STORE", "auto").lower()
    if mode not in {"auto", "mongo", "memory", "off"}:
        raise ValueError("EDGE_STORE must be auto, mongo, memory or off")
    edge = Edge()
    if mode == "memory":
        edge.store = MemoryStore()
    elif mode in {"auto", "mongo"}:
        try:
            uri = os.getenv("EDGE_MONGO_URI") or os.getenv("MONGO_URI")
            if not uri:
                raise ValueError("Mongo URI is not configured")
            edge.store = MongoStore(uri, os.getenv("EDGE_MONGO_DATABASE", "Haas_db"))
        except Exception:
            # Never log connection strings or credentials.
            log.warning("Edge Mongo initialization failed; selected %s", "memory" if mode == "auto" else "off")
            edge.initialization_failed = True
            if mode == "auto":
                edge.store = MemoryStore()
    return edge
