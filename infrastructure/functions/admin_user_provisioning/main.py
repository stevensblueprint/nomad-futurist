import json
import logging
import os
import re

import boto3
from botocore.exceptions import BotoCoreError, ClientError


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ROLE_GROUPS = {"TechnicalStaff": "TechnicalStaff", "Mentors": "Mentors"}
LOGGER = logging.getLogger(__name__)


def _response(status_code, message):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": message}),
    }


def _groups(claims):
    group_claim = claims.get("cognito:groups")
    if isinstance(group_claim, list):
        return group_claim
    if not isinstance(group_claim, str):
        return []

    try:
        parsed_groups = json.loads(group_claim)
    except json.JSONDecodeError:
        parsed_groups = None

    if isinstance(parsed_groups, list):
        return parsed_groups
    return [group.strip() for group in group_claim.split(",")]


def _cleanup_user(cognito, user_pool_id, email):
    try:
        cognito.admin_delete_user(UserPoolId=user_pool_id, Username=email)
    except (BotoCoreError, ClientError):
        LOGGER.exception("Failed to clean up partially provisioned Cognito user")


def handler(event, _context):
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    if "Admin" not in _groups(claims):
        return _response(403, "Admin access is required.")

    body = event.get("body")
    if not isinstance(body, str):
        return _response(400, "Request body must be a JSON object.")

    try:
        request = json.loads(body)
    except json.JSONDecodeError:
        return _response(400, "Request body must be a JSON object.")

    if not isinstance(request, dict):
        return _response(400, "Request body must be a JSON object.")

    email = request.get("email")
    if not isinstance(email, str) or not EMAIL_PATTERN.fullmatch(email):
        return _response(400, "A valid email is required.")

    role = request.get("role")
    selected_group = ROLE_GROUPS.get(role) if isinstance(role, str) else None
    if selected_group is None:
        return _response(400, "Role must be TechnicalStaff or Mentors.")

    try:
        user_pool_id = os.environ["USER_POOL_ID"]
    except KeyError:
        return _response(500, "Unable to provision the user.")

    created_user = False
    try:
        cognito = boto3.client("cognito-idp")
        cognito.admin_create_user(
            UserPoolId=user_pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
        created_user = True
        cognito.admin_add_user_to_group(
            UserPoolId=user_pool_id, Username=email, GroupName=selected_group
        )
        cognito.admin_set_user_mfa_preference(
            UserPoolId=user_pool_id,
            Username=email,
            EmailMfaSettings={"Enabled": True, "PreferredMfa": True},
        )
    except ClientError as error:
        if created_user:
            _cleanup_user(cognito, user_pool_id, email)
            return _response(500, "Unable to provision the user.")
        if error.response["Error"]["Code"] == "UsernameExistsException":
            return _response(409, "An account already exists for this email.")
        return _response(500, "Unable to provision the user.")
    except BotoCoreError:
        if created_user:
            _cleanup_user(cognito, user_pool_id, email)
        return _response(500, "Unable to provision the user.")

    return _response(201, "User invitation sent.")
