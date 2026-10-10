import aws_cdk as cdk
from aws_cdk import aws_cognito as cognito
from aws_cdk import aws_iam as iam
from aws_cdk import aws_lambda as lambda_
from constructs import Construct
from aws_cdk import aws_ses as ses

	
            
class AuthConstruct(Construct):
    def __init__(self, scope: Construct, construct_id: str) -> None:
        super().__init__(scope, construct_id)
        # Cognito User Pool
        sender_email = "eli6@stevens.edu"
        self.ses_identity = ses.EmailIdentity(
            self, "AuthEmailIdentity", 
            identity= ses.Identity.email(sender_email)
        )

        self.user_pool = cognito.CfnUserPool(
            self,
            "CognitoUserPool",
            user_pool_name="nomad_incubator",
            username_attributes=["email"],
            auto_verified_attributes=["email"],
            mfa_configuration="OPTIONAL",
            enabled_mfas=["EMAIL_OTP"],
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
            email_configuration= cognito.CfnUserPool.EmailConfigurationProperty(
                email_sending_account="DEVELOPER",
                source_arn = self.ses_identity.email_identity_arn,
                from_=f"Nomad Incubator <{sender_email}>"
            )
        )
        self.user_pool.node.add_dependency(self.ses_identity)
        self._retain(self.user_pool)
        # App Client
        self.app_client = cognito.CfnUserPoolClient(
            self,
            "CognitoUserPoolClientSPA",
            user_pool_id=self.user_pool.ref,
            client_name="nomad_incubator_SPA",
            generate_secret = False,
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
        self._retain(self.app_client)
        # User Groups
        self.groups = []
        for logical_id, group_name in (
            ("CognitoUserPoolGroupFounders", "Founders"),
            ("CognitoUserPoolGroupTechnicalStaff", "TechnicalStaff"),
            ("CognitoUserPoolGroupMentors", "Mentors"),
            ("CognitoUserPoolGroupAdmin", "Admin"),
        ):
            group = cognito.CfnUserPoolGroup(
                self,
                logical_id,
                user_pool_id=self.user_pool.ref,
                group_name=group_name,
            )
            self._retain(group)
            self.groups.append(group)

        self.admin_user_provisioning_lambda = lambda_.Function(
            self,
            "AdminUserProvisioningLambda",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="main.handler",
            code=lambda_.Code.from_asset("functions/admin_user_provisioning"),
            environment={"USER_POOL_ID": self.user_pool.ref},
        )
        self.admin_user_provisioning_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "cognito-idp:AdminCreateUser",
                    "cognito-idp:AdminAddUserToGroup",
                    "cognito-idp:AdminSetUserMFAPreference",
                    "cognito-idp:AdminDeleteUser",
                ],
                resources=[self.user_pool.attr_arn],
            )
        )

        cdk.CfnOutput(
            self,
            "CognitoUserPoolId",
            value=self.user_pool.ref,
            description="Nomad Cognito User Pool ID",
        )
        cdk.CfnOutput(
            self,
            "CognitoUserPoolAppClientId",
            value=self.app_client.ref,
            description="Nomad Cognito User Pool App Client ID",
        )
        cdk.CfnOutput(
            self,
            "AwsRegion",
            value=cdk.Stack.of(self).region,
            description="AWS region containing Nomad Cognito resources",
        )

    @staticmethod
    def _retain(resource: cdk.CfnResource) -> None:
        resource.cfn_options.deletion_policy = cdk.CfnDeletionPolicy.RETAIN
        resource.cfn_options.update_replace_policy = cdk.CfnDeletionPolicy.RETAIN
