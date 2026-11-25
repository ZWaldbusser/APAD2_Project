"""Browser routes for the Projects API contract (gRPC transport)."""

from flask import Blueprint, jsonify, request
from gateway.core import read_through
from gateway.policy import mappers, validators
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
        org_id = request.args.get("orgId", "")
        status, payload = read_through(
            "projects", "getProject", org_id, {"projectId": project_id},
            fetch=lambda: get_project(project_id, org_id)[1],
            validate=validators.validate_project(org_id),
            mapper=mappers.map_project_info,
        )
        return jsonify(payload), status

    @routes.route("/projects/create_project", methods=["POST"])
    @token_required
    def create():
        status, payload = create_project(request.get_json(silent=True) or {})
        return jsonify(payload), status

    @routes.route("/projects/join_project", methods=["POST"])
    @token_required
    def join():
        status, payload = join_project(request.get_json(silent=True) or {})
        return jsonify(payload), status

    @routes.route("/projects/leave_project", methods=["POST"])
    @token_required
    def leave():
        status, payload = leave_project(request.get_json(silent=True) or {})
        return jsonify(payload), status

    @routes.route("/projects/search_project", methods=["POST"])
    @token_required
    def search():
        body = request.get_json(silent=True) or {}
        status, payload = read_through(
            "projects", "searchProjects", body.get("orgId"), body,
            fetch=lambda: search_projects(body)[1],
            validate=validators.validate_project_list,
            mapper=mappers.map_project_list,
        )
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
        status, payload = get_budget_context(request.get_json(silent=True) or {})
        return jsonify(payload), status

    return routes
