"""Isolate gateway route tests from real authentication, MongoDB and breakers."""
from unittest.mock import patch

import app
from edge import store as edge
from gateway import resilience


def isolate_routes(case):
    auth = patch.object(app, "validate_access_token", return_value=("user-1", "DAL"))
    case.auth = auth.start()
    case.addCleanup(auth.stop)
    store = patch.object(edge, "_store", edge.MemoryStore())
    store.start()
    case.addCleanup(store.stop)
    breakers = patch.dict(resilience._breakers, {}, clear=True)
    breakers.start()
    case.addCleanup(breakers.stop)
    case.headers = {"Authorization": "Bearer test-access-token"}
