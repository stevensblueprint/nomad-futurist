"""Placeholder Project Registration Lambda handler for infrastructure validation."""

from __future__ import annotations

import json
from typing import Any


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = event.get("httpMethod", "GET")
    path = event.get("path", "")
    status_code = 201 if method == "POST" else 200

    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {
                "message": "Project Registration mock response",
                "service": "project-registration",
                "method": method,
                "path": path,
            }
        ),
    }
