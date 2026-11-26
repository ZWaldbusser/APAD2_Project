"""gRPC transport for the Projects service: project CRUD, membership, and price context."""

import os
import logging
import re
import sys
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import grpc
from dotenv import load_dotenv

from projects import projects_pb2 as messages
from projects import projects_pb2_grpc as services
from services import projects as projects_rest
from projects.settings import timeout_seconds

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
logger = logging.getLogger(__name__)


_RETRY_SAFE = {
    "SearchProjects", "GetProject",
    "GetUnitPrice", "GetDepartmentSpend", "GetBudgetContext",
}


class ProjectsServiceError(RuntimeError):
    def __init__(self, message, status_code=503):
        super().__init__(message)
        self.status_code = status_code


_HTTP_STATUS = {
    grpc.StatusCode.INVALID_ARGUMENT: 400,
    grpc.StatusCode.FAILED_PRECONDITION: 409,
    grpc.StatusCode.NOT_FOUND: 404,
    grpc.StatusCode.ALREADY_EXISTS: 409,
    grpc.StatusCode.PERMISSION_DENIED: 403,
    grpc.StatusCode.UNAVAILABLE: 503,
    grpc.StatusCode.INTERNAL: 500,
}


def _safe_detail(value):
    detail = re.sub(r"[\x00-\x1f\x7f]", " ", str(value or ""))
    detail = re.sub(r"\b[A-Za-z][A-Za-z0-9+.-]*://\S+", "[URL redacted]", detail)
    detail = re.sub(
        r"(?i)\b(?:authorization|api[_-]?key|password|secret|token|bearer|basic)\b[^;]*",
        "[credential detail redacted]", detail,
    )
    return detail[:500]


def _endpoint(value):
    parsed = urlsplit(value if "://" in value else "http://" + value)
    if (parsed.scheme not in ("https", "grpcs", "http", "grpc")
            or not parsed.hostname or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment or parsed.username or parsed.password):
        raise ProjectsServiceError("PROJECTS_GRPC_TARGET must be a host[:port] without a path")
    secure = parsed.scheme in ("https", "grpcs")
    try:
        port = parsed.port or (443 if secure else 80)
    except ValueError as error:
        raise ProjectsServiceError("Invalid projects gRPC port") from error
    host = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
    return f"{host}:{port}", secure


@lru_cache(maxsize=4)
def _stub(target, secure):
    channel = (grpc.secure_channel(target, grpc.ssl_channel_credentials())
               if secure else grpc.insecure_channel(target))
    return services.ProjectsServiceStub(channel)


def call(method, request):
    value = os.getenv("PROJECTS_GRPC_TARGET", "").strip()
    if not value:
        raise ProjectsServiceError("PROJECTS_GRPC_TARGET is not configured")
    target, secure = _endpoint(value)
    try:
        timeout = timeout_seconds()
    except ValueError as error:
        raise ProjectsServiceError("PROJECTS_API_TIMEOUT_SECONDS must be positive and finite") from error
    rpc = getattr(_stub(target, secure), method)
    deadline = time.monotonic() + timeout
    attempts = 2 if method in _RETRY_SAFE else 1
    for attempt in range(attempts):
        try:
            return rpc(request, timeout=max(deadline - time.monotonic(), 0))
        except grpc.RpcError as error:
            detail = _safe_detail(error.details())
            logger.warning(
                "Projects RPC failure method=%s grpc_status=%s occurred_at=%s detail=%s",
                method, error.code().name, datetime.now(timezone.utc).isoformat(), detail,
            )
            if (attempt + 1 < attempts and error.code() == grpc.StatusCode.UNAVAILABLE
                    and time.monotonic() < deadline):
                continue
            status = _HTTP_STATUS.get(error.code(), 503)
            message = (detail if status < 500 else None) or "Projects service is unavailable. Please try again."
            raise ProjectsServiceError(message, status) from error


# ---- JSON shapes matching the REST contract the frontend already uses ----

def _hardware_item(h):
    return {"hardwareId": h.hardware_id, "allocation": h.allocation}


def _project(p):
    return {
        "orgId": p.org_id,
        "projectId": p.project_id,
        "projectName": p.project_name,
        "projectDesc": p.project_desc,
        "creatorId": p.creator_id,
        "budget": p.budget,
        "hardwareList": [_hardware_item(h) for h in p.hardware_list],
        "joined_users": list(p.joined_users),
    }


def _project_summary(p):
    return {
        "projectId": p.project_id,
        "projectName": p.project_name,
        "orgId": p.org_id,
        "joined_users": list(p.joined_users),
    }


