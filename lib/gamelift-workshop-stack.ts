import * as cdk from 'aws-cdk-lib';
import * as accsvc from './account-service';
import * as glsvc from './gamelift-service';
import * as glbackend from './gamelift-backend';
import { Construct } from 'constructs';

export class GameLiftWorkshopStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const accountService = new accsvc.AccountService(this, 'SuJie-GLWorkshop-AccountService');
        const gameliftService = new glsvc.GameLiftService(this, 'SuJie-GLWorkshop-GameLiftService');
        new glbackend.GameLiftBackend(this, 'SuJie-GLWorkshop-GameLiftBackend', {
            playerTable: accountService.playerTable,
            ticketTable: gameliftService.ticketTable,
            flexMatchConfigName: gameliftService.flexMatchConfigName,
            playerPool: accountService.playerPool,
            cognitoDomain: accountService.cognitoDomain,
            cognitoClientId: accountService.cognitoClientId,
            cognitoScope: accountService.cognitoScope,
            cognitoCallbackUrl: accountService.cognitoCallbackUrl
        });
        
    }
}
