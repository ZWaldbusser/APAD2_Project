"""gRPC transport for the Users service: registration, login, two-factor, profile, token checks."""

import os
import time
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import grpc
from dotenv import load_dotenv

from users import users_pb2 as messages
from users import users_pb2_grpc as services

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DEFAULT_TARGET = "apad-users-grpc.bluedesert-b9b6bdd4.westus.azurecontainerapps.io:443"

# Only read-only calls are retried. Retrying login or a 2FA code could double-submit
# (a one-time code that already succeeded would then be rejected as reused).
_RETRY_SAFE = {"GetProfile", "ValidateAccessToken"}


class UsersServiceError(RuntimeError):
    def __init__(self, message, status_code=503):
        super().__init__(message)
        self.status_code = status_code


_HTTP_STATUS = {
    grpc.StatusCode.INVALID_ARGUMENT: 400,
    grpc.StatusCode.FAILED_PRECONDITION: 400,
    grpc.StatusCode.UNAUTHENTICATED: 401,
    grpc.StatusCode.PERMISSION_DENIED: 403,
    grpc.StatusCode.NOT_FOUND: 404,
    grpc.StatusCode.ALREADY_EXISTS: 409,
    grpc.StatusCode.RESOURCE_EXHAUSTED: 429,
    grpc.StatusCode.DEADLINE_EXCEEDED: 504,
}


def _endpoint(value):
    """Convert a service address into a gRPC authority, using TLS by default."""
    parsed = urlsplit(value if "://" in value else "https://" + value)
    if (parsed.scheme not in ("https", "grpcs", "http", "grpc")
            or not parsed.hostname or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment or parsed.username or parsed.password):
        raise UsersServiceError("USERS_GRPC_TARGET must be a host[:port] without a path")
    secure = parsed.scheme in ("https", "grpcs")
    try:
        port = parsed.port or (443 if secure else 80)
    except ValueError as error:
        raise UsersServiceError("Invalid users gRPC port") from error
    host = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
    return f"{host}:{port}", secure


@lru_cache(maxsize=4)
def _stub(target, secure):
    channel = (grpc.secure_channel(target, grpc.ssl_channel_credentials())
               if secure else grpc.insecure_channel(target))
    return services.UsersServiceStub(channel)


def call(method, request):
    target, secure = _endpoint(os.getenv("USERS_GRPC_TARGET", DEFAULT_TARGET).strip())
    try:
        # The hosted service can scale to zero, so the first call may take a while.
        timeout = float(os.getenv("USERS_API_TIMEOUT_SECONDS", "30"))
        if not 0 < timeout < float("inf"):
            raise ValueError()
    except ValueError as error:
        raise UsersServiceError("USERS_API_TIMEOUT_SECONDS must be positive and finite") from error
    rpc = getattr(_stub(target, secure), method)
    deadline = time.monotonic() + timeout
    attempts = 2 if method in _RETRY_SAFE else 1
    for attempt in range(attempts):
        try:
            return rpc(request, timeout=max(deadline - time.monotonic(), 0))
        except grpc.RpcError as error:
            if (attempt + 1 < attempts and error.code() == grpc.StatusCode.UNAVAILABLE
                    and time.monotonic() < deadline):
                continue
            status = _HTTP_STATUS.get(error.code(), 503)
            message = (error.details() if status < 500 else None) or "Users service is unavailable. Please try again."
            raise UsersServiceError(message, status) from error


# ---- JSON shapes match the Users HTTP contract the frontend already uses ----

def _user(u):
    return {
        "id": u.id,
        "username": u.username,
        "agencyCode": u.agency_code,
        "agencyName": u.agency_name,
        "twoFactorEnabled": u.two_factor_enabled,
        "createdAt": u.created_at,
    }


def register(agency_code, username, password):
    r = call("Register", messages.RegisterRequest(
        agency_code=agency_code, username=username, password=password))
    return {"user": _user(r.user)}


def login(username, password):
    r = call("Login", messages.LoginRequest(username=username, password=password))
    return {"mfaToken": r.mfa_token, "nextStep": r.next_step}


def setup_two_factor(mfa_token):
    r = call("SetupTwoFactor", messages.SetupTwoFactorRequest(mfa_token=mfa_token))
    return {"secret": r.secret, "otpauthUrl": r.otpauth_url, "qrCodeDataUrl": r.qr_code_data_url}


def enable_two_factor(mfa_token, code):
    r = call("EnableTwoFactor", messages.TwoFactorCodeRequest(mfa_token=mfa_token, code=code))
    return {"accessToken": r.access_token, "user": _user(r.user)}


def verify_two_factor(mfa_token, code):
    r = call("VerifyTwoFactor", messages.TwoFactorCodeRequest(mfa_token=mfa_token, code=code))
    return {"accessToken": r.access_token, "user": _user(r.user)}


def get_profile(access_token):
    r = call("GetProfile", messages.AccessTokenRequest(access_token=access_token))
    return {"user": _user(r.user)}


def validate_access_token(access_token):
    """Returns (user_id, agency_code) for a valid access token; raises UsersServiceError otherwise."""
    r = call("ValidateAccessToken", messages.ValidateAccessTokenRequest(access_token=access_token))
    return r.user_id, r.agency_code