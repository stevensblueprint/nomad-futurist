"""API Gateway and Lambda infrastructure for Project Registration and Validation."""

from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_iam as iam
from constructs import Construct


class ApiStack(cdk.Stack):
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

        # API Gateway and Lambda infrastructure
        # will be implemented here.