"""Client for the hardware microservice."""

import os
import uuid
from urllib.parse import quote

import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv(
    "HARDWARE_API_BASE_URL",
    "https://hardware-app.nicecoast-3095250d.westus.azurecontainerapps.io/api",
).rstrip("/")
API_KEY = os.getenv("HARDWARE_API_KEY")
TIMEOUT_SECONDS = float(os.getenv("HARDWARE_API_TIMEOUT_SECONDS", "10"))


def _headers():
    if not API_KEY:
        raise RuntimeError("HARDWARE_API_KEY is not configured")
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": os.getenv("HARDWARE_API_ORIGIN", "http://localhost:5173"),
    }


def _request(method, path, *, json=None, params=None):
    headers = _headers()
    headers["Idempotency-Key"] = uuid.uuid4().hex
    try:
        response = requests.request(
            method,
            f"{BASE_URL}{path}",
            auth=("front-end", API_KEY),
            headers=headers,
            json=json,
            params=params,
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as error:
        raise RuntimeError(f"Hardware service is unreachable: {error}") from error
    try:
        payload = response.json()
    except ValueError:
        payload = {"error": response.text or "Hardware service returned no response"}
    return response.status_code, payload


def _hardware_id(item):
    return item.get("_id") or item.get("id") or item.get("asset_tag")


def get_all_hardware(params=None):
    """Return the complete hardware response, including pagination metadata."""
    status, payload = _request("GET", "/hardware", params=params)
    if status >= 400:
        raise RuntimeError(payload.get("detail") or payload.get("error") or "Hardware service request failed")
    return payload


def get_allocations(params=None):
    return _request("GET", "/allocations", params=params)


def set_allocation(hardware_id, project_id, data):
    return _request(
        "PUT",
        f"/hardware/{quote(hardware_id, safe='')}/allocations/{quote(project_id, safe='')}",
        json=data,
    )


def _find_hardware(name):
    payload = get_all_hardware(params={"size": 100})
    items = payload if isinstance(payload, list) else payload.get("items", [])
    return next((item for item in items if item["name"] == name), None)


def checkout_hardware(name, quantity, project_id, user_id, hardware_id=None):
    hardware = _find_hardware(name) if not hardware_id else None
    if not hardware_id and not hardware:
        return False, "Hardware set not found"
    status, payload = _request(
        "POST",
        "/checkouts",
        json={
            "hardware_id": hardware_id or _hardware_id(hardware),
            "project_id": project_id,
            "user_id": str(user_id),
            "quantity": quantity,
            "reason": f"Project {project_id} checkout",
        },
    )
    if status >= 400:
        return False, payload.get("detail") or payload.get("error") or "Hardware checkout failed"
    return True, "Checkout successful"


def checkin_hardware(name, quantity, project_id, user_id, hardware_id=None):
    hardware = _find_hardware(name) if not hardware_id else None
    if not hardware_id and not hardware:
        return False, "Hardware set not found"
    status, payload = _request(
        "GET",
        "/checkouts",
        params={
            "hardware_id": hardware_id or _hardware_id(hardware),
            "project_id": project_id,
            "user_id": str(user_id),
            "outstanding": "true",
            "size": 100,
        },
    )
    if status >= 400:
        return False, payload.get("detail") or payload.get("error") or "Unable to find checkout"
    records = payload.get("items", payload if isinstance(payload, list) else [])
    remaining = quantity
    for record in records:
        outstanding = record.get("quantity", 0) - record.get("returned", 0)
        amount = min(remaining, outstanding)
        if amount <= 0:
            continue
        checkout_id = record.get("_id") or record.get("id")
        status, payload = _request(
            "POST",
            f"/checkouts/{checkout_id}/returns",
            json={
                "expected_version": record["version"],
                "reason": f"Project {project_id} check-in",
                "quantity": amount,
            },
        )
        if status >= 400:
            return False, payload.get("detail") or payload.get("error") or "Hardware check-in failed"
        remaining -= amount
        if remaining == 0:
            return True, "Check-in successful"
    return False, "Cannot return more than this project has checked out"