def _source_unit_price(src):
    if not src.available:
        return "not available"
    s = src.stats
    return {"median": s.median, "low": s.low, "high": s.high, "purchases": s.purchases}


def _source_spend(src):
    if not src.available:
        return "not available"
    s = src.stats
    return {
        "typicalYearly": s.typical_yearly,
        "low": s.low,
        "high": s.high,
        "departments": s.departments,
        "years": list(s.years),
        "matchedLabels": list(s.matched_labels),
    }


def _cost_range(c):
    return {"low": c.low, "typical": c.typical, "high": c.high}


def _item_estimate(item):
    result = {
        "description": item.description,
        "quantity": item.quantity,
        "priced": item.priced,
    }
    if item.priced:
        result["matchedCategory"] = item.matched_category
        result["confidence"] = item.confidence
        result["unitPrice"] = {
            "median": item.unit_price.median,
            "low": item.unit_price.low,
            "high": item.unit_price.high,
            "purchases": item.unit_price.purchases,
        }
        result["estimatedCost"] = _cost_range(item.estimated_cost)
    else:
        result["unitPrice"] = "not available"
    return result


# ---- Public API called by Flask routes ----

def create_project(data):
    hw = [messages.HardwareItem(hardware_id=h["hardwareId"], allocation=h.get("allocation", 0))
          for h in (data.get("hardwareList") or [])]
    result = call("CreateProject", messages.CreateProjectRequest(
        org_id=data["orgId"], project_id=data["projectId"],
        project_name=data["projectName"],
        project_desc=data.get("projectDesc", ""),
        creator_id=data["creatorId"],
        budget=int(data.get("budget", 0)),
        hardware_list=hw,
    ))
    return 200, {"success": result.success, "errorMessage": result.error_message}


def join_project(data):
    result = call("JoinProject", messages.MembershipRequest(
        org_id=data["orgId"], project_id=data["projectId"], user_id=data["userId"],
        user_name=data["userName"],
    ))
    return 200, {"success": result.success, "errorMessage": result.error_message}


def leave_project(data):
    result = call("LeaveProject", messages.MembershipRequest(
        org_id=data["orgId"], project_id=data["projectId"], user_id=data["userId"],
        user_name=data["userName"],
    ))
    return 200, {"success": result.success, "errorMessage": result.error_message}


def search_projects(data):
    req = messages.SearchProjectsRequest()
    if data.get("orgId"):
        req.org_id = data["orgId"]
    if data.get("projectId"):
        req.project_id = data["projectId"]
    if data.get("userId"):
        req.user_id = data["userId"]
    resp = call("SearchProjects", req)
    if data.get("orgId") and any(p.org_id != data["orgId"] for p in resp.project_list):
        raise ProjectsServiceError("Project service returned an unexpected agency", 502)
    if data.get("userId") and any(data["userId"] not in p.joined_users for p in resp.project_list):
        raise ProjectsServiceError("Project membership results could not be verified", 502)
    return 200, {"projectList": [_project_summary(p) for p in resp.project_list]}


def get_project(project_id, org_id):
    resp = call("GetProject", messages.GetProjectRequest(
        project_id=project_id, org_id=org_id,
    ))
    if resp.project_info.org_id != org_id or resp.project_info.project_id != project_id:
        raise ProjectsServiceError("Project context could not be verified", 502)
    return 200, {"projectInfo": _project(resp.project_info)}


def get_unit_price(data):
    resp = call("GetUnitPrice", messages.GetUnitPriceRequest(category=data["category"]))
    return 200, {
        "success": True,
        "category": resp.category,
        "dataAsOf": resp.data_as_of or None,
        "unitPrice": {
            "Austin": _source_unit_price(resp.austin),
            "Dallas": _source_unit_price(resp.dallas),
            "Texas": _source_unit_price(resp.texas),
        },
    }


def get_department_spend(data):
    resp = call("GetDepartmentSpend", messages.GetDepartmentSpendRequest(keyword=data["keyword"]))
    return 200, {
        "success": True,
        "keyword": resp.keyword,
        "departmentSpend": {
            "Austin": _source_spend(resp.austin),
            "Dallas": _source_spend(resp.dallas),
            "Texas": _source_spend(resp.texas),
        },
    }


