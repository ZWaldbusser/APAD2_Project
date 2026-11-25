# Flask entry point for the Users, Projects, and Hardware API adapters.

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from projects.client import ProjectsServiceError
from routes.projects import create_blueprint as create_projects_blueprint
from gateway.routes.hardware import create_blueprint as create_hardware_blueprint
from gateway.routes.health import create_blueprint as create_health_blueprint
import config
from hardware.client import HardwareServiceError
from routes.users import create_blueprint as create_users_blueprint
from users.client import UsersServiceError, validate_access_token

from functools import wraps

app = Flask(__name__)
CORS(app, origins=config.CORS_ORIGINS)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_DIST = os.path.abspath(os.path.join(BASE_DIR, "..", "client", "dist"))
CLIENT_BUILD_EXISTS = os.path.isdir(CLIENT_DIST)

@app.errorhandler(RuntimeError)
def handle_runtime_error(error):
    return jsonify({"error": str(error)}), 503


@app.errorhandler(ProjectsServiceError)
@app.errorhandler(HardwareServiceError)
@app.errorhandler(UsersServiceError)
def handle_upstream_service_error(error):
    return jsonify({"error": str(error)}), error.status_code


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header else None
        if not token:
            return jsonify({"error": "Missing token"}), 401

        # Access tokens from the Users service (2FA login), checked by its gRPC API.
        try:
            request.user_id, request.agency_code = validate_access_token(token)
        except UsersServiceError as error:
            if error.status_code == 401:
                return jsonify({"error": "Invalid or expired token"}), 401
            raise  # service unavailable etc. -> handled as 503, never allowed through
        return f(*args, **kwargs)
    return decorated

# Health check route to confirm the server is running

@app.route("/", methods=["GET"])
def home():
    if CLIENT_BUILD_EXISTS:
        return send_from_directory(CLIENT_DIST, "index.html")
    return jsonify({"message": "Flask server is running"}), 200


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react_app(path):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404

    if CLIENT_BUILD_EXISTS:
        candidate_path = os.path.join(CLIENT_DIST, path)
        if path and os.path.isfile(candidate_path):
            return send_from_directory(CLIENT_DIST, path)
        return send_from_directory(CLIENT_DIST, "index.html")

    return jsonify({"error": "Not found"}), 404


app.register_blueprint(create_users_blueprint(), url_prefix="/api/users-service")
app.register_blueprint(create_projects_blueprint(token_required), url_prefix="/api/projects-service")


app.register_blueprint(create_hardware_blueprint(token_required))
app.register_blueprint(create_health_blueprint())


if __name__ == "__main__":
    app.run(
        debug=os.getenv("FLASK_DEBUG") == "1",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5050)),
    )