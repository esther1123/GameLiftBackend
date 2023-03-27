import { Context, PreSignUpTriggerEvent } from 'aws-lambda';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { getErrorMessage } from '../utility-functions';

const cognito = new CognitoIdentityServiceProvider();

export const handler = async (event: PreSignUpTriggerEvent, context: Context): Promise<PreSignUpTriggerEvent> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    event.response.autoVerifyEmail = true;
    event.response.autoConfirmUser = true;

    try {
        const params : CognitoIdentityServiceProvider.ListUsersRequest = {
            UserPoolId: event.userPoolId,
            Filter: `email = "${event.request.userAttributes.email}"`
        }
        const listUsrOutput = await cognito.listUsers(params).promise();
        if (listUsrOutput.Users != undefined && listUsrOutput.Users.length > 0) {
            throw new Error("Email is already taken");
        }
    } catch (err) {
        console.error(getErrorMessage(err))
        throw err;
    }

    return event;
};
