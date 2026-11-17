"""gRPC transport for the Projects service: project CRUD, membership, and price context."""

import os
import time
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import grpc
from dotenv import load_dotenv

from projects import projects_pb2 as messages
from projects import projects_pb2_grpc as services

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DEFAULT_TARGET = "projects-grpc-vf.northcentralus.azurecontainer.io:50051"

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
    grpc.StatusCode.UNAVAILABLE: 503,
    grpc.StatusCode.INTERNAL: 500,
}


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
    target, secure = _endpoint(os.getenv("PROJECTS_GRPC_TARGET", DEFAULT_TARGET).strip())
    try:
        timeout = float(os.getenv("PROJECTS_API_TIMEOUT_SECONDS", "15"))
        if not 0 < timeout < float("inf"):
            raise ValueError()
    except ValueError as error:
        raise ProjectsServiceError("PROJECTS_API_TIMEOUT_SECONDS must be positive and finite") from error
    rpc = getattr(_stub(target, secure), method)
    deadline = time.monotonic() + timeout
    attempts = 2 if method in _RETRY_SAFE else 1
    for attempt in range(attempts):
        try:
            return rpc(request, timeout=max(deadline - time.monotonic(), 0))
        except grpc.RpcError as error:
            if (attempt + 1 < attempts and error.code() == grpc.StatusCode.UNAVAILABLE
                    and time.monotonic() < deadline):
                continue
            status = _HTTP_STATUS.get(error.code(), 503)
            message = (error.details() if status < 500 else None) or "Projects service is unavailable. Please try again."
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
    call("CreateProject", messages.CreateProjectRequest(
        org_id=data["orgId"], project_id=data["projectId"],
        project_name=data["projectName"],
        project_desc=data.get("projectDesc", ""),
        creator_id=data["creatorId"],
        budget=int(data.get("budget", 0)),
        hardware_list=hw,
    ))
    return 200, {"success": True, "errorMessage": ""}


def join_project(data):
    call("JoinProject", messages.MembershipRequest(
        org_id=data["orgId"], project_id=data["projectId"], user_id=data["userId"],
    ))
    return 200, {"success": True, "errorMessage": ""}


def leave_project(data):
    call("LeaveProject", messages.MembershipRequest(
        org_id=data["orgId"], project_id=data["projectId"], user_id=data["userId"],
    ))
    return 200, {"success": True, "errorMessage": ""}


def search_projects(data):
    req = messages.SearchProjectsRequest()
    if data.get("orgId"):
        req.org_id = data["orgId"]
    if data.get("projectId"):
        req.project_id = data["projectId"]
    resp = call("SearchProjects", req)
    return 200, {"projectList": [_project_summary(p) for p in resp.project_list]}


def get_project(project_id, org_id):
    resp = call("GetProject", messages.GetProjectRequest(
        project_id=project_id, org_id=org_id,
    ))
    return 200, {"projectInfo": _project(resp.project_info)}


def get_unit_price(data):
    resp = call("GetUnitPrice", messages.GetUnitPriceRequest(category=data["category"]))
    return 200, {
        "success": True,
        "category": resp.category,
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


def get_budget_context(data):
    items = [messages.BudgetItem(description=i["description"], quantity=int(i["quantity"]))
             for i in data["items"]]
    resp = call("GetBudgetContext", messages.GetBudgetContextRequest(
        org_id=data["orgId"], budget=float(data["budget"]), items=items,
    ))
    result = {
        "success": True,
        "orgId": resp.org_id,
        "budget": resp.budget,
        "items": [_item_estimate(i) for i in resp.items],
        "totalEstimate": _cost_range(resp.total_estimate),
        "unpricedItems": resp.unpriced_items,
        "withinBudget": resp.within_budget if resp.HasField("within_budget") else None,
    }
    return result


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
