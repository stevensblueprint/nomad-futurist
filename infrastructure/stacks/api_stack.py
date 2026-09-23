"""API Gateway and Lambda infrastructure for Project Registration and Validation."""

from __future__ import annotations

from pathlib import Path

import aws_cdk as cdk
from aws_cdk import (
    Stack,
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

        # API Gateway and route integrations will be added in later steps.
