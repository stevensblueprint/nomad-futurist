import aws_cdk as cdk

from constructs import Construct

from nomad_constructs.api_construct import ApiConstruct
from nomad_constructs.auth_construct import AuthConstruct
from nomad_constructs.database_construct import DatabaseConstruct
from nomad_constructs.notification_construct import NotificationConstruct
from nomad_constructs.storage_construct import StorageConstruct


class NomadStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs,) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Instantiate application infrastructure constructs
        api = ApiConstruct(self, "Api")
        auth = AuthConstruct(self, "Auth")
        database = DatabaseConstruct(self, "Database")
        notification = NotificationConstruct(self, "Notification")
        storage = StorageConstruct(self, "Storage")