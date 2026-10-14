from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit

import aws_cdk as cdk
from aws_cdk import (
    aws_apigateway as apigw,
    aws_cognito as cognito,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_logs as logs,
)
from constructs import Construct
from nomad_constructs.lambda_asset import python_lambda_code


FUNCTIONS_ROOT = Path(__file__).resolve().parent.parent / "functions"
DEFAULT_FRONTEND_ORIGIN = "http://localhost:3000"


def _frontend_origin(scope: Construct) -> str:
    value = cdk.App.of(scope).node.try_get_context("frontendOrigin")
    if value is None:
        value = DEFAULT_FRONTEND_ORIGIN
    if not isinstance(value, str) or any(character.isspace() for character in value):
        raise ValueError("CDK context frontendOrigin must be an absolute HTTP or HTTPS origin.")
    try:
        parsed = urlsplit(value)
        valid = (
            parsed.scheme.lower() in {"http", "https"}
            and bool(parsed.hostname)
            and parsed.path == ""
            and not parsed.query
            and not parsed.fragment
            and "?" not in value
            and "#" not in value
            and parsed.username is None
            and parsed.password is None
            and not any(character.isspace() for character in parsed.netloc)
            and "\\" not in parsed.netloc
            and not parsed.netloc.endswith(":")
            and "'" not in value
            and '"' not in value
        )
        _ = parsed.port
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("CDK context frontendOrigin must be an absolute HTTP or HTTPS origin without path, query, fragment, or user info.")
    return value


class ApiConstruct(Construct):
    def __init__(self, scope: Construct, construct_id: str, *, user_pool_id: str, admin_user_provisioning_lambda: lambda_.IFunction,) -> None:
        super().__init__(scope, construct_id)
        frontend_origin = _frontend_origin(self)
        
        registration_lambda_role = iam.Role(
            self,
            "RegistrationLambdaExecutionRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
        )
        registration_lambda_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name(
                "service-role/AWSLambdaBasicExecutionRole"  # Cloudwatch logs permissions
            )
        )

        validation_lambda_role = iam.Role(
            self,
            "ValidationLambdaExecutionRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
        )
        validation_lambda_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name(
                "service-role/AWSLambdaBasicExecutionRole"
            )
        )

        registration_log_group = logs.LogGroup(
            self,
            "ProjectRegistrationLambdaLogGroup",
            retention=logs.RetentionDays.ONE_WEEK,
            removal_policy=cdk.RemovalPolicy.DESTROY,
        )
        validation_log_group = logs.LogGroup(
            self,
            "ProjectValidationLambdaLogGroup",
            retention=logs.RetentionDays.ONE_WEEK,
            removal_policy=cdk.RemovalPolicy.DESTROY,
        )

        registration_lambda = lambda_.Function(
            self,
            "ProjectRegistrationLambda",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="main.handler",
            code=python_lambda_code(FUNCTIONS_ROOT / "registration-lambda"),
            role=registration_lambda_role,
            memory_size=256,
            timeout=cdk.Duration.seconds(10),
            architecture=lambda_.Architecture.ARM_64,
            environment={
                "ENVIRONMENT": "development",
                "FRONTEND_ORIGIN": frontend_origin,
            },
            log_group=registration_log_group,
        )

        validation_lambda = lambda_.Function(
            self,
            "ProjectValidationLambda",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="main.handler",
            code=python_lambda_code(FUNCTIONS_ROOT / "validation-lambda"),
            role=validation_lambda_role,
            memory_size=256,
            timeout=cdk.Duration.seconds(10),
            architecture=lambda_.Architecture.ARM_64,
            environment={
                "ENVIRONMENT": "development",
            },
            log_group=validation_log_group,
        )

        access_log_group = logs.LogGroup(
            self,
            "ProjectApiAccessLogs",
            retention=logs.RetentionDays.ONE_WEEK,
            removal_policy=cdk.RemovalPolicy.DESTROY,
        )


        api = apigw.RestApi(
            self,
            "ProjectApi",
            rest_api_name="nomad-project-api",
            description="Nomad Application API",
            deploy_options=apigw.StageOptions(
                stage_name="dev",
                tracing_enabled=True,
                logging_level=apigw.MethodLoggingLevel.INFO,
                data_trace_enabled=False,
                metrics_enabled=True,
                access_log_destination=apigw.LogGroupLogDestination(
                    access_log_group
                ),
                access_log_format=apigw.AccessLogFormat.json_with_standard_fields(
                    caller=True,
                    http_method=True,
                    ip=True,
                    protocol=True,
                    request_time=True,
                    resource_path=True,
                    response_length=True,
                    status=True,
                    user=True,
                ),
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=[frontend_origin],
                allow_methods=[
                    "GET",
                    "POST",
                    "PATCH",
                    "OPTIONS",
                ],
                allow_headers=[
                    "Content-Type",
                    "Authorization",
                ],
            ),
            cloud_watch_role=True,
        )

        user_pool = cognito.UserPool.from_user_pool_id(
            self, "ExistingUserPool", user_pool_id
        )
        authorizer = apigw.CognitoUserPoolsAuthorizer(
            self, "CognitoAuthorizer", cognito_user_pools=[user_pool],
        )

        # Errors rejected by API Gateway never reach the Lambda's CORS headers.
        for response_id, response_type in (
            ("DefaultClientError", apigw.ResponseType.DEFAULT_4_XX),
            ("DefaultServerError", apigw.ResponseType.DEFAULT_5_XX),
        ):
            api.add_gateway_response(
                response_id,
                type=response_type,
                response_headers={
                    "Access-Control-Allow-Origin": f"'{frontend_origin}'",
                    "Access-Control-Allow-Headers": "'Content-Type,Authorization'",
                    "Access-Control-Allow-Methods": "'GET,POST,PATCH,OPTIONS'",
                },
            )

        registration_integration = apigw.LambdaIntegration(
            registration_lambda, proxy=True,
        )
        validation_integration = apigw.LambdaIntegration(
            validation_lambda, proxy=True,
        )
        admin_user_provisioning_integration = apigw.LambdaIntegration(
            admin_user_provisioning_lambda, proxy=True,
        )

        # Admin User Provisioning routes -> AdminUserProvisioningLambda
        admin = api.root.add_resource("admin")
        users = admin.add_resource("users")
        users.add_method("POST", admin_user_provisioning_integration, authorization_type=apigw.AuthorizationType.COGNITO, authorizer=authorizer,)

        # Project Registration routes -> ProjectRegistrationLambda
        projects = api.root.add_resource("projects")
        projects.add_method(
            "POST", registration_integration,
            authorization_type=apigw.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )
        projects.add_method("GET", registration_integration)

        project_by_id = projects.add_resource("{projectId}")
        project_by_id.add_method("GET", registration_integration)
        project_by_id.add_method("PATCH", registration_integration)

        project_submit = project_by_id.add_resource("submit")
        project_submit.add_method("POST", registration_integration)

        # Project Validation routes -> ProjectValidationLambda
        validation = api.root.add_resource("validation")
        validation_projects = validation.add_resource("projects")
        validation_projects.add_method("GET", validation_integration)

        validation_project_by_id = validation_projects.add_resource("{projectId}")
        validation_project_by_id.add_method("GET", validation_integration)
        validation_project_by_id.add_method("PATCH", validation_integration)


        cdk.CfnOutput(
            self,
            "ProjectApiUrl",
            value=api.url,
            description="Base URL for Nomad Application API",
        )
