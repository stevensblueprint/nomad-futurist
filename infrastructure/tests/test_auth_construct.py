import unittest
from pathlib import Path

import aws_cdk as cdk
from aws_cdk import assertions
from aws_cdk import aws_s3_assets as s3_assets

from nomad_constructs.lambda_asset import PYTHON_CACHE_EXCLUDES
from stacks.nomad_stack import NomadStack


class AuthConstructTest(unittest.TestCase):
    def test_nomad_stack_contains_existing_cognito_resources(self) -> None:
        app = cdk.App()
        stack = NomadStack(app, "TestNomadStack")
        template = assertions.Template.from_stack(stack)

        template.resource_count_is("AWS::Cognito::UserPool", 1)
        template.resource_count_is("AWS::Cognito::UserPoolClient", 1)
        template.resource_count_is("AWS::Cognito::UserPoolGroup", 4)

    def test_nomad_stack_provisions_the_admin_user_lambda_with_scoped_access(self) -> None:
        app = cdk.App()
        stack = NomadStack(app, "TestNomadStack")
        provisioning_asset = s3_assets.Asset(
            stack,
            "ExpectedAdminUserProvisioningAsset",
            path=str(
                Path(__file__).parent.parent
                / "functions"
                / "admin_user_provisioning"
            ),
            exclude=list(PYTHON_CACHE_EXCLUDES),
        )
        template = assertions.Template.from_stack(stack)

        template.resource_count_is("AWS::Lambda::Function", 4)
        resources = template.to_json()["Resources"]
        user_pool_logical_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::Cognito::UserPool"
        )
        lambda_logical_id, provisioning_lambda = next(
            (logical_id, resource)
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::Lambda::Function"
            and "USER_POOL_ID" in resource["Properties"].get("Environment", {}).get("Variables", {})
        )
        lambda_properties = provisioning_lambda["Properties"]

        self.assertEqual("main.handler", lambda_properties["Handler"])
        self.assertEqual("python3.12", lambda_properties["Runtime"])
        self.assertEqual(
            provisioning_asset.s3_object_key, lambda_properties["Code"]["S3Key"]
        )
        self.assertEqual(
            {"Ref": user_pool_logical_id},
            lambda_properties["Environment"]["Variables"]["USER_POOL_ID"],
        )

        expected_actions = [
            "cognito-idp:AdminCreateUser",
            "cognito-idp:AdminAddUserToGroup",
            "cognito-idp:AdminSetUserMFAPreference",
            "cognito-idp:AdminDeleteUser",
        ]
        policies = template.find_resources("AWS::IAM::Policy")
        statements = [
            statement
            for policy in policies.values()
            for statement in policy["Properties"]["PolicyDocument"]["Statement"]
            if statement.get("Action") == expected_actions
        ]

        self.assertEqual(1, len(statements))
        self.assertEqual(
            {"Fn::GetAtt": [user_pool_logical_id, "Arn"]}, statements[0]["Resource"]
        )

    def test_nomad_stack_preserves_the_admin_user_api_route(self) -> None:
        app = cdk.App()
        stack = NomadStack(app, "TestNomadStack")
        template = assertions.Template.from_stack(stack)

        template.resource_count_is("AWS::ApiGateway::RestApi", 1)
        template.resource_count_is("AWS::ApiGateway::Authorizer", 1)

        resources = template.to_json()["Resources"]
        user_pool_logical_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::Cognito::UserPool"
        )
        lambda_logical_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::Lambda::Function"
            and "USER_POOL_ID" in resource["Properties"].get("Environment", {}).get("Variables", {})
        )
        admin_logical_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "admin"
        )
        users_logical_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "users"
            and resource["Properties"]["ParentId"] == {"Ref": admin_logical_id}
        )
        authorizer_logical_id, authorizer = next(
            (logical_id, resource)
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::ApiGateway::Authorizer"
        )
        provider_arn = authorizer["Properties"]["ProviderARNs"][0]["Fn::Join"][1]
        self.assertEqual(
            {"Ref": user_pool_logical_id}, provider_arn[-1]
        )
        self.assertIn(":userpool/", provider_arn)

        post_methods = [
            resource
            for resource in resources.values()
            if resource["Type"] == "AWS::ApiGateway::Method"
            and resource["Properties"]["HttpMethod"] == "POST"
            and resource["Properties"]["ResourceId"] == {"Ref": users_logical_id}
        ]
        self.assertEqual(1, len(post_methods))
        post_method = post_methods[0]["Properties"]
        self.assertEqual("COGNITO_USER_POOLS", post_method["AuthorizationType"])
        self.assertEqual({"Ref": authorizer_logical_id}, post_method["AuthorizerId"])
        self.assertEqual("AWS_PROXY", post_method["Integration"]["Type"])
        self.assertIn(
            {"Fn::GetAtt": [lambda_logical_id, "Arn"]},
            post_method["Integration"]["Uri"]["Fn::Join"][1],
        )

    def test_nomad_stack_uses_the_existing_nomad_ses_domain(self) -> None:
        app = cdk.App()
        template = assertions.Template.from_stack(NomadStack(app, "TestNomadStack"))

        template.resource_count_is("AWS::SES::EmailIdentity", 0)
        pools = template.find_resources("AWS::Cognito::UserPool")
        pool = next(iter(pools.values()))
        email = pool["Properties"]["EmailConfiguration"]
        self.assertEqual("DEVELOPER", email["EmailSendingAccount"])
        self.assertEqual("Nomad Incubator <no-reply@nomadfuturist.org>", email["From"])
        self.assertIn(":identity/nomadfuturist.org", str(email["SourceArn"]))
        self.assertEqual("Retain", pool["DeletionPolicy"])
        self.assertEqual("Retain", pool["UpdateReplacePolicy"])

    def test_post_confirmation_keeps_its_trigger_and_standalone_scoped_policy(self) -> None:
        app = cdk.App()
        template = assertions.Template.from_stack(NomadStack(app, "TestNomadStack"))
        resources = template.to_json()["Resources"]
        pool_id, pool = next(
            (logical_id, resource)
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::Cognito::UserPool"
        )
        function_id = pool["Properties"]["LambdaConfig"]["PostConfirmation"]["Fn::GetAtt"][0]
        function = resources[function_id]["Properties"]
        self.assertEqual("handler.handler", function["Handler"])
        self.assertEqual("python3.12", function["Runtime"])
        role_id = function["Role"]["Fn::GetAtt"][0]
        policies = [
            resource["Properties"]
            for resource in resources.values()
            if resource["Type"] == "AWS::IAM::Policy"
            and resource["Properties"].get("Roles") == [{"Ref": role_id}]
        ]
        self.assertEqual(1, len(policies))
        self.assertEqual([
            {
                "Action": "cognito-idp:AdminAddUserToGroup",
                "Effect": "Allow",
                "Resource": {"Fn::GetAtt": [pool_id, "Arn"]},
            }
        ], policies[0]["PolicyDocument"]["Statement"])
        self.assertNotIn("Policies", resources[role_id]["Properties"])
        template.has_resource_properties("AWS::Lambda::Permission", {
            "Action": "lambda:InvokeFunction",
            "FunctionName": {"Fn::GetAtt": [function_id, "Arn"]},
            "Principal": "cognito-idp.amazonaws.com",
            "SourceArn": {"Fn::GetAtt": [pool_id, "Arn"]},
            "SourceAccount": {"Ref": "AWS::AccountId"},
        })

    def test_nomad_stack_exports_non_secret_cognito_configuration(self) -> None:
        app = cdk.App()
        stack = NomadStack(app, "TestNomadStack")
        template = assertions.Template.from_stack(stack)

        outputs = template.to_json().get("Outputs", {})

        self.assertGreaterEqual(len(outputs), 3)
        self.assertTrue(
            any(
                output.get("Description") == "Nomad Cognito User Pool ID"
                and "Ref" in output.get("Value", {})
                for output in outputs.values()
            )
        )
        self.assertTrue(
            any(
                output.get("Description") == "Nomad Cognito User Pool App Client ID"
                and "Ref" in output.get("Value", {})
                for output in outputs.values()
            )
        )
        self.assertTrue(
            any(
                output.get("Description") == "AWS region containing Nomad Cognito resources"
                for output in outputs.values()
            )
        )


if __name__ == "__main__":
    unittest.main()
