"""gRPC transport for hardware inventory, allocations, checkout, and check-in."""

import base64
import os
import time
import uuid
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import grpc
from dotenv import load_dotenv

from hardware import hardware_pb2 as messages
from hardware import hardware_pb2_grpc as services

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class HardwareServiceError(RuntimeError):
    def __init__(self, message, status_code=503):
        super().__init__(message)
        self.status_code = status_code


_HTTP_STATUS = {
    grpc.StatusCode.INVALID_ARGUMENT: 400,
    grpc.StatusCode.UNAUTHENTICATED: 401,
    grpc.StatusCode.PERMISSION_DENIED: 403,
    grpc.StatusCode.NOT_FOUND: 404,
    grpc.StatusCode.FAILED_PRECONDITION: 400,
    grpc.StatusCode.ABORTED: 409,
    grpc.StatusCode.ALREADY_EXISTS: 409,
    grpc.StatusCode.RESOURCE_EXHAUSTED: 429,
}


def _endpoint(value):
    """Convert a service URL into a gRPC authority, using TLS by default."""
    if not value:
        raise HardwareServiceError("HARDWARE_API_BASE_URL_grpc is not configured")
    parsed = urlsplit(value if "://" in value else "https://" + value)
    if (parsed.scheme not in ("https", "grpcs", "http", "grpc")
            or not parsed.hostname or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment or parsed.username or parsed.password):
        raise HardwareServiceError(
            "HARDWARE_API_BASE_URL_grpc must be a host[:port] or service URL without an API path"
        )
    secure = parsed.scheme in ("https", "grpcs")
    try:
        port = parsed.port or (443 if secure else 80)
    except ValueError as error:
        raise HardwareServiceError("Invalid hardware gRPC port") from error
    host = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
    return f"{host}:{port}", secure


@lru_cache(maxsize=4)
def _stub(target, secure):
    channel = (grpc.secure_channel(target, grpc.ssl_channel_credentials())
               if secure else grpc.insecure_channel(target))
    return services.HardwareServiceStub(channel)


def call(method, request):
    """Send protobuf messages; a transient retry reuses the same request ID."""
    target, secure = _endpoint(os.getenv("HARDWARE_API_BASE_URL_grpc", "").strip())
    key = os.getenv("HARDWARE_API_KEY")
    if not key:
        raise HardwareServiceError("HARDWARE_API_KEY is not configured")
    team = os.getenv("HARDWARE_API_TEAM", "front-end")
    credentials = base64.b64encode(f"{team}:{key}".encode()).decode("ascii")
    metadata = (("authorization", f"Basic {credentials}"),)
    if "request_id" in request.DESCRIPTOR.fields_by_name:
        if not request.request_id:
            request.request_id = uuid.uuid4().hex
        metadata += (("idempotency-key", request.request_id),)
    try:
        timeout = float(os.getenv("HARDWARE_API_TIMEOUT_SECONDS", "10"))
        if not 0 < timeout < float("inf"):
            raise ValueError()
    except ValueError as error:
        raise HardwareServiceError("HARDWARE_API_TIMEOUT_SECONDS must be positive and finite") from error
    rpc = getattr(_stub(target, secure), method)
    deadline = time.monotonic() + timeout
    for attempt in range(2):
        try:
            return rpc(request, metadata=metadata, timeout=max(deadline - time.monotonic(), 0))
        except grpc.RpcError as error:
            if (attempt == 0 and error.code() == grpc.StatusCode.UNAVAILABLE
                    and time.monotonic() < deadline):
                continue
            raise HardwareServiceError(
                error.details() or "Hardware service request failed",
                _HTTP_STATUS.get(error.code(), 503),
            ) from error


def find_hardware(name):
    page = 1
    while True:
        result = call("ListHardware", messages.ListHardwareRequest(q=name, page=page, size=100))
        for item in result.items:
            if item.name == name:
                return item
        if not result.items or page * (result.size or 100) >= result.total:
            return None
        page += 1


def outstanding_checkouts(hardware_id, project_id, user_id):
    """Read all matching pages before returns change the outstanding result set."""
    records = []
    page = 1
    while True:
        result = call("ListCheckouts", messages.ListCheckoutsRequest(
            hardware_id=hardware_id, project_id=project_id, user_id=str(user_id),
            outstanding=True, page=page, size=100,
        ))
        records.extend(result.items)
        if not result.items or page * (result.size or 100) >= result.total:
            return records
        page += 1
