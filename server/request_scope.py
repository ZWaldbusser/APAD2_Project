"""Trusted agency context for protected browser-to-provider operations."""
from flask import abort, jsonify, make_response, request


def reject(message, status=400):
    abort(make_response(jsonify({"error": message}), status))


def json_object():
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        reject("Request body must be an object")
    return dict(data)


def agency_data(data):
    """Reject foreign context, then supply the verified agency even if omitted."""
    data = dict(data)
    for key in ("orgId", "org_id"):
        if data.get(key) not in (None, "", request.agency_code):
            reject("This operation is limited to your verified agency", 403)
    data.pop("org_id", None)
    data["orgId"] = request.agency_code
    return data


def require_text(data, *fields):
    for field in fields:
        if not isinstance(data.get(field), str) or not data[field].strip():
            reject(f"{field} is required")
