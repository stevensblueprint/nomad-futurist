"""Validate project registration requests and return a temporary draft response."""

from __future__ import annotations

import base64
import binascii
import json
import logging
import math
import uuid
from typing import Any
from urllib.parse import urlsplit


_ALLOWED_FIELDS = {
    "projectName", "description", "linkedInUrl", "supportType", "needs",
    "fundingRange", "visionDocument",
}
_SUPPORT_TYPES = {"funding", "human_capital", "both"}
LOGGER = logging.getLogger(__name__)


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    try:
        return _handle(event, context)
    except Exception:
        LOGGER.exception("Unexpected project registration failure")
        return _response(500, {"message": "Unable to process the registration request."})


def _handle(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = event.get("httpMethod")
    resource = event.get("resource")

    if method == "POST" and resource == "/projects":
        claims = _claims(event)
        if claims is None:
            return _response(401, {"message": "Authentication is required."})
        if "Founders" not in _groups(claims.get("cognito:groups")):
            return _response(403, {"message": "Founder access is required."})

        try:
            request = _parse_body(event)
        except (ValueError, UnicodeDecodeError, binascii.Error):
            return _response(400, {"message": "Request body must be a JSON object."})

        normalized, errors = _validate(request)
        if errors:
            return _response(400, {
                "message": "Invalid registration request.",
                "errors": errors,
            })

        response = {"projectId": str(uuid.uuid4()), **normalized, "status": "draft"}
        return _response(201, response)

    supported = {
        ("GET", "/projects"),
        ("GET", "/projects/{projectId}"),
        ("PATCH", "/projects/{projectId}"),
        ("POST", "/projects/{projectId}/submit"),
    }
    if (method, resource) in supported:
        return _response(200, {
            "message": "Project Registration route invoked",
            "method": method,
            "resource": resource,
        })
    return _response(404, {"message": "Route not found."})


def _claims(event: dict[str, Any]) -> dict[str, Any] | None:
    context = event.get("requestContext")
    if not isinstance(context, dict):
        return None
    authorizer = context.get("authorizer")
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
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return set()
        return {group for group in parsed if isinstance(group, str)} if isinstance(parsed, list) else set()
    return {group.strip() for group in value.split(",") if group.strip()}


def _parse_body(event: dict[str, Any]) -> dict[str, Any]:
    body = event.get("body")
    if not isinstance(body, str) or not body:
        raise ValueError("missing body")
    if event.get("isBase64Encoded") is True:
        body = base64.b64decode(body, validate=True).decode("utf-8")
    request = json.loads(body)
    if not isinstance(request, dict):
        raise ValueError("body must be an object")
    return request


def _validate(request: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    errors: dict[str, str] = {}
    for key in request.keys() - _ALLOWED_FIELDS:
        errors[key] = "This field is not allowed."

    normalized: dict[str, Any] = {}
    for field in ("projectName", "description", "needs"):
        value = request.get(field)
        if not isinstance(value, str) or not value.strip():
            errors[field] = "Enter a nonempty value."
        else:
            normalized[field] = value.strip()

    support_type = request.get("supportType")
    if not isinstance(support_type, str) or support_type not in _SUPPORT_TYPES:
        errors["supportType"] = "Choose funding, human_capital, or both."
    else:
        normalized["supportType"] = support_type

    url = request.get("linkedInUrl")
    if url is None:
        normalized["linkedInUrl"] = None
    elif not isinstance(url, str):
        errors["linkedInUrl"] = "Enter an absolute HTTP or HTTPS URL."
    else:
        url = url.strip()
        if not url:
            normalized["linkedInUrl"] = None
        else:
            try:
                parsed = urlsplit(url)
                valid_url = (
                    parsed.scheme.lower() in {"http", "https"}
                    and bool(parsed.hostname)
                    and not any(character.isspace() for character in parsed.netloc)
                    and "\\" not in parsed.netloc
                )
                # Accessing port detects malformed/out-of-range ports.
                _ = parsed.port
            except ValueError:
                valid_url = False
            if valid_url:
                normalized["linkedInUrl"] = url
            else:
                errors["linkedInUrl"] = "Enter an absolute HTTP or HTTPS URL."

    vision = request.get("visionDocument")
    if vision is not None:
        errors["visionDocument"] = "Vision document uploads are not supported yet."
    normalized["visionDocument"] = None

    funding = request.get("fundingRange")
    if support_type == "human_capital":
        if funding is not None:
            errors["fundingRange"] = "Funding range must be omitted or null for human capital support."
        normalized["fundingRange"] = None
    elif isinstance(support_type, str) and support_type in {"funding", "both"}:
        if not isinstance(funding, dict):
            errors["fundingRange"] = "Provide minimum and maximum funding values."
        else:
            for key in funding.keys() - {"minimum", "maximum"}:
                errors[f"fundingRange.{key}"] = "This field is not allowed."
            bounds: dict[str, int | float] = {}
            for bound in ("minimum", "maximum"):
                value = funding.get(bound)
                try:
                    finite = math.isfinite(value)
                except (OverflowError, TypeError):
                    finite = False
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not finite or value < 0:
                    errors[f"fundingRange.{bound}"] = "Enter a finite, nonnegative number."
                else:
                    bounds[bound] = value
            if len(bounds) == 2 and bounds["minimum"] > bounds["maximum"]:
                errors["fundingRange"] = "Minimum funding must not exceed maximum funding."
            if len(bounds) == 2:
                normalized["fundingRange"] = bounds

    return normalized, errors


def _response(status_code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "http://localhost:3000",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
        },
        "body": json.dumps(body, allow_nan=False),
    }
