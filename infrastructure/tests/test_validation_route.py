import unittest

import aws_cdk as cdk
from aws_cdk import assertions

from stacks.nomad_stack import NomadStack


class ValidationRouteTest(unittest.TestCase):
    def test_validation_project_patch_route_targets_the_validation_lambda(self) -> None:
        app = cdk.App()
        stack = NomadStack(app, "TestNomadStack")
        template = assertions.Template.from_stack(stack)
        resources = template.to_json()["Resources"]

        validation_lambda_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if logical_id.startswith("ApiProjectValidationLambda")
            and resource["Type"] == "AWS::Lambda::Function"
        )
        validation_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "validation"
        )
        projects_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "projects"
            and resource["Properties"]["ParentId"] == {"Ref": validation_id}
        )
        project_id_resource = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "{projectId}"
            and resource["Properties"]["ParentId"] == {"Ref": projects_id}
        )
        patch_method = next(
            resource["Properties"]
            for resource in resources.values()
            if resource["Type"] == "AWS::ApiGateway::Method"
            and resource["Properties"]["HttpMethod"] == "PATCH"
            and resource["Properties"]["ResourceId"] == {"Ref": project_id_resource}
        )

        self.assertEqual("AWS_PROXY", patch_method["Integration"]["Type"])
        self.assertIn(
            {"Fn::GetAtt": [validation_lambda_id, "Arn"]},
            patch_method["Integration"]["Uri"]["Fn::Join"][1],
        )

    def test_validation_project_post_route_targets_the_validation_lambda(self) -> None:
        app = cdk.App()
        stack = NomadStack(app, "TestNomadStack")
        resources = assertions.Template.from_stack(stack).to_json()["Resources"]

        validation_lambda_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if logical_id.startswith("ApiProjectValidationLambda")
            and resource["Type"] == "AWS::Lambda::Function"
        )
        validation_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "validation"
        )
        projects_id = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "projects"
            and resource["Properties"]["ParentId"] == {"Ref": validation_id}
        )
        project_id_resource = next(
            logical_id
            for logical_id, resource in resources.items()
            if resource["Type"] == "AWS::ApiGateway::Resource"
            and resource["Properties"]["PathPart"] == "{projectId}"
            and resource["Properties"]["ParentId"] == {"Ref": projects_id}
        )
        post_method = next(
            resource["Properties"]
            for resource in resources.values()
            if resource["Type"] == "AWS::ApiGateway::Method"
            and resource["Properties"]["HttpMethod"] == "POST"
            and resource["Properties"]["ResourceId"] == {"Ref": project_id_resource}
        )

        self.assertEqual("AWS_PROXY", post_method["Integration"]["Type"])
        self.assertIn(
            {"Fn::GetAtt": [validation_lambda_id, "Arn"]},
            post_method["Integration"]["Uri"]["Fn::Join"][1],
        )


if __name__ == "__main__":
    unittest.main()
