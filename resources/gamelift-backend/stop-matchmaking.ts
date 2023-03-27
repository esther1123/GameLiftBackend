import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { GameLift } from 'aws-sdk';
import { getErrorMessage, isNotFoundException } from '../utility-functions';

const gamelift = new GameLift();

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    if (event.pathParameters == null) {
        return {
            statusCode: 400,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                message: 'No TicketId in request path'
            })
        }
    }

    const ticketId = event.pathParameters['tid'] as string;
    console.log(`ticketId: ${ticketId}`);

    try {
        const params : GameLift.StopMatchmakingInput = {
            TicketId: ticketId
        }
        const stopMmOutput = await gamelift.stopMatchmaking(params).promise();
        console.log(`gamelift.stopMatchmaking result: ${JSON.stringify(stopMmOutput, null, 2)}`);

        return {
            statusCode: 200,
            body: ""
        };

    } catch (err) {
        console.error(getErrorMessage(err));

        if (isNotFoundException(err)) {
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
