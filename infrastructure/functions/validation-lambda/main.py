"""Project Validation Lambda — minimal mock handlers for /validation/projects routes.

Validates API Gateway -> Lambda wiring only. Real list/get/decision logic
and persistence land in later backend/database tasks.
"""

from __future__ import annotations

import json
from typing import Any


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = event.get("httpMethod")
    resource = event.get("resource")

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
            "Content-Type": "application/json"
            "Access-Control-Allow-Origin": "http://localhost:3000"},
        "body": json.dumps(body),
    }
