import { CognitoIdentityServiceProvider, DynamoDB } from 'aws-sdk';
import { PlayerItem, TicketItem, TicketOutput } from './common-types';

type ErrorWithMessage = {
    message: string
};
function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
    return (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as Record<string, unknown>).message === 'string'
    );
}
function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
    if (isErrorWithMessage(maybeError)) return maybeError
  
    try {
        return new Error(JSON.stringify(maybeError));
    } catch {
        return new Error(String(maybeError));
    }
}
export function getErrorMessage(error: unknown) {
    return toErrorWithMessage(error).message;
}

export function addHours(date: Date, hours: number): Date {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
};

export async function getPlayerData(cognitoClient : CognitoIdentityServiceProvider, ddbClient : DynamoDB.DocumentClient,
                                    accessToken : string, playerTableName: string) : Promise<PlayerItem | undefined> {
    const cogParams : CognitoIdentityServiceProvider.GetUserRequest = {
        AccessToken: accessToken
    };
    const getUserOutput = await cognitoClient.getUser(cogParams).promise();
    // console.log(`User data in Cognito UserPool: ${JSON.stringify(getUserOutput, null, 2)}`);

    let playerId = undefined;
    getUserOutput.UserAttributes.forEach(userAttr => {
        if (userAttr.Name == 'sub') {
            playerId = userAttr.Value;
        }
    });
    // console.log(`playerId: ${playerId}`);
    if (playerId == undefined) {
        console.error('User UUID is undefined in Cognito UserPool');
        return undefined;
    }

    const ddbParams = {
        TableName: playerTableName,
        KeyConditionExpression: '#id = :id',
        ExpressionAttributeValues: {
            ':id': playerId
        },
        ExpressionAttributeNames: { '#id': 'Id'}
    };
    const queryOutput = await ddbClient.query(ddbParams).promise();
    if (queryOutput.Count != 1) {
        console.error(`Query result count from PlayerTable is: ${queryOutput.Count}`);
        return undefined;
    }

    const playerItemArray = queryOutput.Items as PlayerItem[];
    const playerItem = playerItemArray[0];
    // console.log(`playerItem: ${JSON.stringify(playerItem, null, 2)}`);

    return playerItem;
}

export function getTicketOutput(ticketItem : TicketItem) : TicketOutput {
    const ticketOutput : TicketOutput = {
        ticketId: ticketItem.Id,
        ticketType: ticketItem.Type
    };

    if (ticketItem.Players != undefined) {
        ticketOutput.players = [];
        ticketItem.Players.forEach(player => {
            ticketOutput.players?.push({
                playerId: player.PlayerId,
                playerSessionId: player.PlayerSessionId
            });
        });
    }
    if (ticketItem.GameSessionInfo != undefined) {
        ticketOutput.gameSessionInfo = {
            ipAddress: ticketItem.GameSessionInfo.IpAddress,
            port: ticketItem.GameSessionInfo.Port
        }
    }

    return ticketOutput;
}

export function isNotFoundException(err: any): boolean {
    return err?.code == 'NotFoundException';
}

export function isNotAuthorizedException(err: any): boolean {
    return err?.code == 'NotAuthorizedException';
}
