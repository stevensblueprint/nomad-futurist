import aws_cdk as cdk

from constructs import Construct

class StorageConstruct (Construct):
	def __init__(self, scope: Construct, construct_id: str) -> None:
		super().__init__(scope, construct_id)

		# S3
