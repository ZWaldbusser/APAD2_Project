"""Read-through gateway: live -> validate -> map -> snapshot -> meta; on upstream outage serve snapshot."""
import json
import logging
from datetime import datetime, timezone

import config
from edge import store as edge
from gateway.resilience import CircuitOpen, guarded_call, is_upstream_down
from observability import metrics

log = logging.getLogger("gateway")


def _meta(source, fetched_at, service, stale):
    age = max(int((datetime.now(timezone.utc) - fetched_at).total_seconds()), 0)
    return {"source": source, "stale": stale, "service": service,
            "fetchedAt": fetched_at.isoformat(), "ageSeconds": age}


def read_through(service, endpoint, org_id, params, fetch, validate, mapper):
    """fetch() -> payload dict. Returns (http_status, body_with_meta).

    org_id + params are part of the snapshot key (tenant isolation). Upstream 4xx answers are
    re-raised unchanged. The `meta` block is additive: existing top-level keys are untouched.
    """
    st = edge.get_store()
    key = edge.make_key(service, endpoint, org_id, params)
    try:
        raw = guarded_call(service, fetch)
        payload = mapper(validate(raw))
    except ValueError as error:  # validator rejected the whole payload
        log.error("validation rejected %s.%s: %s", service, endpoint, error)
        return _fallback(st, key, service, RuntimeError(f"{service} returned invalid data"))
    except RuntimeError as error:
        if not (isinstance(error, CircuitOpen) or is_upstream_down(error)):
            raise  # real 4xx answer, not an outage
        return _fallback(st, key, service, error)

    size = len(json.dumps(payload, default=str).encode())
    metrics.record_payload(service, endpoint, size)
    oversize = size > config.MAX_PAYLOAD_BYTES
    if oversize:
        metrics.record_rejection(f"{service}.size_guard")
        payload = dict(payload, truncated=True)
    if st is not None and not oversize:
        try:
            st.put(key, edge.build_doc(service, endpoint, org_id, payload, size),
                   config.SNAPSHOT_TTL.get(endpoint, config.DEFAULT_TTL))
        except Exception as error:  # noqa: BLE001  store failure must never break the live path
            log.warning("snapshot write failed: %s", error)
    return 200, dict(payload, meta=_meta("live", datetime.now(timezone.utc), service, False))


def _fallback(st, key, service, error):
    doc = None
    if st is not None:
        try:
            doc = st.get(key)
        except Exception as store_error:  # noqa: BLE001
            log.warning("snapshot read failed: %s", store_error)
    if doc is None:
        raise error
    metrics.record_fallback(service)
    return 200, dict(doc["payload"], meta=_meta("cache", doc["fetchedAt"], service, True))
