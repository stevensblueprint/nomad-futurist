"""Project Validation Lambda — route dispatch for /validation/projects APIs.

Uses a module-level in-memory store until DatabaseConstruct provides persistence.
State is not shared across cold starts or with the registration Lambda.
"""

from __future__ import annotations

import json
from typing import Any

# Temporary store until DatabaseConstruct exists.
_projects: dict[str, dict[str, Any]] = {}

_DECIDED_STATUSES = frozenset({"submitted", "approved", "rejected"})
_DECISION_STATUSES = frozenset({"approved", "rejected"})


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = event.get("httpMethod", "GET").upper()
    resource = event.get("resource") or event.get("path", "")
    path_params = event.get("pathParameters") or {}

    if method == "GET" and resource == "/validation/projects":
        return _list_validation_projects()
    if method == "GET" and resource == "/validation/projects/{projectId}":
        return _get_validation_project(path_params.get("projectId"))
    if method == "PATCH" and resource == "/validation/projects/{projectId}":
        return _patch_validation_project(path_params.get("projectId"), event)

    return _response(404, {"message": "Not found", "resource": resource, "method": method})


def _list_validation_projects() -> dict[str, Any]:
    projects = [
        project
        for project in _projects.values()
        if project.get("status") in _DECIDED_STATUSES
    ]
    return _response(200, {"projects": projects})


def _get_validation_project(project_id: str | None) -> dict[str, Any]:
    if not project_id:
        return _response(400, {"message": "Missing projectId"})

    project = _projects.get(project_id)
    if project is None or project.get("status") not in _DECIDED_STATUSES:
        return _response(404, {"message": "Project not found", "projectId": project_id})
    return _response(200, project)


def _patch_validation_project(
    project_id: str | None, event: dict[str, Any]
) -> dict[str, Any]:
    if not project_id:
        return _response(400, {"message": "Missing projectId"})

    project = _projects.get(project_id)
    if project is None:
        return _response(404, {"message": "Project not found", "projectId": project_id})
    if project["status"] != "submitted":
        return _response(
            409,
            {
                "message": "Only submitted projects can be validated",
                "projectId": project_id,
                "status": project["status"],
            },
        )

    body, error = _parse_body(event)
    if error is not None:
        return error

    status = body.get("status")
    if status not in _DECISION_STATUSES:
        return _response(
            400,
            {
                "message": "Field 'status' must be 'approved' or 'rejected'",
            },
        )

    if "validationNotes" in body:
        notes = body["validationNotes"]
        if notes is not None and not isinstance(notes, str):
            return _response(
                400, {"message": "Field 'validationNotes' must be a string or null"}
            )
        project["validationNotes"] = notes

    project["status"] = status
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
