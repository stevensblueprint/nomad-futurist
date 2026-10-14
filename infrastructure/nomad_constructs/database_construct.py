from pathlib import Path

from aws_cdk import cloudformation_include as cfn_include
from constructs import Construct


class DatabaseConstruct(Construct):
    """Preserve the database and network resources already imported into NomadStack."""

    def __init__(self, scope: Construct, construct_id: str) -> None:
        super().__init__(scope, construct_id)

        # These logical IDs and definitions match the deployed stack. Renaming
        # them would detach retained resources or create replacement resources.
        self.template = cfn_include.CfnInclude(
            self,
            "Template",
            template_file=str(Path(__file__).with_name("rds_template.yaml")),
            preserve_logical_ids=True,
        )
        self.db = self.template.get_resource("RDSDBInstance")
