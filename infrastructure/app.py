import os

import aws_cdk as cdk

from stacks.nomad_stack import NomadStack


app = cdk.App()

environment = cdk.Environment(
    account=os.getenv("CDK_DEFAULT_ACCOUNT"),
    region=os.getenv("CDK_DEFAULT_REGION", "us-east-1"),
)

NomadStack(
    app,
    "NomadStack",
    env=environment,
)

app.synth()