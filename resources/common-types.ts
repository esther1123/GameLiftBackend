export type PlayerItem = {
    readonly Id: string;
    readonly Wins: number;
    readonly Losses: number;
};

export type TicketItem = {
    Id: string,
    Type: string,
    TTL: number,
    Players?: {
        PlayerId: string,
        PlayerSessionId: string
    }[],
    GameSessionInfo?: {
        IpAddress: string,
        Port: number
    }
};

export type TicketOutput = {
    ticketId: string,
    ticketType: string,
    players?: {
        playerId: string,
        playerSessionId: string
    }[],
    gameSessionInfo?: {
        ipAddress: string,
        port: number
    }
};
