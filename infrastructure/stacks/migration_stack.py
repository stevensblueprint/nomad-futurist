import aws_cdk as cdk
from constructs import Construct

from nomad_constructs.migration_construct import MigrationConstruct

# These ids come from nomad_constructs/rds_template.yaml (the existing network and database).
VPC_ID = "vpc-0a87c06973c80eb39"
SUBNET_ID = "subnet-0855eb3b6313a0b17"  # nomad-private-a
AVAILABILITY_ZONE = "us-east-1a"
DB_SECURITY_GROUP_ID = "sg-0b0e91786528e3f12"  # nomad-rds-sg
SECRET_NAME = "nomad/db-migration"  # created by hand; holds username, password, host


class NomadMigrationStack(cdk.Stack):
    """One-off tooling that runs database migrations inside the VPC.

    Deploy only on purpose:  npx cdk deploy NomadMigrationStack -c deploy_migrator=true
    Remove with:             npx cdk destroy NomadMigrationStack -c deploy_migrator=true
    """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        migration = MigrationConstruct(
            self,
            "Migration",
            vpc_id=VPC_ID,
            availability_zone=AVAILABILITY_ZONE,
            subnet_id=SUBNET_ID,
            db_security_group_id=DB_SECURITY_GROUP_ID,
            secret_name=SECRET_NAME,
        )
        cdk.CfnOutput(self, "MigratorFunctionName", value=migration.function.function_name)
