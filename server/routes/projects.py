"""Browser routes for the Projects API contract (gRPC transport)."""

from flask import Blueprint, jsonify, request
from request_scope import agency_data, json_object, reject, require_text
from projects.client import (
    create_project, join_project, leave_project,
    search_projects, get_project, get_unit_price,
    get_department_spend, get_budget_context,
)


def create_blueprint(token_required):
    routes = Blueprint("projects", __name__)

    @routes.route("/projects/<project_id>", methods=["GET"])
    @token_required
    def project_detail(project_id):
        org_id = agency_data(request.args)["orgId"]
        status, payload = get_project(project_id, org_id)
        return jsonify(payload), status

    @routes.route("/projects/create_project", methods=["POST"])
    @token_required
    def create():
        data = agency_data(json_object())
        data["creatorId"] = request.user_id
        require_text(data, "projectId", "projectName", "projectDesc")
        if type(data.get("budget")) is not int or not 0 <= data["budget"] <= 2**63 - 1:
            reject("Budget must be a nonnegative whole-dollar amount")
        items = data.get("hardwareList", [])
        if not isinstance(items, list):
            reject("hardwareList must be a list")
        for item in items:
            if not isinstance(item, dict):
                reject("Each hardware allocation must be an object")
            require_text(item, "hardwareId")
            if type(item.get("allocation")) is not int or not 0 < item["allocation"] <= 2**31 - 1:
                reject("Each allocation must be a positive whole number")
        status, payload = create_project(data)
        return jsonify(payload), status

    @routes.route("/projects/join_project", methods=["POST"])
    @token_required
    def join():
        data = agency_data(json_object())
        data["userId"] = request.user_id
        require_text(data, "projectId")
        status, payload = join_project(data)
        return jsonify(payload), status

    @routes.route("/projects/leave_project", methods=["POST"])
    @token_required
    def leave():
        data = agency_data(json_object())
        data["userId"] = request.user_id
        require_text(data, "projectId")
        status, payload = leave_project(data)
        return jsonify(payload), status

    @routes.route("/projects/search_project", methods=["POST"])
    @token_required
    def search():
        data = agency_data(json_object())
        if any(data.get(key) not in (None, "") for key in ("userId", "user_id")):
            data["userId"] = request.user_id
        data.pop("user_id", None)
        status, payload = search_projects(data)
        return jsonify(payload), status

    @routes.route("/get_unit_price", methods=["POST"])
    @token_required
    def unit_price():
        status, payload = get_unit_price(request.get_json(silent=True) or {})
        return jsonify(payload), status

    @routes.route("/get_department_spend", methods=["POST"])
    @token_required
    def department_spend():
        status, payload = get_department_spend(request.get_json(silent=True) or {})
        return jsonify(payload), status

    @routes.route("/get_budget_context", methods=["POST"])
    @token_required
    def budget_context():
        status, payload = get_budget_context(agency_data(json_object()))
        return jsonify(payload), status

    return routes
