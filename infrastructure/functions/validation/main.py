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
            return _response(409, {"message": "Project already exists."})

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


def _response(status_code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "http://localhost:3000",
        },
        "body": json.dumps(body),
    }
