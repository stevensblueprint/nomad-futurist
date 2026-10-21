import os
import unittest
from unittest.mock import patch

from botocore.exceptions import ClientError

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

from infrastructure.functions.post_confirmation.handler import handler  # noqa: E402

HANDLER_PATH = "infrastructure.functions.post_confirmation.handler"
USER_POOL_ID = "us-east-1_TestPool"
USERNAME = "founder@stevens.edu"


def make_event(trigger_source: str) -> dict:
    return {
        "triggerSource": trigger_source,
        "userPoolId": USER_POOL_ID,
        "userName": USERNAME,
    }


@patch(f"{HANDLER_PATH}.cognito_client")
class TestPostConfirmationHandler(unittest.TestCase):
    def test_confirm_signup_adds_user_to_founders_group(self, mock_cognito):
        event = make_event("PostConfirmation_ConfirmSignUp")

        result = handler(event, None)

        mock_cognito.admin_add_user_to_group.assert_called_once_with(
            UserPoolId=USER_POOL_ID,
            Username=USERNAME,
            GroupName="Founders",
        )
        self.assertEqual(result, event)

    def test_confirm_forgot_password_does_not_assign_group(self, mock_cognito):
        event = make_event("PostConfirmation_ConfirmForgotPassword")

        result = handler(event, None)

        mock_cognito.admin_add_user_to_group.assert_not_called()
        self.assertEqual(result, event)

    def test_group_assignment_failure_is_raised(self, mock_cognito):
        mock_cognito.admin_add_user_to_group.side_effect = ClientError(
            {"Error": {"Code": "ResourceNotFoundException", "Message": "No group"}},
            "AdminAddUserToGroup",
        )

        with self.assertRaises(ClientError):
            handler(make_event("PostConfirmation_ConfirmSignUp"), None)


if __name__ == "__main__":
    unittest.main()