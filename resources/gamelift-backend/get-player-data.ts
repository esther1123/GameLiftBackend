import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { CognitoIdentityServiceProvider, DynamoDB } from 'aws-sdk';
import { getPlayerData, getErrorMessage, isNotAuthorizedException } from '../utility-functions';

const cognito = new CognitoIdentityServiceProvider();
const dynamoDb = new DynamoDB.DocumentClient();

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    const accessToken = event.headers['Authorization'] as string;
    console.log(`accessToken: ${accessToken}`);

    const playerTableName = process.env.DDB_PLAYER_TABLE as string;
    console.log(`playerTableName: ${playerTableName}`);

    try {
        const playerData = await getPlayerData(cognito, dynamoDb, accessToken, playerTableName);
        if (playerData == undefined) {
            return {
                statusCode: 500,
                body: 'Internal error, please try again later',
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                playerId: playerData.Id,
                wins: playerData.Wins,
                losses: playerData.Losses
            }),
        };

    } catch(err) {
        console.error(getErrorMessage(err));
        if (isNotAuthorizedException(err)) {
            return {
                statusCode: 400,
                body: getErrorMessage(err)
            };
        }
        return {
            statusCode: 500,
            body: 'Internal error, please try again later'
        };
    }
};
