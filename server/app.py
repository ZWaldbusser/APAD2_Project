# Flask entry point for MongoDB users and the Projects/Hardware API adapters.

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db
import usersDatabase as users_db
from services import projects as projects_api
from routes.projects import create_blueprint as create_projects_blueprint
import hardwareDatabase as hardware_db
from hardware.client import HardwareServiceError

import jwt
import datetime
from functools import wraps

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_DIST = os.path.abspath(os.path.join(BASE_DIR, "..", "client", "dist"))
CLIENT_BUILD_EXISTS = os.path.isdir(CLIENT_DIST)

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is not set in .env")


@app.errorhandler(RuntimeError)
def handle_runtime_error(error):
    return jsonify({"error": str(error)}), 503


@app.errorhandler(projects_api.ProjectsServiceError)
@app.errorhandler(HardwareServiceError)
def handle_upstream_service_error(error):
    return jsonify({"error": str(error)}), error.status_code


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header else None
        if not token:
            return jsonify({"error": "Missing token"}), 401
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            request.user_id = payload["user_id"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
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


@app.route("/api/health/db", methods=["GET"])
def db_health():
    """Quick way to confirm the server can actually reach MongoDB."""
    try:
        db.ping()
        return jsonify({"database": "connected", "db_name": db.db.name}), 200
    except Exception as e:
        return jsonify({"database": "unreachable", "error": str(e)}), 503


# user routes (signup, login, fetch users)

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json()

    if not data or "userID" not in data or "password" not in data:
        return jsonify({"error": "userid and password are required"}), 400

    new_id = users_db.create_user(data["userID"], data["password"])

    if new_id is None:
        return jsonify({"error": "userid already exists"}), 409

    return jsonify({"message": "User created", "id": new_id}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data or "userid" not in data or "password" not in data:
        return jsonify({"error": "userid and password are required"}), 400

    user_id = users_db.verify_login(data["userid"], data["password"])

    if not user_id:
        return jsonify({"error": "Invalid userid or password"}), 401

    token = jwt.encode(
        {
            "user_id": user_id,
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24),
        },
        SECRET_KEY,
        algorithm="HS256",
    )
    return jsonify({"message": "Login successful", "token": token}), 200

@app.route("/api/me", methods=["GET"])
@token_required
def get_me():
    user = users_db.find_user_by_id(request.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "id": str(user["_id"]),
        "userid": user["userid"]
    }), 200

@app.route("/api/forgot_password", methods=["POST"])
def change_password():
    data = request.get_json()

    if not data or "userID" not in data or "password" not in data or "confirmPassword" not in data:
        return jsonify({"error": "userid and new password are required"}), 400

    if not data["password"] == data["confirmPassword"]:
        return jsonify({"error": "Passwords must match"}), 400

    success = users_db.forgot_password(data["userID"], data["password"])

    if not success:
        return jsonify({"error": "Invalid userid or password"}), 401

    return jsonify({"message": "Password  successfully changed"}), 200


@app.route("/api/users", methods=["GET"])
def get_users():
    return jsonify(users_db.get_all_users()), 200


app.register_blueprint(create_projects_blueprint(token_required), url_prefix="/api/projects-service")


# Hardware routes (view hardware, checkout, check-in)

@app.route("/api/hardware", methods=["POST"])
def get_hardware():
    try:
        data = request.get_json(silent=True)
        if data is None:
            data = {}
        if not isinstance(data, dict):
            return jsonify({"error": "Hardware list request body must be an object"}), 400
        return jsonify(hardware_db.get_all_hardware(params=data)), 200
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503


@app.route("/api/hardware/checkout", methods=["POST"])
@token_required
def checkout_hardware():
    data = request.get_json()

    if not data or "name" not in data or "quantity" not in data or "projectId" not in data:
        return jsonify({"error": "name, quantity, and projectId are required"}), 400

    if type(data["quantity"]) is not int or data["quantity"] <= 0:
        return jsonify({"error": "quantity must be a positive integer"}), 400
    if not projects_api.query_project(data["projectId"], data.get("orgId")):
        return jsonify({"error": "Project not found"}), 404

    success, message = hardware_db.checkout_hardware(
        data["name"], data["quantity"], data["projectId"], request.user_id,
        hardware_id=data.get("hardwareId"),
    )

    if not success:
        return jsonify({"error": message}), 400

    return jsonify({"message": message}), 200


@app.route("/api/hardware/checkin", methods=["POST"])
@token_required
def checkin_hardware():
    data = request.get_json()

    if not data or "name" not in data or "quantity" not in data or "projectId" not in data:
        return jsonify({"error": "name, quantity, and projectId are required"}), 400

    if type(data["quantity"]) is not int or data["quantity"] <= 0:
        return jsonify({"error": "quantity must be a positive integer"}), 400
    project = projects_api.query_project(data["projectId"], data.get("orgId"))
    if not project:
        return jsonify({"error": "Project not found"}), 404

    success, message = hardware_db.checkin_hardware(
        data["name"], data["quantity"], data["projectId"], request.user_id,
        hardware_id=data.get("hardwareId"),
    )

    if not success:
        return jsonify({"error": message}), 400

    return jsonify({"message": message}), 200


@app.route("/api/listAllocations", methods=["POST"])
@token_required
def get_allocations():
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Allocation list request body is required"}), 400
        status, payload = hardware_db.get_allocations(params=data)
        return jsonify(payload), status
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503


@app.route("/api/hardware/<hardware_id>/allocations/<project_id>", methods=["POST"])
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
    if not projects_api.query_project(project_id, data.get("orgId")):
        return jsonify({"error": "Project not found"}), 404
    status, payload = hardware_db.set_allocation(hardware_id, project_id, {
        "expected_version": data["expected_version"],
        "reason": data["reason"],
        "quantity": data["quantity"],
    })
    return jsonify(payload), status


if __name__ == "__main__":
    # Fail loudly at startup if the database is unreachable, instead of
    # letting every request hang or 500 later.
    try:
        db.ping()
        print(f"[OK] Connected to MongoDB database: {db.db.name}")
    except Exception as e:
        print(f"[ERROR] Could not connect to MongoDB: {e}")

    app.run(
        debug=os.getenv("FLASK_DEBUG") == "1",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5050)),
    )
