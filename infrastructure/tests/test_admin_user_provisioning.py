import json
import os
import unittest
from unittest.mock import Mock, call, patch

from botocore.exceptions import BotoCoreError, ClientError

from functions.admin_user_provisioning.main import handler


class AdminUserProvisioningTest(unittest.TestCase):
    def setUp(self) -> None:
        self.environment = patch.dict(os.environ, {"USER_POOL_ID": "pool-id"})
        self.environment.start()

    def tearDown(self) -> None:
        self.environment.stop()

    @staticmethod
    def event(groups, body):
        return {
            "requestContext": {"authorizer": {"claims": {"cognito:groups": groups}}},
            "body": body,
        }

    @staticmethod
    def response(status_code, message):
        return {
            "statusCode": status_code,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"message": message}),
        }

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_technical_staff_provisioning_creates_user_group_and_mfa(self, client):
        cognito = Mock()
        client.return_value = cognito

        result = handler(
            self.event(["Member", "Admin"], json.dumps({"email": "staff@example.com", "role": "TechnicalStaff"})),
            None,
        )

        self.assertEqual(self.response(201, "User invitation sent."), result)
        client.assert_called_once_with("cognito-idp")
        cognito.admin_create_user.assert_called_once_with(
            UserPoolId="pool-id",
            Username="staff@example.com",
            UserAttributes=[
                {"Name": "email", "Value": "staff@example.com"},
                {"Name": "email_verified", "Value": "true"},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
        cognito.admin_add_user_to_group.assert_called_once_with(
            UserPoolId="pool-id", Username="staff@example.com", GroupName="TechnicalStaff"
        )
        cognito.admin_set_user_mfa_preference.assert_called_once_with(
            UserPoolId="pool-id",
            Username="staff@example.com",
            EmailMfaSettings={"Enabled": True, "PreferredMfa": True},
        )
        self.assertEqual(
            [
                call.admin_create_user(
                    UserPoolId="pool-id",
                    Username="staff@example.com",
                    UserAttributes=[
                        {"Name": "email", "Value": "staff@example.com"},
                        {"Name": "email_verified", "Value": "true"},
                    ],
                    DesiredDeliveryMediums=["EMAIL"],
                ),
                call.admin_add_user_to_group(
                    UserPoolId="pool-id", Username="staff@example.com", GroupName="TechnicalStaff"
                ),
                call.admin_set_user_mfa_preference(
                    UserPoolId="pool-id",
                    Username="staff@example.com",
                    EmailMfaSettings={"Enabled": True, "PreferredMfa": True},
                ),
            ],
            cognito.method_calls,
        )

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_comma_separated_admin_group_claim_reaches_cognito_provisioning(self, client):
        cognito = Mock()
        client.return_value = cognito

        result = handler(
            self.event("Mentors,Admin", json.dumps({"email": "comma@example.com", "role": "Mentors"})),
            None,
        )

        self.assertEqual(self.response(201, "User invitation sent."), result)
        client.assert_called_once_with("cognito-idp")
        cognito.admin_create_user.assert_called_once()

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_mentors_role_maps_to_mentors_group(self, client):
        cognito = Mock()
        client.return_value = cognito

        result = handler(
            self.event('["Admin"]', json.dumps({"email": "mentor@example.com", "role": "Mentors"})),
            None,
        )

        self.assertEqual(self.response(201, "User invitation sent."), result)
        cognito.admin_add_user_to_group.assert_called_once_with(
            UserPoolId="pool-id", Username="mentor@example.com", GroupName="Mentors"
        )

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_non_admin_is_rejected_before_client_creation(self, client):
        result = handler(
            self.event("Member,Founders", json.dumps({"email": "user@example.com", "role": "Mentors"})),
            None,
        )

        self.assertEqual(self.response(403, "Admin access is required."), result)
        client.assert_not_called()

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_founders_role_is_rejected_before_client_creation(self, client):
        result = handler(
            self.event("Admin", json.dumps({"email": "founder@example.com", "role": "Founders"})),
            None,
        )

        self.assertEqual(self.response(400, "Role must be TechnicalStaff or Mentors."), result)
        client.assert_not_called()

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_malformed_json_is_rejected(self, client):
        result = handler(self.event("Admin", "{"), None)

        self.assertEqual(self.response(400, "Request body must be a JSON object."), result)
        client.assert_not_called()

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_json_array_body_is_rejected(self, client):
        result = handler(self.event("Admin", json.dumps([])), None)

        self.assertEqual(self.response(400, "Request body must be a JSON object."), result)
        client.assert_not_called()

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_unknown_string_role_is_rejected_before_client_creation(self, client):
        result = handler(
            self.event("Admin", json.dumps({"email": "unknown@example.com", "role": "Unknown"})), None
        )

        self.assertEqual(self.response(400, "Role must be TechnicalStaff or Mentors."), result)
        client.assert_not_called()

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_non_string_role_is_rejected_before_client_creation(self, client):
        result = handler(
            self.event("Admin", json.dumps({"email": "role@example.com", "role": ["Mentors"]})), None
        )

        self.assertEqual(self.response(400, "Role must be TechnicalStaff or Mentors."), result)
        client.assert_not_called()

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_duplicate_cognito_user_maps_to_conflict(self, client):
        cognito = Mock()
        cognito.admin_create_user.side_effect = ClientError(
            {"Error": {"Code": "UsernameExistsException", "Message": "duplicate"}}, "AdminCreateUser"
        )
        client.return_value = cognito

        result = handler(
            self.event("Admin", json.dumps({"email": "duplicate@example.com", "role": "Mentors"})), None
        )

        self.assertEqual(self.response(409, "An account already exists for this email."), result)
        cognito.admin_delete_user.assert_not_called()

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_unexpected_cognito_failure_maps_to_internal_error(self, client):
        cognito = Mock()
        cognito.admin_add_user_to_group.side_effect = ClientError(
            {"Error": {"Code": "InternalErrorException", "Message": "details"}}, "AdminAddUserToGroup"
        )
        client.return_value = cognito

        result = handler(
            self.event("Admin", json.dumps({"email": "failure@example.com", "role": "Mentors"})), None
        )

        self.assertEqual(self.response(500, "Unable to provision the user."), result)

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_group_assignment_failure_deletes_created_user(self, client):
        cognito = Mock()
        cognito.admin_add_user_to_group.side_effect = ClientError(
            {"Error": {"Code": "InternalErrorException", "Message": "details"}}, "AdminAddUserToGroup"
        )
        client.return_value = cognito

        result = handler(
            self.event("Admin", json.dumps({"email": "group@example.com", "role": "Mentors"})), None
        )

        self.assertEqual(self.response(500, "Unable to provision the user."), result)
        cognito.admin_delete_user.assert_called_once_with(UserPoolId="pool-id", Username="group@example.com")

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_mfa_preference_failure_deletes_created_user(self, client):
        cognito = Mock()
        cognito.admin_set_user_mfa_preference.side_effect = ClientError(
            {"Error": {"Code": "InternalErrorException", "Message": "details"}},
            "AdminSetUserMfaPreference",
        )
        client.return_value = cognito

        result = handler(
            self.event("Admin", json.dumps({"email": "mfa@example.com", "role": "Mentors"})), None
        )

        self.assertEqual(self.response(500, "Unable to provision the user."), result)
        cognito.admin_delete_user.assert_called_once_with(UserPoolId="pool-id", Username="mfa@example.com")

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_boto_core_group_assignment_failure_deletes_created_user(self, client):
        cognito = Mock()
        cognito.admin_add_user_to_group.side_effect = BotoCoreError()
        client.return_value = cognito

        result = handler(
            self.event("Admin", json.dumps({"email": "boto-core@example.com", "role": "Mentors"})), None
        )

        self.assertEqual(self.response(500, "Unable to provision the user."), result)
        cognito.admin_delete_user.assert_called_once_with(UserPoolId="pool-id", Username="boto-core@example.com")

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_cleanup_failure_is_logged_and_returns_safe_error(self, client):
        cognito = Mock()
        cognito.admin_add_user_to_group.side_effect = ClientError(
            {"Error": {"Code": "InternalErrorException", "Message": "details"}}, "AdminAddUserToGroup"
        )
        cognito.admin_delete_user.side_effect = ClientError(
            {"Error": {"Code": "InternalErrorException", "Message": "cleanup details"}}, "AdminDeleteUser"
        )
        client.return_value = cognito

        with self.assertLogs("functions.admin_user_provisioning.main", level="ERROR"):
            result = handler(
                self.event("Admin", json.dumps({"email": "cleanup@example.com", "role": "Mentors"})), None
            )

        self.assertEqual(self.response(500, "Unable to provision the user."), result)
        cognito.admin_delete_user.assert_called_once_with(UserPoolId="pool-id", Username="cleanup@example.com")

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_successful_retry_after_cleanup(self, client):
        cognito = Mock()
        cognito.admin_add_user_to_group.side_effect = [
            ClientError({"Error": {"Code": "InternalErrorException", "Message": "details"}}, "AdminAddUserToGroup"),
            None,
        ]
        client.return_value = cognito
        event = self.event("Admin", json.dumps({"email": "retry@example.com", "role": "Mentors"}))

        first_result = handler(event, None)
        second_result = handler(event, None)

        self.assertEqual(self.response(500, "Unable to provision the user."), first_result)
        self.assertEqual(self.response(201, "User invitation sent."), second_result)
        cognito.admin_delete_user.assert_called_once_with(UserPoolId="pool-id", Username="retry@example.com")

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_missing_user_pool_id_returns_safe_error(self, client):
        with patch.dict(os.environ, {}, clear=True):
            result = handler(
                self.event("Admin", json.dumps({"email": "pool@example.com", "role": "Mentors"})), None
            )

        self.assertEqual(self.response(500, "Unable to provision the user."), result)
        client.assert_not_called()

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_boto3_client_construction_error_returns_safe_error(self, client):
        client.side_effect = BotoCoreError()

        result = handler(
            self.event("Admin", json.dumps({"email": "client@example.com", "role": "Mentors"})), None
        )

        self.assertEqual(self.response(500, "Unable to provision the user."), result)

    @patch("functions.admin_user_provisioning.main.boto3.client")
    def test_invalid_email_is_rejected(self, client):
        result = handler(
            self.event("Admin", json.dumps({"email": "not-an-email", "role": "Mentors"})), None
        )

        self.assertEqual(self.response(400, "A valid email is required."), result)
        client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
