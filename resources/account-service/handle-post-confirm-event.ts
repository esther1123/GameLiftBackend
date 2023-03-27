import { Context, PostConfirmationTriggerEvent } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getErrorMessage } from '../utility-functions';

const dynamoDb = new DynamoDB.DocumentClient();

export const handler = async (event: PostConfirmationTriggerEvent, context: Context): Promise<PostConfirmationTriggerEvent> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    const playerTable = process.env.DDB_PLAYER_TABLE as string;

    try {
        const param = {
            TableName: playerTable,
            Item: {
                Id: event.request.userAttributes.sub,
                Wins: 0,
                Losses: 0
            }
        };
        const putOutput = await dynamoDb.put(param).promise();
        console.log('Save player data: ', putOutput);

    } catch (err) {
        console.error(getErrorMessage(err))
        throw err;
    }

   return event;
};
