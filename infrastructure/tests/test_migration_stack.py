import unittest

import aws_cdk as cdk
from aws_cdk import assertions

from stacks.migration_stack import (
    DB_SECURITY_GROUP_ID,
    SECRET_NAME,
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
                "AWS::IAM::Policy",
                "AWS::Logs::LogGroup",
                "AWS::EC2::SecurityGroup",
                "AWS::EC2::SecurityGroupIngress",
                "AWS::EC2::SecurityGroupEgress",
                "AWS::EC2::VPCEndpoint",
            },
            types,
        )
        self.assertNotIn("AWS::RDS::DBInstance", types)
        self.assertNotIn("AWS::EC2::VPC", types)

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
                "Environment": {"Variables": {"DB_SECRET_NAME": SECRET_NAME}},
                "VpcConfig": {
                    "SubnetIds": [SUBNET_ID],
                    "SecurityGroupIds": [assertions.Match.any_value()],
                },
            },
        )

    def test_database_security_group_allows_only_the_migrator_group(self) -> None:
        template = synth()
        template.resource_count_is("AWS::EC2::SecurityGroupIngress", 2)
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

    def test_secrets_manager_endpoint_uses_private_dns_in_one_subnet(self) -> None:
        template = synth()
        template.resource_count_is("AWS::EC2::VPCEndpoint", 1)
        template.has_resource_properties(
            "AWS::EC2::VPCEndpoint",
            {
                "ServiceName": "com.amazonaws.us-east-1.secretsmanager",
                "VpcEndpointType": "Interface",
                "PrivateDnsEnabled": True,
                "SubnetIds": [SUBNET_ID],
            },
        )

    def test_lambda_can_read_only_the_named_secret(self) -> None:
        template = synth()
        policies = template.find_resources("AWS::IAM::Policy")
        statements = [
            s
            for p in policies.values()
            for s in p["Properties"]["PolicyDocument"]["Statement"]
            if "secretsmanager:GetSecretValue" in s["Action"]
        ]
        self.assertEqual(1, len(statements))
        resource = str(statements[0]["Resource"])
        self.assertIn(SECRET_NAME, resource)
        self.assertNotEqual("*", statements[0]["Resource"])

    def test_migrator_security_group_has_no_open_egress(self) -> None:
        template = synth()
        groups = template.find_resources("AWS::EC2::SecurityGroup")
        for group in groups.values():
            for rule in group["Properties"].get("SecurityGroupEgress", []):
                self.assertNotEqual("0.0.0.0/0", rule.get("CidrIp"))
