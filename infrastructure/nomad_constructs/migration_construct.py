"""Lambda that runs the database migrations from inside the VPC."""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

import aws_cdk as cdk
import jsii
from aws_cdk import (
    aws_ec2 as ec2,
    aws_lambda as lambda_,
    aws_logs as logs,
)
from constructs import Construct

REPO_ROOT = Path(__file__).resolve().parents[2]
HANDLER_DIR = REPO_ROOT / "infrastructure" / "functions" / "db_migrator"
MIGRATIONS_DIR = REPO_ROOT / "backend" / "migrations"
TESTS_DIR = REPO_ROOT / "backend" / "tests" / "db"
INTEGRITY_TEST_FILES = ("conftest.py", "test_integrity.py")
# typing_extensions is listed on purpose: psycopg needs it on Python 3.12 only, and pip
# evaluates that condition on the build machine (which may run a newer Python).
PIP_REQUIREMENTS = ("psycopg[binary]>=3.2,<4", "pytest>=8", "typing_extensions>=4.6")
_IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc")


def _source_files() -> list[Path]:
    """Every file that goes into the package, in a stable order."""
    files = [HANDLER_DIR / "handler.py", HANDLER_DIR / "rds-global-bundle.crt"]
    files += [MIGRATIONS_DIR / "migrate.py", MIGRATIONS_DIR / "verify.py", MIGRATIONS_DIR / "report.py"]
    files += sorted((MIGRATIONS_DIR / "versions").glob("*.sql"))
    files += [TESTS_DIR / name for name in INTEGRITY_TEST_FILES]
    return files


def source_hash() -> str:
    """Asset hash from the package inputs, so `cdk diff` is stable and changes with the SQL."""
    digest = hashlib.sha256()
    for path in _source_files():
        digest.update(path.relative_to(REPO_ROOT).as_posix().encode())
        digest.update(path.read_bytes())
    digest.update("\n".join(PIP_REQUIREMENTS).encode())
    return digest.hexdigest()


@jsii.implements(cdk.ILocalBundling)
class _LocalBundling:
    """Build the Lambda package on this machine (no Docker)."""

    def try_bundle(self, output_dir: str, options: cdk.BundlingOptions) -> bool:
        out = Path(output_dir)
        shutil.copy2(HANDLER_DIR / "handler.py", out / "handler.py")
        shutil.copy2(HANDLER_DIR / "rds-global-bundle.crt", out / "rds-global-bundle.crt")
        shutil.copytree(MIGRATIONS_DIR / "versions", out / "migrations" / "versions", ignore=_IGNORE)
        for name in ("migrate.py", "verify.py", "report.py"):
            shutil.copy2(MIGRATIONS_DIR / name, out / "migrations" / name)
        (out / "tests" / "db").mkdir(parents=True)
        for name in INTEGRITY_TEST_FILES:
            shutil.copy2(TESTS_DIR / name, out / "tests" / "db" / name)
        subprocess.run(
            [
                sys.executable, "-m", "pip", "install",
                "--quiet", "--no-compile", "--upgrade",
                "--target", str(out),
                "--platform", "manylinux2014_aarch64",
                "--implementation", "cp",
                "--python-version", "3.12",
                "--only-binary=:all:",
                *PIP_REQUIREMENTS,
            ],
            check=True,
        )
        return True


class MigrationConstruct(Construct):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        vpc_id: str,
        availability_zone: str,
        subnet_id: str,
        db_security_group_id: str,
        db_host: str,
        db_user: str,
        db_name: str,
    ) -> None:
        super().__init__(scope, construct_id)

        vpc = ec2.Vpc.from_vpc_attributes(
            self,
            "Vpc",
            vpc_id=vpc_id,
            vpc_cidr_block="10.0.0.0/16",
            availability_zones=[availability_zone],
            private_subnet_ids=[subnet_id],
        )
        subnet = ec2.Subnet.from_subnet_attributes(
            self, "Subnet", subnet_id=subnet_id, availability_zone=availability_zone
        )
        subnets = ec2.SubnetSelection(subnets=[subnet])

        migrator_sg = ec2.SecurityGroup(
            self,
            "MigratorSecurityGroup",
            vpc=vpc,
            description="DB migrator Lambda",
            allow_all_outbound=False,
        )
        # Adds an ingress rule to the existing RDS security group and the matching
        # egress rule to the migrator security group. The existing 155.246.151.34/32
        # rule is not touched.
        db_sg = ec2.SecurityGroup.from_security_group_id(
            self, "DbSecurityGroup", db_security_group_id
        )
        db_sg.connections.allow_from(
            migrator_sg, ec2.Port.tcp(5432), "DB migrator Lambda to PostgreSQL"
        )

        log_group = logs.LogGroup(
            self,
            "MigratorLogGroup",
            retention=logs.RetentionDays.ONE_WEEK,
            removal_policy=cdk.RemovalPolicy.DESTROY,
        )
        self.function = lambda_.Function(
            self,
            "MigratorFunction",
            function_name="nomad-db-migrator",
            description="Runs the Nomad SQL migrations against the private RDS instance",
            runtime=lambda_.Runtime.PYTHON_3_12,
            architecture=lambda_.Architecture.ARM_64,
            handler="handler.handler",
            code=lambda_.Code.from_asset(
                str(HANDLER_DIR),
                bundling=cdk.BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_12.bundling_image,
                    command=["bash", "-c", "exit 1"],  # never used: local bundling must succeed
                    local=_LocalBundling(),
                ),
                asset_hash_type=cdk.AssetHashType.CUSTOM,
                asset_hash=source_hash(),
            ),
            memory_size=512,
            timeout=cdk.Duration.minutes(5),
            vpc=vpc,
            vpc_subnets=subnets,
            security_groups=[migrator_sg],
            allow_public_subnet=False,
            environment={
                "DB_HOST": db_host,
                "DB_USER": db_user,
                "DB_NAME": db_name,
                "DB_PORT": "5432",
            },
            log_group=log_group,
        )
