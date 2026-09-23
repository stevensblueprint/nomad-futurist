import aws_cdk as cdk
from aws_cdk import aws_cognito as cognito
from constructs import Construct

class AuthStack(cdk.Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        **kwargs,
    ) -> None:
        super().__init__(
            scope,
            construct_id,
            **kwargs,
        )

        user_pool = cognito.CfnUserPool(
            self,
            "CognitoUserPool",
            user_pool_name="nomad-users",
            username_attributes=["email"],
            auto_verified_attributes=["email"],
            mfa_configuration="OFF",
            deletion_protection="ACTIVE",
            user_pool_tier="ESSENTIALS",
            username_configuration=cognito.CfnUserPool.UsernameConfigurationProperty(
                case_sensitive=False,
            ),
            policies=cognito.CfnUserPool.PoliciesProperty(
                password_policy=cognito.CfnUserPool.PasswordPolicyProperty(
                    minimum_length=8,
                    require_uppercase=True,
                    require_numbers=True,
                    require_lowercase=True,
                    require_symbols=True,
                    temporary_password_validity_days=7,
                ),
                sign_in_policy=cognito.CfnUserPool.SignInPolicyProperty(
                    allowed_first_auth_factors=["PASSWORD"],
                ),
            ),
            verification_message_template=(
                cognito.CfnUserPool.VerificationMessageTemplateProperty(
                    default_email_option="CONFIRM_WITH_CODE",
                )
            ),
            admin_create_user_config=(
                cognito.CfnUserPool.AdminCreateUserConfigProperty(
                    allow_admin_create_user_only=False,
                    unused_account_validity_days=7,
                )
            ),
            email_configuration=cognito.CfnUserPool.EmailConfigurationProperty(
                email_sending_account="COGNITO_DEFAULT",
            ),
            account_recovery_setting=cognito.CfnUserPool.AccountRecoverySettingProperty(
                recovery_mechanisms=[
                    cognito.CfnUserPool.RecoveryOptionProperty(
                        name="verified_email",
                        priority=1,
                    ),
                    cognito.CfnUserPool.RecoveryOptionProperty(
                        name="verified_phone_number",
                        priority=2,
                    ),
                ]
            ),
        )

        client = cognito.CfnUserPoolClient(
            self,
            "CognitoUserPoolClient",
            user_pool_id=user_pool.ref,
            client_name="nomad-incubator",
            generate_secret=True,
            callback_ur_ls=["https://d84l1y8p4kdic.cloudfront.net"],
            allowed_o_auth_flows_user_pool_client=True,
            allowed_o_auth_flows=["code"],
            allowed_o_auth_scopes=["email", "openid", "phone"],
            supported_identity_providers=["COGNITO"],
            explicit_auth_flows=[
                "ALLOW_REFRESH_TOKEN_AUTH",
                "ALLOW_USER_AUTH",
                "ALLOW_USER_SRP_AUTH",
            ],
            access_token_validity=60,
            id_token_validity=60,
            refresh_token_validity=5,
            token_validity_units=cognito.CfnUserPoolClient.TokenValidityUnitsProperty(
                access_token="minutes",
                id_token="minutes",
                refresh_token="days",
            ),
            auth_session_validity=3,
            prevent_user_existence_errors="ENABLED",
            enable_token_revocation=True,
        )

        for logical_id, group_name in (
            ("CognitoUserPoolGroupFounders", "Founders"),
            ("CognitoUserPoolGroupTechnicalStaff", "TechnicalStaff"),
            ("CognitoUserPoolGroupMentors", "Mentors"),
            ("CognitoUserPoolGroupAdmin", "Admin"),
        ):
            cognito.CfnUserPoolGroup(
                self,
                logical_id,
                user_pool_id=user_pool.ref,
                group_name=group_name,
            )

        cdk.CfnOutput(
            self,
            "CognitoUserPoolId",
            value="us-east-1_w11IV6Jfg",
            description="Existing Nomad Cognito User Pool ID",
        )
        cdk.CfnOutput(
            self,
            "CognitoUserPoolAppClientId",
            value=client.ref,
            description="Nomad Cognito User Pool App Client ID",
        )
        cdk.CfnOutput(
            self,
            "AwsRegion",
            value=self.region,
            description="AWS region containing Nomad Cognito resources",
        )
