"""Project Registration Lambda — route dispatch for /projects APIs.

Uses a module-level in-memory store until DatabaseConstruct provides persistence.
State is not shared across cold starts or with the validation Lambda.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

# Temporary store until DatabaseConstruct exists.
_projects: dict[str, dict[str, Any]] = {}


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = event.get("httpMethod", "GET").upper()
    resource = event.get("resource") or event.get("path", "")
    path_params = event.get("pathParameters") or {}

    if method == "POST" and resource == "/projects":
        return _create_project(event)
    if method == "GET" and resource == "/projects":
        return _list_projects()
    if method == "GET" and resource == "/projects/{projectId}":
        return _get_project(path_params.get("projectId"))
    if method == "PATCH" and resource == "/projects/{projectId}":
        return _patch_project(path_params.get("projectId"), event)
    if method == "POST" and resource == "/projects/{projectId}/submit":
        return _submit_project(path_params.get("projectId"))

    return _response(404, {"message": "Not found", "resource": resource, "method": method})


def _create_project(event: dict[str, Any]) -> dict[str, Any]:
    body, error = _parse_body(event)
    if error is not None:
        return error

    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        return _response(400, {"message": "Field 'title' is required"})

    description = body.get("description", "")
    if description is not None and not isinstance(description, str):
        return _response(400, {"message": "Field 'description' must be a string"})

    project_id = str(uuid.uuid4())
    project = {
        "projectId": project_id,
        "title": title.strip(),
        "description": (description or "").strip(),
        "status": "draft",
        "validationNotes": None,
    }
    _projects[project_id] = project
    return _response(201, project)


def _list_projects() -> dict[str, Any]:
    return _response(200, {"projects": list(_projects.values())})


def _get_project(project_id: str | None) -> dict[str, Any]:
    if not project_id:
        return _response(400, {"message": "Missing projectId"})
    project = _projects.get(project_id)
    if project is None:
        return _response(404, {"message": "Project not found", "projectId": project_id})
    return _response(200, project)


def _patch_project(project_id: str | None, event: dict[str, Any]) -> dict[str, Any]:
    if not project_id:
        return _response(400, {"message": "Missing projectId"})

    project = _projects.get(project_id)
    if project is None:
        return _response(404, {"message": "Project not found", "projectId": project_id})
    if project["status"] != "draft":
        return _response(
            409,
            {
                "message": "Only draft projects can be updated",
                "projectId": project_id,
                "status": project["status"],
            },
        )

    body, error = _parse_body(event)
    if error is not None:
        return error

    if "title" in body:
        title = body["title"]
        if not isinstance(title, str) or not title.strip():
            return _response(400, {"message": "Field 'title' must be a non-empty string"})
        project["title"] = title.strip()

    if "description" in body:
        description = body["description"]
        if not isinstance(description, str):
            return _response(400, {"message": "Field 'description' must be a string"})
        project["description"] = description.strip()

    return _response(200, project)


def _submit_project(project_id: str | None) -> dict[str, Any]:
    if not project_id:
        return _response(400, {"message": "Missing projectId"})

    project = _projects.get(project_id)
    if project is None:
        return _response(404, {"message": "Project not found", "projectId": project_id})
    if project["status"] != "draft":
        return _response(
            409,
            {
                "message": "Only draft projects can be submitted",
                "projectId": project_id,
                "status": project["status"],
            },
        )

    project["status"] = "submitted"
    return _response(200, project)


def _parse_body(event: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
    raw = event.get("body")
    if raw is None or raw == "":
        return {}, None
    if event.get("isBase64Encoded"):
        return {}, _response(400, {"message": "Base64-encoded bodies are not supported"})
    if isinstance(raw, dict):
        return raw, None
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}, _response(400, {"message": "Request body must be valid JSON"})
    if not isinstance(parsed, dict):
        return {}, _response(400, {"message": "Request body must be a JSON object"})
    return parsed, None


def _response(status_code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
