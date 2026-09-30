import aws_cdk as cdk
from aws_cdk import aws_cognito as cognito
from constructs import Construct

class AuthConstruct (Construct):
	def __init__(self, scope: Construct, construct_id: str) -> None:
		super().__init__(scope, construct_id)

		# Cognito User Pool
		self.user_pool = cognito.UserPool(
			self, "NomadUserPool",
			user_pool_name = "nomad_incubator",
			self_sign_up_enabled=True,
			sign_in_aliases = cognito.SignInAliases(username=True, email=True)
			
		)
		# App Client
		self.user_pool_client = self.user_pool.add_client(
			"NomadWebClient", 
			user_pool_client_name="nomad_incubator_SPA",
			generate_secret=False,
			
			supported_identity_providers=[
				cognito.UserPoolClientIdentityProvider.COGNITO
			],
			auth_flows=cognito.AuthFlow(
				user_srp = True
			)

		)
		# User Groups
		groups = ["Founders", "Technical_Staff", "Mentors", "Admin"] 
		self.groups = {} 
		for group_name in groups: 
			clean_id = group_name.replace(" ", "") 
			self.groups[group_name] = cognito.CfnUserPoolGroup(
				self, 
				f"Group{clean_id}", 
				user_pool_id=self.user_pool.user_pool_id, 
				group_name=group_name, 
				description=f"{group_name} role group for Nomad Incubator platform", )
