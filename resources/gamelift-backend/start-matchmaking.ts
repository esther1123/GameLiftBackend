import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { CognitoIdentityServiceProvider, DynamoDB, GameLift } from 'aws-sdk';
import { getErrorMessage, getPlayerData, isNotAuthorizedException } from '../utility-functions';

const cognito = new CognitoIdentityServiceProvider();
const dynamoDb = new DynamoDB.DocumentClient();
const gamelift = new GameLift();

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    let latencyInfo;
    try {
        latencyInfo = JSON.parse(event.body || '{}');
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

    const accessToken = event.headers['Authorization'] as string;
    console.log(`accessToken: ${accessToken}`);

    const playerTableName = process.env.DDB_PLAYER_TABLE as string;
    const flexMatchConfigName = process.env.FLEXMATCH_CONFIG as string;
    console.log(`playerTableName: ${playerTableName}`);
    console.log(`flexMatchConfigName: ${flexMatchConfigName}`);

    try {
        const playerItem = await getPlayerData(cognito, dynamoDb, accessToken, playerTableName);
        console.log(`playerItem: ${JSON.stringify(playerItem, null, 2)}`);
        if (playerItem == undefined) {
            return {
                statusCode: 500,
                body: 'Internal error, please try again later'
            };
        }

	    const playerSkill = 100 * playerItem.Wins - 30 * playerItem.Losses
        const startMmParams : GameLift.StartMatchmakingInput = {
            ConfigurationName: flexMatchConfigName,
            Players: [
                {
                    PlayerId: playerItem.Id,
                    LatencyInMs: latencyInfo,
                    PlayerAttributes: {
                        'skill': {
                            N: playerSkill
                        }
                    }
                }
            ]
        }
        const startMmOutput = await gamelift.startMatchmaking(startMmParams).promise();
        console.log(`gamelift.startMatchmaking result: ${JSON.stringify(startMmOutput, null, 2)}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                ticketId: startMmOutput.MatchmakingTicket?.TicketId
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
            body: 'Internal error, please try again later'
        };
    }
};
