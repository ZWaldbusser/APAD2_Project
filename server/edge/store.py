"""Edge snapshot store: interface + implementations. The store is replaceable; the policy is the design."""
import hashlib
import json
import logging
import threading
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone

import config

log = logging.getLogger("edge")
SCHEMA_VERSION = 1


def make_key(service, endpoint, org_id, params):
    digest = hashlib.sha1(json.dumps(params or {}, sort_keys=True, default=str).encode()).hexdigest()[:12]
    return f"{service}|{endpoint}|{org_id or '-'}|{digest}"


class SnapshotStore(ABC):
    @abstractmethod
    def get(self, key):
        """Return the stored document or None (expired counts as None)."""

    @abstractmethod
    def put(self, key, doc, ttl_seconds):
        ...

    def ping(self):
        return True


def build_doc(service, endpoint, org_id, payload, size_bytes):
    return {
        "service": service,
        "endpoint": endpoint,
        "orgId": org_id,
        "payload": payload,
        "fetchedAt": datetime.now(timezone.utc),
        "sizeBytes": size_bytes,
        "schemaVersion": SCHEMA_VERSION,
    }


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class MemoryStore(SnapshotStore):
    """Per-process; for tests and when Mongo is unavailable. Lost on restart."""

    def __init__(self):
        self._d, self._lock = {}, threading.Lock()

    def get(self, key):
        with self._lock:
            doc = self._d.get(key)
        if doc and doc["expiresAt"] > datetime.now(timezone.utc):
            return doc
        return None

    def put(self, key, doc, ttl_seconds):
        doc = dict(doc, expiresAt=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds))
        with self._lock:
            self._d[key] = doc


class MongoStore(SnapshotStore):
    def __init__(self, database):
        self._col = database[config.EDGE_COLLECTION]
        # TTL index: Mongo deletes a doc once expiresAt has passed (reaper runs about every 60s).
        self._col.create_index("expiresAt", expireAfterSeconds=0)

    def get(self, key):
        doc = self._col.find_one({"_id": key})
        if doc and _aware(doc["expiresAt"]) > datetime.now(timezone.utc):
            doc["fetchedAt"] = _aware(doc["fetchedAt"])
            return doc
        return None

    def put(self, key, doc, ttl_seconds):
        doc = dict(doc, expiresAt=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds))
        self._col.replace_one({"_id": key}, doc, upsert=True)

    def ping(self):
        self._col.database.client.admin.command("ping")
        return True


_store = None  # None = not initialised, False = disabled


def get_store():
    """Lazy singleton. Never raises: on any problem we degrade to today's behaviour or memory."""
    global _store
    if _store is not None:
        return _store or None
    mode = config.EDGE_STORE
    if mode == "off":
        _store = False
        return None
    if mode in ("auto", "mongo"):
        try:
            from edge import mongo

            if mongo.client is None:
                raise RuntimeError("MONGO_URI not set")
            mongo.ping()
            _store = MongoStore(mongo.client[config.EDGE_DB])
            log.info("edge store: MongoDB (%s.%s)", config.EDGE_DB, config.EDGE_COLLECTION)
            return _store
        except Exception as error:  # noqa: BLE001
            log.warning("edge store: Mongo unavailable (%s)", error)
            if mode == "mongo":
                _store = False
                return None
    _store = MemoryStore()
    log.warning("edge store: using in-memory fallback (snapshots lost on restart)")
    return _store


def set_store(store):
    """Test hook."""
    global _store
    _store = store
