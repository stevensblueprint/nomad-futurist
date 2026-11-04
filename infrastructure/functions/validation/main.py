"""Project Validation Lambda — minimal mock handlers for /validation/projects routes.

Validates API Gateway -> Lambda wiring only. Real list/get/decision logic
and persistence land in later backend/database tasks.
"""

from __future__ import annotations

import json
from typing import Any


MOCK_PROJECT_IDS = frozenset({"project-123", "project-456"})
MOCK_VALIDATION_PROJECT_IDS = frozenset({"project-456"})


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = event.get("httpMethod")
    resource = event.get("resource")

    claims = _claims(event)
    if claims is None:
        return _response(401, {"message": "Authentication is required."})
    if not {"Admin", "TechnicalStaff", "Mentors"}.intersection(
        _groups(claims.get("cognito:groups"))
    ):
        return _response(403, {"message": "Project Validation access is required."})

    if method == "PATCH" and resource == "/validation/projects/{projectId}":
        try:
            validation = json.loads(event.get("body"))
        except (TypeError, json.JSONDecodeError):
            return _response(400, {"message": "Request body must be a JSON object."})

        if not isinstance(validation, dict):
            return _response(400, {"message": "Request body must be a JSON object."})

        path_parameters = event.get("pathParameters") or {}
        project_id = path_parameters.get("projectId")
        if project_id not in MOCK_VALIDATION_PROJECT_IDS:
            return _response(404, {"message": "Validation report not found."})

        return _response(
            200,
            {
                "projectId": project_id,
                "validation": validation,
            },
        )

    if method == "POST" and resource == "/validation/projects/{projectId}":
        try:
            validation = json.loads(event.get("body"))
        except (TypeError, json.JSONDecodeError):
            return _response(400, {"message": "Request body must be a JSON object."})

        if not isinstance(validation, dict):
            return _response(400, {"message": "Request body must be a JSON object."})

        path_parameters = event.get("pathParameters") or {}
        project_id = path_parameters.get("projectId")
        if project_id not in MOCK_PROJECT_IDS:
            return _response(404, {"message": "Project not found."})
        elif project_id in MOCK_VALIDATION_PROJECT_IDS:
            return _response(409, {"message": "Validation report already exists."})

        return _response(
            201,
            {
                "projectId": project_id,
                "validation": validation,
                "action": "created",
            },
        )

    return _response(
        200,
        {
            "message": "Project Validation route invoked",
            "method": method,
            "resource": resource,
        },
    )


def _claims(event: dict[str, Any]) -> dict[str, Any] | None:
    request_context = event.get("requestContext")
    if not isinstance(request_context, dict):
        return None
    authorizer = request_context.get("authorizer")
    if not isinstance(authorizer, dict):
        return None
    claims = authorizer.get("claims")
    return claims if isinstance(claims, dict) else None


def _groups(value: Any) -> set[str]:
    if isinstance(value, list):
        return {group for group in value if isinstance(group, str)}
    if not isinstance(value, str):
        return set()
    value = value.strip()
    if not value:
        return set()
    if value.startswith("["):
        if not value.endswith("]"):
            return set()
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            # API Gateway can stringify Cognito's group list without JSON quotes.
            groups = [group.strip() for group in value[1:-1].split(",")]
            return set(groups) if all(group and '"' not in group for group in groups) else set()
        return (
            {group for group in parsed if isinstance(group, str)}
            if isinstance(parsed, list) else set()
        )
    return {group.strip() for group in value.split(",") if group.strip()}


def _response(status_code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "http://localhost:3000",
        },
        "body": json.dumps(body),
    }
