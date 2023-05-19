import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snssubs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as gamelift from 'aws-cdk-lib/aws-gamelift';
import { Construct } from 'constructs';

export class GameLiftService extends Construct {

    public readonly ticketTable: dynamodb.Table;
    public readonly flexMatchConfigName: string;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.ticketTable = new dynamodb.Table(this, 'MatchmakingTicket', {
            tableName: 'SuJie-GLWorkshop-MatchmakingTicket',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, 
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: 'Id', 
                type: dynamodb.AttributeType.STRING
            }, 
            pointInTimeRecovery: true,
            timeToLiveAttribute: 'TTL'
        });
        new cdk.CfnOutput(scope, 'TicketTable', { value: this.ticketTable.tableName });
  
        const mmEventRole = new iam.Role(this, 'MatchmakingEventRole', {
            roleName: `SuJie-GLWorkshop-MatchmakingEventRole-${cdk.Stack.of(this).region}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'),
            ],
        });

        const mmEventFunction = new lambdanodejs.NodejsFunction(this, 'HandleMatchmakingEvent', {
            functionName: 'SuJie-GLWorkshop-HandleMatchmakingEvent',
            entry: './resources/gamelift-service/handle-matchmaking-event.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_16_X,
            memorySize: 128,
            timeout: cdk.Duration.seconds(60),
            architecture: cdk.aws_lambda.Architecture.X86_64,
            role: mmEventRole,
            logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
            environment: {
                'DDB_TICKET_TABLE': this.ticketTable.tableName
            }
        });
	    this.ticketTable.grantWriteData(mmEventFunction);
	    this.ticketTable.grantReadData(mmEventFunction);

        const snsMatchmakingTopic = new sns.Topic(this, 'MatchmakingTopic', {
            topicName: 'SuJie-GLWorkshop-MatchmakingTopic',
            displayName: 'SuJie-GLWorkshop-MatchmakingTopic',
        });
        snsMatchmakingTopic.addSubscription(new snssubs.LambdaSubscription(mmEventFunction));

        let routingStrategy : gamelift.CfnAlias.RoutingStrategyProperty;
        routingStrategy = {
            type: 'TERMINAL',
            message: 'Placeholder'
        };
        const fleetIdContext = this.node.tryGetContext('fleetId') as string;
        if (fleetIdContext.length > 0)
        {
            routingStrategy = {
                type: 'SIMPLE',
                fleetId: fleetIdContext
            };
        }
        const fleetAlias = new gamelift.CfnAlias(scope, 'DefaultFleetAlias', {
            name: 'SuJie-GLWorkshop-DefaultAlias',
            routingStrategy: routingStrategy,
            description: 'Update this alias to point to a real Fleet'
        });

        const gameSessionQueue = new gamelift.CfnGameSessionQueue(scope, 'GameSessionQueue', {
            name: 'SuJie-GLWorkshop-DefaultQueue',
            destinations: [
                {
                    destinationArn: `arn:aws:gamelift:${cdk.Stack.of(this).region}::alias/${fleetAlias.attrAliasId}`
                }
            ],
            // filterConfiguration: {
            //    allowedLocations: [
            //        cdk.Stack.of(this).region
            //    ]
            // },
            // playerLatencyPolicies: 
            // priorityConfiguration:
            timeoutInSeconds: 30
        });
        gameSessionQueue.node.addDependency(fleetAlias);

        const ruleSetBody = fs.readFileSync('./matchmaking-rule-set.json', 'utf-8');
        const ruleSet = new gamelift.CfnMatchmakingRuleSet(scope, 'MatchmakingRuleSet', {
            name: 'SuJie-GLWorkshop-DefaultRuleSet',
            ruleSetBody: ruleSetBody
        });

        const flexMatchConfig = new gamelift.CfnMatchmakingConfiguration(scope, 'MatchmakingConfig', {
            name: 'SuJie-GLWorkshop-DefaultConfig',
            description: 'Default matchmaking config for 1v1 and 2v2 match',
            acceptanceRequired: false,
            requestTimeoutSeconds: 30,
            ruleSetName: ruleSet.attrName,
            additionalPlayerCount: 0,
            backfillMode: 'MANUAL',
            flexMatchMode: 'WITH_QUEUE',
            gameSessionQueueArns: [
                gameSessionQueue.attrArn
            ],
            notificationTarget: snsMatchmakingTopic.topicArn
        });
        this.flexMatchConfigName = flexMatchConfig.name;
        new cdk.CfnOutput(scope, 'FlexMatchConfigName', { value: flexMatchConfig.name, description: 'Name of FlexMatch Matchmaking Configuration' });
    }
}
