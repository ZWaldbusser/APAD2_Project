"""Hardware routes. Reads go through the gateway (validate -> map -> snapshot -> stale fallback).

Writes (checkout, check-in, allocation) are deliberately NOT cached or queued: stale inventory
must never drive a write, so they fail closed when Hardware or Projects is down.
"""
from flask import Blueprint, jsonify, request

from services import hardware as hardware_db
from gateway.core import read_through
from gateway.policy import mappers, validators
from projects.client import query_project as _query_project


def create_blueprint(token_required):
    bp = Blueprint("hardware", __name__)

    @bp.route("/api/hardware", methods=["POST"])
    def get_hardware():
        data = request.get_json(silent=True)
        if data is None:
            data = {}
        if not isinstance(data, dict):
            return jsonify({"error": "Hardware list request body must be an object"}), 400
        status, body = read_through(
            "hardware", "listHardware", None, data,
            fetch=lambda: hardware_db.get_all_hardware(params=data),
            validate=validators.validate_hardware_page,
            mapper=mappers.map_page(mappers.HARDWARE_ITEM_KEEP),
        )
        return jsonify(body), status

    @bp.route("/api/listAllocations", methods=["POST"])
    @token_required
    def get_allocations():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Allocation list request body is required"}), 400
        project_id = data.get("project_id", data.get("projectId"))
        status, body = read_through(
            "hardware", "listAllocations", data.get("orgId"), data,
            fetch=lambda: hardware_db.get_allocations(params=data)[1],
            validate=validators.validate_allocation_page(project_id),
            mapper=mappers.map_page(mappers.ALLOCATION_KEEP),
        )
        return jsonify(body), status

    def _movement(action):
        data = request.get_json(silent=True)
        if not data or "name" not in data or "quantity" not in data or "projectId" not in data:
            return jsonify({"error": "name, quantity, and projectId are required"}), 400
        if type(data["quantity"]) is not int or data["quantity"] <= 0:
            return jsonify({"error": "quantity must be a positive integer"}), 400
        if not _query_project(data["projectId"], data.get("orgId")):
            return jsonify({"error": "Project not found"}), 404
        success, message = action(
            data["name"], data["quantity"], data["projectId"], request.user_id,
            hardware_id=data.get("hardwareId"),
        )
        if not success:
            return jsonify({"error": message}), 400
        return jsonify({"message": message}), 200

    @bp.route("/api/hardware/checkout", methods=["POST"])
    @token_required
    def checkout_hardware():
        return _movement(hardware_db.checkout_hardware)

    @bp.route("/api/hardware/checkin", methods=["POST"])
    @token_required
    def checkin_hardware():
        return _movement(hardware_db.checkin_hardware)

    @bp.route("/api/hardware/<hardware_id>/allocations/<project_id>", methods=["POST"])
    @token_required
    def set_allocation(hardware_id, project_id):
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Allocation request body is required"}), 400
        if type(data.get("quantity")) is not int or not 0 <= data["quantity"] <= 1000000:
            return jsonify({"error": "quantity must be an integer between 0 and 1000000"}), 400
        if type(data.get("expected_version")) is not int or not 1 <= data["expected_version"] <= 1000000:
            return jsonify({"error": "expected_version must be an integer between 1 and 1000000"}), 400
        if not isinstance(data.get("reason"), str) or not 3 <= len(data["reason"]) <= 1000:
            return jsonify({"error": "reason must be between 3 and 1000 characters"}), 400
        if not _query_project(project_id, data.get("orgId")):
            return jsonify({"error": "Project not found"}), 404
        status, payload = hardware_db.set_allocation(hardware_id, project_id, {
            "expected_version": data["expected_version"],
            "reason": data["reason"],
            "quantity": data["quantity"],
        })
        return jsonify(payload), status

    return bp
