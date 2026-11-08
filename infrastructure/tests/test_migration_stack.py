import json
import unittest

import aws_cdk as cdk
from aws_cdk import assertions

from stacks.migration_stack import (
    DB_HOST,
    DB_NAME,
    DB_SECURITY_GROUP_ID,
    DB_USER,
    SUBNET_ID,
    NomadMigrationStack,
)

ENV = cdk.Environment(account="904233098281", region="us-east-1")


def synth() -> assertions.Template:
    # An empty list turns off local bundling (it needs network access and is slow).
    app = cdk.App(context={"aws:cdk:bundling-stacks": []})
    stack = NomadMigrationStack(app, "TestMigrationStack", env=ENV)
    return assertions.Template.from_stack(stack)


class MigrationStackTest(unittest.TestCase):
    def test_creates_only_the_expected_resource_types(self) -> None:
        template = synth()
        types = {r["Type"] for r in template.to_json()["Resources"].values()}
        self.assertEqual(
            {
                "AWS::Lambda::Function",
                "AWS::IAM::Role",
                "AWS::Logs::LogGroup",
                "AWS::EC2::SecurityGroup",
                "AWS::EC2::SecurityGroupIngress",
                "AWS::EC2::SecurityGroupEgress",
            },
            types,
        )
        self.assertNotIn("AWS::RDS::DBInstance", types)
        self.assertNotIn("AWS::EC2::VPC", types)
        self.assertNotIn("AWS::EC2::VPCEndpoint", types)
        self.assertNotIn("AWS::IAM::Policy", types)

    def test_no_secrets_manager_anywhere(self) -> None:
        template = synth()
        self.assertNotIn("secretsmanager", json.dumps(template.to_json()))

    def test_lambda_runs_in_the_private_subnet(self) -> None:
        template = synth()
        template.resource_count_is("AWS::Lambda::Function", 1)
        template.has_resource_properties(
            "AWS::Lambda::Function",
            {
                "FunctionName": "nomad-db-migrator",
                "Runtime": "python3.12",
                "Handler": "handler.handler",
                "Architectures": ["arm64"],
                "Timeout": 300,
                "Environment": {
                    "Variables": {
                        "DB_HOST": DB_HOST,
                        "DB_USER": DB_USER,
                        "DB_NAME": DB_NAME,
                        "DB_PORT": "5432",
                    }
                },
                "VpcConfig": {
                    "SubnetIds": [SUBNET_ID],
                    "SecurityGroupIds": [assertions.Match.any_value()],
                },
            },
        )

    def test_environment_has_no_password_like_names(self) -> None:
        template = synth()
        functions = template.find_resources("AWS::Lambda::Function")
        self.assertEqual(1, len(functions))
        props = next(iter(functions.values()))["Properties"]
        variables = props["Environment"]["Variables"]
        for name in variables:
            lowered = name.lower()
            self.assertNotIn("password", lowered)
            self.assertNotIn("secret", lowered)

    def test_database_security_group_allows_only_the_migrator_group(self) -> None:
        template = synth()
        template.resource_count_is("AWS::EC2::SecurityGroupIngress", 1)
        template.has_resource_properties(
            "AWS::EC2::SecurityGroupIngress",
            {
                "GroupId": DB_SECURITY_GROUP_ID,
                "IpProtocol": "tcp",
                "FromPort": 5432,
                "ToPort": 5432,
                "SourceSecurityGroupId": assertions.Match.any_value(),
            },
        )
        ingress = template.find_resources("AWS::EC2::SecurityGroupIngress")
        for rule in ingress.values():
            self.assertNotIn("CidrIp", rule["Properties"])

    def test_exactly_one_security_group(self) -> None:
        template = synth()
        template.resource_count_is("AWS::EC2::SecurityGroup", 1)

    def test_migrator_egress_only_to_database_on_5432(self) -> None:
        template = synth()
        template.resource_count_is("AWS::EC2::SecurityGroupEgress", 1)
        template.has_resource_properties(
            "AWS::EC2::SecurityGroupEgress",
            {
                "DestinationSecurityGroupId": DB_SECURITY_GROUP_ID,
                "IpProtocol": "tcp",
                "FromPort": 5432,
                "ToPort": 5432,
            },
        )
        egress = template.find_resources("AWS::EC2::SecurityGroupEgress")
        for rule in egress.values():
            self.assertNotIn("CidrIp", rule["Properties"])
