"""Browser routes for the Users service (registration, login, two-factor, profile)."""

from flask import Blueprint, jsonify, request

from users import client as users_api


def _bearer():
    header = request.headers.get("Authorization", "")
    return header[7:].strip() if header[:7].lower() == "bearer " else ""


def _body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _text(data, key):
    value = data.get(key)
    return value if isinstance(value, str) else ""


def _missing_token():
    return jsonify({"error": "Missing token"}), 401


def create_blueprint():
    routes = Blueprint("users", __name__)

    @routes.route("/register", methods=["POST"])
    def register():
        data = _body()
        result = users_api.register(
            _text(data, "agencyCode"), _text(data, "username"), _text(data, "password"))
        return jsonify(result), 201

    @routes.route("/login", methods=["POST"])
    def login():
        data = _body()
        return jsonify(users_api.login(_text(data, "username"), _text(data, "password"))), 200

    # The three 2FA steps take the temporary mfaToken from login as a Bearer token.
    @routes.route("/2fa/setup", methods=["POST"])
    def setup_two_factor():
        token = _bearer()
        if not token:
            return _missing_token()
        return jsonify(users_api.setup_two_factor(token)), 200

    @routes.route("/2fa/enable", methods=["POST"])
    def enable_two_factor():
        token = _bearer()
        if not token:
            return _missing_token()
        return jsonify(users_api.enable_two_factor(token, _text(_body(), "code"))), 200

    @routes.route("/2fa/verify", methods=["POST"])
    def verify_two_factor():
        token = _bearer()
        if not token:
            return _missing_token()
        return jsonify(users_api.verify_two_factor(token, _text(_body(), "code"))), 200

    @routes.route("/me", methods=["GET"])
    def me():
        token = _bearer()
        if not token:
            return _missing_token()
        return jsonify(users_api.get_profile(token)), 200

    return routes