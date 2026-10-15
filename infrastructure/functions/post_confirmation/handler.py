import boto3


cognito_client = boto3.client('cognito-idp')

def handler(event, context):
    if(event["triggerSource"] != "PostConfirmation_ConfirmSignUp"):
        return event
    userpoolid = event.get('userPoolId')
    username = event.get('userName')
    respose = cognito_client.admin_add_user_to_group(
        UserPoolId = userpoolid,
        Username = username,
        GroupName="Founders"
    )
    return event


