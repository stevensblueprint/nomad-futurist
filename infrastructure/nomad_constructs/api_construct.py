import aws_cdk as cdk

from constructs import Construct

class ApiConstruct (Construct):
	def __init__(self, scope: Construct, construct_id: str) -> None:
		super().__init__(scope, construct_id)

		# API Gateway
		# Registration Lambda
		# Validation lambda
		# Task Lambda
