from aws_cdk import aws_apigateway as apigateway
from aws_cdk import aws_cognito as cognito
from aws_cdk import aws_lambda as lambda_
from constructs import Construct


class ApiConstruct(Construct):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        user_pool_id: str,
        admin_user_provisioning_lambda: lambda_.IFunction,
    ) -> None:
        super().__init__(scope, construct_id)

        user_pool = cognito.UserPool.from_user_pool_id(
            self, "ExistingUserPool", user_pool_id
        )
        api = apigateway.RestApi(self, "RestApi")
        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self,
            "AdminUserAuthorizer",
            cognito_user_pools=[user_pool],
        )
        users = api.root.add_resource("admin").add_resource("users")
        users.add_method(
            "POST",
            apigateway.LambdaIntegration(admin_user_provisioning_lambda),
            authorization_type=apigateway.AuthorizationType.COGNITO,
            authorizer=authorizer,
        )
