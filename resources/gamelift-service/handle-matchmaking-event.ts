import { Context, SNSEvent } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getErrorMessage, addHours } from '../utility-functions';
import { TicketItem } from '../common-types';

interface Player {
    'playerId': string,
    'playerSessionId': string,
    'team': string
};
interface Ticket {
    'ticketId': string,
    'startTime': string,
    'players': Player[]
};
interface GameSessionInfo {
    'gameSessionArn': string,
    'ipAddress': string,
    'port': number,
    'players': Player[]
};
interface Detail {
    'type': string,
    'matchId': string,
    'tickets': Ticket[],
    'gameSessionInfo': GameSessionInfo
};
interface MatchmakingEvent {
    'source': string
    'detail-type': string,
    'time': string,
    'region': string,
    'resources': string[],
    'detail': Detail
};

const dynamoDb = new DynamoDB.DocumentClient();

export const handler = async (event: SNSEvent, context: Context): Promise<SNSEvent> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    const ticketTable = process.env.DDB_TICKET_TABLE as string;

    let promises : Promise<any>[] = [];
 
    for (let record of event.Records) {
        const matchmakingEvent = JSON.parse(record.Sns.Message) as MatchmakingEvent;
        console.log(`MatchmakingEvent: ${JSON.stringify(matchmakingEvent, null, 2)}`);

        if (matchmakingEvent.detail.type == 'MatchmakingSearching' || matchmakingEvent.detail.type == 'PotentialMatchCreated' ||
            matchmakingEvent.detail.type == 'AcceptMatch' || matchmakingEvent.detail.type == 'AcceptMatchCompleted') {
            console.log(`We are not interested in ${matchmakingEvent.detail.type} event`)
            continue;
        }

        const now = new Date();
        const oneHourLater = addHours(now, 1);
        const oneHourLaterTimestamp = Math.floor(oneHourLater.getTime() / 1000);
        matchmakingEvent.detail.tickets.forEach((ticket: Ticket) => {
            const ticketItem : TicketItem = {
                Id: ticket.ticketId,
                Type: matchmakingEvent.detail.type,
                TTL: oneHourLaterTimestamp,
            };

            if (matchmakingEvent.detail.type == 'MatchmakingSucceeded') {
                if (ticket.players.length > 0) {
                    ticketItem.Players = [];
                }
                ticket.players.forEach((player: Player) => {
                    const playerItem = {
                        PlayerId: player.playerId,
                        PlayerSessionId: player.playerSessionId,
                    };
                    ticketItem.Players?.push(playerItem)
                });
                ticketItem.GameSessionInfo = {
                    IpAddress: matchmakingEvent.detail.gameSessionInfo.ipAddress,
                    Port: matchmakingEvent.detail.gameSessionInfo.port
                }
            }

            try {
                const param = {
                    TableName: ticketTable,
                    Item: ticketItem
                };
                const promise = dynamoDb.put(param).promise();
                promises.push(promise);
    
            } catch (err) {
                console.log(getErrorMessage(err));
            }
        });
    };

    await Promise.all(promises).then(response => {
        console.log(`Promise.all results of DDB TicketTable: ${JSON.stringify(response, null, 2)}`);
    }, reaseon => {
        console.log(getErrorMessage(reaseon));
        throw new Error('Failed to process all DDB TicketTable requests');
    });

   return event;
};
