import unittest

import aws_cdk as cdk
from aws_cdk import assertions

from stacks.nomad_stack import NomadStack


class ProjectApiConstructTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = cdk.App()
        stack = NomadStack(app, "ProjectApiTest")
        cls.template = assertions.Template.from_stack(stack)
        cls.resources = cls.template.to_json()["Resources"]

    def test_creation_is_authorized_and_all_registration_routes_are_preserved(self):
        projects_id = next(
            key for key, resource in self.resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "projects"
            and "ParentId" in resource["Properties"]
            and "Fn::GetAtt" in resource["Properties"]["ParentId"]
        )
        by_id = next(
            key for key, resource in self.resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "{projectId}"
            and resource["Properties"]["ParentId"] == {"Ref": projects_id}
        )
        submit_id = next(
            key for key, resource in self.resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "submit"
            and resource["Properties"]["ParentId"] == {"Ref": by_id}
        )
        methods = {
            (resource["Properties"]["ResourceId"].get("Ref"), resource["Properties"]["HttpMethod"]): resource["Properties"]
            for resource in self.resources.values()
            if resource["Type"] == "AWS::ApiGateway::Method"
        }
        create = methods[(projects_id, "POST")]
        self.assertEqual("COGNITO_USER_POOLS", create["AuthorizationType"])
        self.assertIn("AuthorizerId", create)
        registration_uri = create["Integration"]["Uri"]
        for route in ((projects_id, "GET"), (by_id, "GET"), (by_id, "PATCH"), (submit_id, "POST")):
            self.assertEqual("NONE", methods[route]["AuthorizationType"])
            self.assertEqual(registration_uri, methods[route]["Integration"]["Uri"])
        self.assertEqual("AWS_PROXY", create["Integration"]["Type"])
        preflight = methods[(projects_id, "OPTIONS")]
        self.assertEqual("NONE", preflight["AuthorizationType"])
        headers = preflight["Integration"]["IntegrationResponses"][0]["ResponseParameters"]
        self.assertIn("Authorization", headers["method.response.header.Access-Control-Allow-Headers"])
        self.assertEqual("'http://localhost:3000'", headers["method.response.header.Access-Control-Allow-Origin"])

    def test_gateway_errors_have_cors_headers(self):
        for response_type in ("DEFAULT_4XX", "DEFAULT_5XX"):
            self.template.has_resource_properties("AWS::ApiGateway::GatewayResponse", {
                "ResponseType": response_type,
                "ResponseParameters": assertions.Match.object_like({
                    "gatewayresponse.header.Access-Control-Allow-Origin": "'http://localhost:3000'",
                    "gatewayresponse.header.Access-Control-Allow-Headers": "'Content-Type,Authorization'",
                }),
            })

    def test_registration_lambda_has_only_basic_execution_permissions(self):
        registration = next(
            resource for key, resource in self.resources.items()
            if resource["Type"] == "AWS::Lambda::Function"
            and "ProjectRegistrationLambda" in key
        )["Properties"]
        role_id = registration["Role"]["Fn::GetAtt"][0]
        role = self.resources[role_id]["Properties"]
        self.assertNotIn("Policies", role)
        policies = role["ManagedPolicyArns"]
        self.assertEqual(1, len(policies))
        self.assertIn("service-role/AWSLambdaBasicExecutionRole", str(policies))
        for resource in self.resources.values():
            if resource["Type"] == "AWS::IAM::Policy":
                self.assertNotIn({"Ref": role_id}, resource["Properties"].get("Roles", []))
        self.assertNotIn("VpcConfig", registration)
        self.assertEqual({"ENVIRONMENT": "development"}, registration["Environment"]["Variables"])


if __name__ == "__main__":
    unittest.main()
