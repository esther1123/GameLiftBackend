import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import fetch from 'node-fetch';
import { getErrorMessage } from '../utility-functions';

interface CognitoTokenResponse {
    'id_token': string,
    'access_token': string,
    'refresh_token': string,
    'expires_in': string
};

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    let authzCode = '';
    try {
        const bodyJSON = JSON.parse(event.body || '{}');
        authzCode = bodyJSON.authzCode as string;
        console.log(`authzCode: ${authzCode}`);
        if (authzCode == undefined) {
            return {
                statusCode: 400,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    message: 'No \'authzCode\' field'
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

    const cognitoDomain = process.env.COGNITO_DOMAIN as string;
    const cognitoClientId = process.env.COGNITO_CLIENT_ID as string;
    const cognitoCallbackUrl = process.env.COGNITO_CALLBACK_URL as string;
    console.log(`cognitoDomain: ${JSON.stringify(cognitoDomain, null, 2)}`);
    console.log(`cognitoClientId: ${JSON.stringify(cognitoClientId, null, 2)}`);
    console.log(`cognitoCallbackUrl: ${JSON.stringify(cognitoCallbackUrl, null, 2)}`);

    try {
        const tokenEndpoint = `https://${cognitoDomain}/oauth2/token?`
        const queryStringParams = new URLSearchParams({
            code: authzCode,
            'grant_type': 'authorization_code',
            'client_id': cognitoClientId,
            'redirect_uri': cognitoCallbackUrl
        });

        const response = await fetch(tokenEndpoint + queryStringParams, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
        });

        if (!response.ok) {
            console.log(`Receive error response from token endpoint. status: ${response.status}`)
            if (response.status < 500) {
                return {
                    statusCode: response.status,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        message: 'Invalid authorization code. The code can only be exchanged once.'
                    }),
                };
            } else {
                return {
                    statusCode: 500,
                    body: 'Failed to get tokens from token endpoint, please try again later',
                };
            }
        }

        const cognitoTokens = (await response.json()) as CognitoTokenResponse;
        console.log('cognitoTokens: ', JSON.stringify(cognitoTokens, null, 2));

        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                accessToken: cognitoTokens['access_token'],
                refreshToken: cognitoTokens['refresh_token'],
                expiresIn: cognitoTokens['expires_in'],
            }),
        };

    } catch (err) {
        console.error(getErrorMessage(err));
        return {
            statusCode: 500,
            body: 'Internal error, please try again later',
        };
    }
};
