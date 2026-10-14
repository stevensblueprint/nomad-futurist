import os

import aws_cdk as cdk

from constructs import Construct

class DatabaseConstruct (Construct):
    def __init__(self, scope: Construct, construct_id: str) -> None:
        super().__init__(scope, construct_id)

        template = os.path.join(os.path.dirname(__file__), "rds_template.yaml")

        self.template = cdk.cloudformation_include.CfnInclude(
            self, "Template", template_file=template
        )
        self.db = self.template.get_resource("RDSDBInstance")
