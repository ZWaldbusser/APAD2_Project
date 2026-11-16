"""Projects API transport. Project data never uses the local users database."""

import os
from urllib.parse import quote

import requests


class ProjectsServiceError(RuntimeError):
    def __init__(self, message, status_code=503):
        super().__init__(message)
        self.status_code = status_code


def call(method, path, *, data=None, params=None):
    base_url = os.getenv("PROJECTS_API_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        raise ProjectsServiceError("PROJECTS_API_BASE_URL is not configured")
    try:
        timeout = float(os.getenv("PROJECTS_API_TIMEOUT_SECONDS", "10"))
        if not 0 < timeout < float("inf"):
            raise ValueError()
    except ValueError as error:
        raise ProjectsServiceError("PROJECTS_API_TIMEOUT_SECONDS must be positive and finite") from error
    try:
        response = requests.request(method, base_url + path, json=data, params=params, timeout=timeout)
    except requests.RequestException as error:
        raise ProjectsServiceError("Projects service is unreachable") from error
    try:
        payload = response.json()
    except ValueError as error:
        raise ProjectsServiceError("Projects service returned an invalid response", 502) from error
    return response.status_code, payload


def query_project(project_id, org_id=None):
    """Validate hardware operations against the same API used to create projects."""
    if org_id:
        status, payload = call("GET", f"/projects/{quote(project_id, safe='')}", params={"orgId": org_id})
        if status == 404:
            return None
        if 200 <= status < 300:
            return payload.get("projectInfo", payload)
    else:
        status, payload = call("POST", "/projects/search_project", data={"orgId": None, "projectId": project_id})
        if 200 <= status < 300:
            projects = payload.get("projectList", [])
            if len(projects) > 1:
                raise ProjectsServiceError("Agency is required for this project ID", 409)
            return projects[0] if projects else None
    message = payload.get("errorMessage") or payload.get("error") or "Could not validate project"
    raise ProjectsServiceError(message, status)
