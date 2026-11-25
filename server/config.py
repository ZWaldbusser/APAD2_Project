"""All gateway tunables in one place (env-overridable)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _f(name, default):
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return float(default)


EDGE_STORE = os.getenv("EDGE_STORE", "auto")  # auto | mongo | memory | off
EDGE_DB = os.getenv("EDGE_DB", "Haas_db")  # database that holds snapshots
EDGE_COLLECTION = os.getenv("EDGE_COLLECTION", "edge_snapshots")

# Hard expiry per endpoint (seconds): how long a last-known-good snapshot may be served.
SNAPSHOT_TTL = {
    "listHardware": int(_f("TTL_CATALOG", 24 * 3600)),
    "listAllocations": int(_f("TTL_ALLOCATIONS", 3600)),
    "getProject": int(_f("TTL_PROJECTS", 6 * 3600)),
    "searchProjects": int(_f("TTL_PROJECTS", 6 * 3600)),
}
DEFAULT_TTL = 3600
MAX_PAYLOAD_BYTES = int(_f("MAX_PAYLOAD_BYTES", 2_000_000))

BREAKER_FAILURES = int(_f("BREAKER_FAILURES", 5))
BREAKER_COOLDOWN_SECONDS = _f("BREAKER_COOLDOWN_SECONDS", 20)

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]
