"""API Gateway and Lambda infrastructure for Project Registration and Validation."""

from __future__ import annotations

from pathlib import Path

import aws_cdk as cdk
from aws_cdk import (
    Stack,
    aws_apigateway as apigw,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_logs as logs,
)
from constructs import Construct

LAMBDA_ROOT = Path(__file__).resolve().parent.parent / "lambda"


class ApiStack(Stack):
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

        ### IAM Roles for Lambda functions ###
        # Project Registration Lambda execution role
        registration_lambda_role = iam.Role(
            self,
            "RegistrationLambdaExecutionRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
        )

        registration_lambda_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name(
                "service-role/AWSLambdaBasicExecutionRole" # Cloudwatch logs permissions
            )
        )

        # Project Validation Lambda execution role
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

        ### Lambda functions ###
        # Project Registration Lambda
        registration_lambda = lambda_.Function(
            self,
            "ProjectRegistrationLambda",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="handler.handler",
            code=lambda_.Code.from_asset(
                str(LAMBDA_ROOT / "project_registration")
            ),
            role=registration_lambda_role,
            memory_size=256,
            timeout=cdk.Duration.seconds(10),
            architecture=lambda_.Architecture.ARM_64,
            environment={
                "ENVIRONMENT": "development",
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # Project Validation Lambda
        validation_lambda = lambda_.Function(
            self,
            "ProjectValidationLambda",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="handler.handler",
            code=lambda_.Code.from_asset(
                str(LAMBDA_ROOT / "project_validation")
            ),
            role=validation_lambda_role,
            memory_size=256,
            timeout=cdk.Duration.seconds(10),
            architecture=lambda_.Architecture.ARM_64,
            environment={
                "ENVIRONMENT": "development",
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        ### API Gateway ###
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
            description="Project Registration and Validation API",
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
            cloud_watch_role=True,
        )

        registration_integration = apigw.LambdaIntegration(
            registration_lambda,
            proxy=True,
        )
        validation_integration = apigw.LambdaIntegration(
            validation_lambda,
            proxy=True,
        )

        # Project Registration routes -> ProjectRegistrationLambda
        projects = api.root.add_resource("projects")
        projects.add_method("POST", registration_integration)
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
            description="Base URL for the Project Registration and Validation API",
        )
