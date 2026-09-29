import aws_cdk as cdk

from constructs import Construct

class DatabaseConstruct (Construct):
	def __init__(self, scope: Construct, construct_id: str) -> None:
		super().__init__(scope, construct_id)

		# RDS Postgres
		# Security Groups
		# Related Networking
