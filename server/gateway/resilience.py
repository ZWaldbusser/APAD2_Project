"""Per-upstream circuit breaker + timing wrapper."""
import threading
import time

import config
from observability import metrics


class CircuitOpen(RuntimeError):
    status_code = 503


class CircuitBreaker:
    def __init__(self, name):
        self.name, self.failures, self.opened_at = name, 0, None
        self._lock = threading.Lock()

    @property
    def state(self):
        if self.opened_at is None:
            return "closed"
        return "half-open" if time.monotonic() - self.opened_at >= config.BREAKER_COOLDOWN_SECONDS else "open"

    def allow(self):
        return self.state != "open"

    def success(self):
        with self._lock:
            self.failures, self.opened_at = 0, None

    def failure(self):
        with self._lock:
            self.failures += 1
            if self.failures >= config.BREAKER_FAILURES or self.opened_at is not None:
                self.opened_at = time.monotonic()  # open, or re-open after a failed half-open probe


_breakers = {}


def breaker(service):
    return _breakers.setdefault(service, CircuitBreaker(service))


def breaker_states():
    return {name: b.state for name, b in _breakers.items()}


def is_upstream_down(error):
    """Only availability problems trip the breaker / fall back; 4xx are real answers."""
    return getattr(error, "status_code", 503) >= 500


def guarded_call(service, fn):
    """Run fn() through breaker + timing. Raises CircuitOpen without calling when open."""
    b = breaker(service)
    if not b.allow():
        raise CircuitOpen(f"{service} circuit open")
    start = time.perf_counter()
    try:
        result = fn()
    except Exception as error:  # noqa: BLE001
        down = is_upstream_down(error)
        metrics.record_call(service, (time.perf_counter() - start) * 1000, ok=not down)
        b.failure() if down else b.success()
        raise
    metrics.record_call(service, (time.perf_counter() - start) * 1000, ok=True)
    b.success()
    return result
