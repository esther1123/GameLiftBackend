import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getErrorMessage, getTicketOutput } from '../utility-functions';
import { TicketItem } from '../common-types';

const dynamoDb = new DynamoDB.DocumentClient();

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
    const ticketTableName = process.env.DDB_TICKET_TABLE as string;
    console.log(`ticketTableName: ${ticketTableName}`);

    try {
        const params = {
            TableName: ticketTableName,
            KeyConditionExpression: '#id = :id',
            ExpressionAttributeValues: {
                ':id': ticketId
            },
            ExpressionAttributeNames: { '#id': 'Id'}
        };
        const queryOutput = await dynamoDb.query(params).promise();
        if (queryOutput.Count == 0) {
            return {
                statusCode: 404,
                body: 'Not Found',
            };
        }

        const ticketItemArray = queryOutput.Items as TicketItem[];
        const ticketItem = ticketItemArray[0];
        console.log(`ticketItem: ${JSON.stringify(ticketItem, null, 2)}`);

        const ticketOutput = getTicketOutput(ticketItem);
        console.log(`ticketOutput: ${JSON.stringify(ticketOutput, null, 2)}`);

        return {
            statusCode: 200,
            body: JSON.stringify(ticketOutput),
        };

    } catch (err) {
        console.error(getErrorMessage(err));
        return {
            statusCode: 500,
            body: 'Internal error, please try again later',
        };
    }
};
