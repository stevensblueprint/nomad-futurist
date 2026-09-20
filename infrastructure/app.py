import os

import aws_cdk as cdk

from stacks.api_stack import ApiStack
from stacks.auth_stack import AuthStack
from stacks.db_stack import DatabaseStack


app = cdk.App()

environment = cdk.Environment(
    account=os.getenv("CDK_DEFAULT_ACCOUNT"),
    region=os.getenv("CDK_DEFAULT_REGION", "us-east-1"),
)

AuthStack(
    app,
    "NomadAuthStack",
    env=environment,
)

DatabaseStack(
    app,
    "NomadDatabaseStack",
    env=environment,
)

ApiStack(
    app,
    "NomadApiStack",
    env=environment,
)

app.synth()