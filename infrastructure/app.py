import os

import aws_cdk as cdk

from stacks.migration_stack import NomadMigrationStack
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

# One-off database migration tooling. It is not part of a normal deploy.
if str(app.node.try_get_context("deploy_migrator")).lower() in ("true", "1"):
    NomadMigrationStack(app, "NomadMigrationStack", env=environment)

app.synth()
