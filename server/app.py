# Main Flask entrypoint. Defines API routes and delegates database
# operations to the appropriate database module.

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db
import usersDatabase as users_db
import projectsDatabase as projects_db
import hardwareDatabase as hardware_db

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


# Project routes (create project, get project, list projects)

@app.route("/api/projects", methods=["POST"])
@token_required
def create_project():
    data = request.get_json()
    required_fields = ["name", "description", "projectID"]

    if not data or not all(field in data for field in required_fields):
        return jsonify({"error": "name, description, and projectID are required"}), 400

    created = projects_db.createProject(
        data["name"], data["projectID"], data["description"]
    )

    if not created:
        return jsonify({"error": "projectID already exists"}), 409

    projects_db.addUser(data["projectID"], request.user_id)

    return jsonify({"message": "Project created", "projectID": data["projectID"]}), 201


@app.route("/api/projects/<project_id>", methods=["GET"])
def get_project(project_id):
    project = projects_db.queryProject(project_id)

    if not project:
        return jsonify({"error": "Project not found"}), 404

    return jsonify({
        "id": str(project["_id"]),
        "name": project["projectName"],
        "description": project["description"],
        "projectID": project["projectId"],
        "users": project.get("users", []),
        "hwSets": project.get("hwSets", {})
    }), 200


@app.route("/api/projects", methods=["GET"])
@token_required
def get_projects():
    projects = []
    for project in db.db["projects"].find({"users": request.user_id}):
        projects.append({
            "id": str(project["_id"]),
            "name": project.get("projectName"),
            "description": project.get("description"),
            "projectID": project.get("projectId"),
            "users": project.get("users", [])
        })
    return jsonify(projects), 200

@app.route("/api/projects/<project_id>/join", methods=["POST"])
@token_required
def join_project(project_id):
    result = projects_db.addUser(project_id, request.user_id)
    if result == "not_found":
        return jsonify({"error": "Project not found"}), 404
    if result == "already_member":
        return jsonify({"error": "You are already a member of this project"}), 409
    return jsonify({"message": "Joined project"}), 200


# Hardware routes (view hardware, checkout, check-in)

@app.route("/api/hardware", methods=["GET"])
def get_hardware():
    return jsonify(hardware_db.get_all_hardware()), 200


@app.route("/api/hardware/checkout", methods=["POST"])
@token_required
def checkout_hardware():
    data = request.get_json()

    if not data or "name" not in data or "quantity" not in data or "projectId" not in data:
        return jsonify({"error": "name, quantity, and projectId are required"}), 400

    success, message = hardware_db.checkout_hardware(data["name"], data["quantity"])

    if not success:
        return jsonify({"error": message}), 400

    project_updated = projects_db.checkOutHW(
        data["projectId"], data["name"], data["quantity"], request.user_id
    )

    if not project_updated:
        # roll back the pool decrement since the project side didn't apply
        hardware_db.checkin_hardware(data["name"], data["quantity"])
        return jsonify({"error": "Project not found"}), 404

    return jsonify({"message": message}), 200


@app.route("/api/hardware/checkin", methods=["POST"])
@token_required
def checkin_hardware():
    data = request.get_json()

    if not data or "name" not in data or "quantity" not in data or "projectId" not in data:
        return jsonify({"error": "name, quantity, and projectId are required"}), 400

    project = projects_db.queryProject(data["projectId"])
    if not project:
        return jsonify({"error": "Project not found"}), 404

    current_usage = project.get("hwSets", {}).get(data["name"], 0)
    if current_usage < data["quantity"]:
        return jsonify({"error": "Cannot return more than this project has checked out"}), 400

    success, message = hardware_db.checkin_hardware(data["name"], data["quantity"])

    if not success:
        return jsonify({"error": message}), 400

    projects_db.checkInHW(data["projectId"], data["name"], data["quantity"], request.user_id)

    return jsonify({"message": message}), 200


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