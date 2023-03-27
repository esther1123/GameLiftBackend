import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { getErrorMessage, isNotAuthorizedException } from '../utility-functions';

const cognito = new CognitoIdentityServiceProvider();

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    let refreshToken = '';
    try {
        const bodyJSON = JSON.parse(event.body || '{}');
        refreshToken = bodyJSON.refreshToken as string;
        console.log(`refreshToken: ${refreshToken}`);
        if (refreshToken == undefined) {
            return {
                statusCode: 400,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    message: 'No \'refreshToken\' field'
                })
            }
        }
    } catch (err) {
        console.log(getErrorMessage(err));
        return {
            statusCode: 400,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                message: 'Invalid JSON body'
            }),
        };
    }

    const cognitoClientId = process.env.COGNITO_CLIENT_ID as string;
    console.log(`cognitoClientId: ${cognitoClientId}`);

    try {
        const params : CognitoIdentityServiceProvider.InitiateAuthRequest = {
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: cognitoClientId,
            AuthParameters: {
                'REFRESH_TOKEN': refreshToken
            }
        }
        const authOutput = await cognito.initiateAuth(params).promise();
        console.log(`cognito.initiateAuth result: ${JSON.stringify(authOutput, null, 2)}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                accessToken: authOutput.AuthenticationResult?.AccessToken
            }),
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