def _budget_request(data):
    budget = data.get("budget")
    if type(budget) not in (int, float) or not 0 <= budget <= sys.float_info.max:
        raise ProjectsServiceError("Budget must be a nonnegative finite number", 400)

    items = data.get("items")
    if not isinstance(items, list) or not items:
        raise ProjectsServiceError("At least one budget item is required", 400)
    validated = []
    for item in items:
        if not isinstance(item, dict):
            raise ProjectsServiceError("Each budget item must be an object", 400)
        description, quantity = item.get("description"), item.get("quantity")
        if not isinstance(description, str) or not description.strip():
            raise ProjectsServiceError("Each budget item needs a description", 400)
        if type(quantity) is not int or not 0 < quantity <= 2**31 - 1:
            raise ProjectsServiceError("Each budget item needs a positive whole quantity", 400)
        validated.append({"description": description, "quantity": quantity})
    return {"orgId": data["orgId"], "budget": budget, "items": validated}


def _get_budget_context_rest(data):
    try:
        status, payload = projects_rest.call("POST", "/get_budget_context", data=data)
    except projects_rest.ProjectsServiceError as error:
        raise ProjectsServiceError(str(error), error.status_code) from error

    if 400 <= status < 500:
        message = payload.get("message") if isinstance(payload, dict) else None
        raise ProjectsServiceError(
            message if isinstance(message, str) else "Projects rejected the budget request", status,
        )
    if not 200 <= status < 300:
        raise ProjectsServiceError("Projects budget context is unavailable", 503)
    invalid = ProjectsServiceError("Projects returned an invalid budget context", 502)
    if not isinstance(payload, dict) or payload.get("success") is False:
        raise invalid
    items = payload.get("items")
    if (payload.get("orgId") != data["orgId"] or payload.get("budget") != data["budget"]
            or not isinstance(items, list) or len(items) != len(data["items"])):
        raise invalid

    normalized = []
    for item, requested in zip(items, data["items"]):
        if (not isinstance(item, dict) or item.get("description") != requested["description"]
                or type(item.get("quantity")) is not int or item["quantity"] != requested["quantity"]):
            raise invalid
        estimate = item.get("estimatedCost")
        # The REST contract represents an unpriced item without an estimate.
        priced = item.get("priced", isinstance(estimate, dict))
        if type(priced) is not bool:
            raise invalid
        if priced and (not isinstance(estimate, dict) or not all(
            type(estimate.get(key)) in (int, float) and 0 <= estimate[key] <= sys.float_info.max
            for key in ("low", "typical", "high")
        )):
            raise invalid
        category = item.get("matchedCategory")
        normalized.append({
            **item, "priced": priced,
            "matchedCategory": category if isinstance(category, str) else "",
        })

    unpriced = sum(not item["priced"] for item in normalized)
    return status, {
        **payload,
        "success": True,
        "items": normalized,
        "unpricedItems": unpriced,
        "withinBudget": None if unpriced else payload.get("withinBudget"),
    }


def get_budget_context(data):
    data = _budget_request(data)
    if os.getenv("PROJECTS_API_BASE_URL", "").strip():
        try:
            return _get_budget_context_rest(data)
        except ProjectsServiceError as error:
            if error.status_code < 500:
                raise
            # Estimates are read-only. Retain the gRPC path during REST outages.

    items = [messages.BudgetItem(**item) for item in data["items"]]
    resp = call("GetBudgetContext", messages.GetBudgetContextRequest(
        org_id=data["orgId"], budget=float(data["budget"]), items=items,
    ))
    return 200, {
        "success": True,
        "orgId": resp.org_id,
        "budget": resp.budget,
        "items": [_item_estimate(i) for i in resp.items],
        "totalEstimate": _cost_range(resp.total_estimate),
        "unpricedItems": resp.unpriced_items,
        "withinBudget": resp.within_budget if resp.HasField("within_budget") else None,
    }


def query_project(project_id, org_id=None):
    """Validate hardware operations against the Projects service."""
    if org_id:
        try:
            _, payload = get_project(project_id, org_id)
            return payload.get("projectInfo", payload)
        except ProjectsServiceError as error:
            if error.status_code == 404:
                return None
            raise
    else:
        try:
            _, payload = search_projects({"projectId": project_id})
            projects = payload.get("projectList", [])
            if len(projects) > 1:
                raise ProjectsServiceError("Agency is required for this project ID", 409)
            return projects[0] if projects else None
        except ProjectsServiceError:
            raise


def query_hardware_project(project_id, org_id):
    """Bare Hardware IDs are unsafe when the Projects ID exists in two agencies."""
    project = query_project(project_id, org_id)
    if project is None:
        return None
    if project.get("orgId") != org_id or project.get("projectId") != project_id:
        raise ProjectsServiceError("Project context could not be verified", 503)
    _, payload = search_projects({"projectId": project_id})
    matches = payload["projectList"]
    if len(matches) != 1 or matches[0]["orgId"] != org_id:
        raise ProjectsServiceError(
            "Equipment is unavailable for this project until its agency mapping is resolved", 409,
        )
    return project
