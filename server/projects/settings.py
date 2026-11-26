"""Deadline shared by the existing Projects gRPC and budget HTTP transports."""
import math
import os


def timeout_seconds():
    try:
        configured = float(os.getenv("PROJECTS_API_TIMEOUT_SECONDS", "60"))
    except ValueError as error:
        raise ValueError("PROJECTS_API_TIMEOUT_SECONDS must be positive and finite") from error
    if not math.isfinite(configured) or configured <= 0:
        raise ValueError("PROJECTS_API_TIMEOUT_SECONDS must be positive and finite")
    # The source can take ~35 seconds to wake. Old 10-second settings must not
    # silently restore the known cold-start failure after upgrading the adapter.
    return max(60.0, configured)
