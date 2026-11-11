"""Browser routes for the Projects API contract."""

from urllib.parse import quote

from flask import Blueprint, jsonify, request
from services import projects


def create_blueprint(token_required):
    routes = Blueprint("projects", __name__)

    def forward(path):
        status, payload = projects.call(
            request.method, path,
            data=request.get_json(silent=True) if request.method == "POST" else None,
            params=request.args.to_dict(),
        )
        return jsonify(payload), status

    @routes.route("/projects/<project_id>", methods=["GET"])
    @token_required
    def get_project(project_id):
        return forward(f"/projects/{quote(project_id, safe='')}")

    for action in ("create_project", "join_project", "leave_project"):
        routes.add_url_rule(
            f"/projects/{action}", endpoint=action,
            view_func=token_required(lambda action=action: forward(f"/projects/{action}")),
            methods=["POST"],
        )
    routes.add_url_rule(
        "/projects/search_project", endpoint="search_project",
        view_func=token_required(lambda: forward("/projects/search_project")),
        methods=["POST"],
    )
    for action in ("get_unit_price", "get_department_spend", "get_budget_context"):
        routes.add_url_rule(
            f"/{action}", endpoint=action,
            view_func=token_required(lambda action=action: forward(f"/{action}")), methods=["POST"],
        )
    return routes
