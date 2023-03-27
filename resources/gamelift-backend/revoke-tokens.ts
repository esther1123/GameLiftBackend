import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { getErrorMessage, isNotAuthorizedException } from '../utility-functions';

const cognito = new CognitoIdentityServiceProvider();

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    const accessToken = event.headers['Authorization'] as string;
    console.log(`accessToken: ${accessToken}`);

    try {
        const params : CognitoIdentityServiceProvider.GlobalSignOutRequest = {
            AccessToken: accessToken
        }
        const signOutOutput = await cognito.globalSignOut(params).promise();
        console.log(`cognito.globalSignOut result: ${JSON.stringify(signOutOutput, null, 2)}`);

        return {
            statusCode: 200,
            body: ''
        };

    } catch (err) {
        console.error(getErrorMessage(err));
        if (isNotAuthorizedException(err)) {
            return {
                statusCode: 400,
                body: getErrorMessage(err)
            };
        }
        return {
            statusCode: 500,
            body: 'Internal error, please try again later',
        };
    }
};
