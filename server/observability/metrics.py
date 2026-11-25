"""In-process metrics: latency, payload size, failures, validation rejections, freshness."""
import threading
import time
from collections import defaultdict, deque

_lock = threading.Lock()
_latency = defaultdict(lambda: deque(maxlen=500))  # service -> ms samples
_calls = defaultdict(int)
_failures = defaultdict(int)
_last_success = {}
_last_failure = {}
_payload = {}  # "service.endpoint" -> last sizeBytes
_rejections = defaultdict(int)  # rule -> count
_fallbacks = defaultdict(int)


def record_call(service, ms, ok):
    with _lock:
        _calls[service] += 1
        _latency[service].append(ms)
        if ok:
            _last_success[service] = time.time()
        else:
            _failures[service] += 1
            _last_failure[service] = time.time()


def record_payload(service, endpoint, size_bytes):
    with _lock:
        _payload[f"{service}.{endpoint}"] = size_bytes


def record_rejection(rule, n=1):
    with _lock:
        _rejections[rule] += n


def record_fallback(service):
    with _lock:
        _fallbacks[service] += 1


def _pct(samples, p):
    if not samples:
        return None
    s = sorted(samples)
    return round(s[min(len(s) - 1, int(len(s) * p))], 1)


def _iso(ts):
    return None if ts is None else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def snapshot():
    with _lock:
        services = {}
        for svc in set(_calls) | set(_last_success) | set(_fallbacks):
            services[svc] = {
                "calls": _calls[svc],
                "failures": _failures[svc],
                "fallbacksServed": _fallbacks[svc],
                "latencyMs": {"p50": _pct(_latency[svc], 0.5), "p95": _pct(_latency[svc], 0.95)},
                "lastSuccess": _iso(_last_success.get(svc)),
                "lastFailure": _iso(_last_failure.get(svc)),
            }
        return {"services": services, "payloadBytes": dict(_payload), "rejections": dict(_rejections)}
