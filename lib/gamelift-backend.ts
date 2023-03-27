import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambdanodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as r53targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

export interface GameLiftBackendProps {
    playerTable: dynamodb.Table,
    ticketTable: dynamodb.Table,
    flexMatchConfigName: string,
    playerPool: cognito.UserPool,
    cognitoDomain: string,
    cognitoClientId: string,
    cognitoScope: string,
    cognitoCallbackUrl: string
};

export class GameLiftBackend extends Construct {
    constructor(scope: Construct, id: string, props: GameLiftBackendProps) {
        super(scope, id);

        const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(scope, 'CognitoAuthorizer', {
            authorizerName: 'PlayerPoolAuthorizer',
            cognitoUserPools: [
                props.playerPool,
            ],
            identitySource: 'method.request.header.Authorization',
            resultsCacheTtl: cdk.Duration.seconds(0)
        });

        const apigLambdaRole = new iam.Role(this, 'ApigLambdaRole', {
            roleName: `SuJie-GLWorkshop-ApigLambdaRole-${cdk.Stack.of(this).region}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonCognitoReadOnly'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
            ],
            inlinePolicies: {
                'GameLiftFullAccess': new iam.PolicyDocument({
                    assignSids: true,
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'gamelift:*'
                            ],
                            resources: [
                                '*'
                            ]
                        })
                    ]
                })
            }
        });

        const functionSettings : lambdanodejs.NodejsFunctionProps = {
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_16_X,
            memorySize: 128,
            timeout: cdk.Duration.seconds(60),
            architecture: cdk.aws_lambda.Architecture.X86_64,
            role: apigLambdaRole,
            logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK
        }

        const codeToTokensFunction = new lambdanodejs.NodejsFunction(this, 'ExchangeCodeToTokens', {
            functionName: 'SuJie-GLWorkshop-ExchangeCodeToTokens',
            entry: './resources/gamelift-backend/exchange-code-to-tokens.ts',
            environment: {
                'COGNITO_DOMAIN': props.cognitoDomain,
                'COGNITO_CLIENT_ID': props.cognitoClientId,
                'COGNITO_CALLBACK_URL': props.cognitoCallbackUrl
            },
            ...functionSettings
        });

        const refreshTokensFunction = new lambdanodejs.NodejsFunction(this, 'RefreshTokens', {
            functionName: 'SuJie-GLWorkshop-RefreshTokens',
            entry: './resources/gamelift-backend/refresh-tokens.ts',
            environment: {
                'COGNITO_CLIENT_ID': props.cognitoClientId
            },
            ...functionSettings
        });

        const revokeTokensFunction = new lambdanodejs.NodejsFunction(this, 'RevokeTokens', {
            functionName: 'SuJie-GLWorkshop-RevokeTokens',
            entry: './resources/gamelift-backend/revoke-tokens.ts',
            ...functionSettings
        });

        const getPlayerDataFunction = new lambdanodejs.NodejsFunction(this, 'GetPlayerData', {
            functionName: 'SuJie-GLWorkshop-GetPlayerData',
            entry: './resources/gamelift-backend/get-player-data.ts',
            environment: {
                'DDB_PLAYER_TABLE': props.playerTable.tableName,
            },
            ...functionSettings
        });

        const startMatchmakingFunction = new lambdanodejs.NodejsFunction(this, 'StartMatchmaking', {
            functionName: 'SuJie-GLWorkshop-StartMatchmaking',
            entry: './resources/gamelift-backend/start-matchmaking.ts',
            environment: {
                'DDB_PLAYER_TABLE': props.playerTable.tableName,
                'FLEXMATCH_CONFIG': props.flexMatchConfigName
            },
            ...functionSettings
        });

        const stopMatchmakingFunction = new lambdanodejs.NodejsFunction(this, 'StopMatchmaking', {
            functionName: 'SuJie-GLWorkshop-StopMatchmaking',
            entry: './resources/gamelift-backend/stop-matchmaking.ts',
            ...functionSettings
        });

        const pollMatchmakingFunction = new lambdanodejs.NodejsFunction(this, 'PollMatchmaking', {
            functionName: 'SuJie-GLWorkshop-PollMatchmaking',
            entry: './resources/gamelift-backend/poll-matchmaking.ts',
            environment: {
                'DDB_TICKET_TABLE': props.ticketTable.tableName
            },
            ...functionSettings
        });

        const gameResultFunction = new lambdanodejs.NodejsFunction(this, 'ProcessGameSessionResult', {
            functionName: 'SuJie-GLWorkshop-ProcessGameSessionResult',
            entry: './resources/gamelift-backend/process-game-session-result.ts',
            environment: {
            },
            ...functionSettings
        });

        const stageName = 'dev';
        let domainNameOptions : apigateway.DomainNameOptions | undefined;
        let customDomainName = '';
        const customDomainContext = this.node.tryGetContext('customDomain');
        if (customDomainContext.certificateArn.length > 0 && 
            customDomainContext.hostedZoneId.length > 0 &&
            customDomainContext.hostName.length > 0 && 
            customDomainContext.domainName.length > 0)
        {
            const basePath = stageName;
            const certificate = acm.Certificate.fromCertificateArn(scope, 'Certificate', customDomainContext.certificateArn);
            const customDomainName = `${customDomainContext.hostName}.${customDomainContext.domainName}`;

            domainNameOptions = {
                certificate: certificate,
                domainName: customDomainName,
                basePath: basePath,
                endpointType: apigateway.EndpointType.EDGE,
                securityPolicy: apigateway.SecurityPolicy.TLS_1_2
            };
            new cdk.CfnOutput(scope, 'CustomDomainUrl', { value: `https://${customDomainName}/${basePath}` })
        }

        const gameliftApi = new apigateway.RestApi(this, 'GameLiftAPI', {
            restApiName: 'SuJie-GLWorkshop-GameLiftAPI',
            domainName: domainNameOptions, 
            retainDeployments: false,
            // endpointExportName: 'GameLiftBackendEndpoint',
            deploy: true,
            deployOptions: {
                stageName: stageName,
                cacheClusterEnabled: true,
                cacheClusterSize: '0.5',
                cacheTtl: cdk.Duration.minutes(1),
                throttlingBurstLimit: 100,
                throttlingRateLimit: 1000
            },
            endpointTypes: [
                apigateway.EndpointType.EDGE
            ],
        });
        new cdk.CfnOutput(scope, 'InvokeUrl', { value: gameliftApi.url })

        if (customDomainContext.certificateArn.length > 0 && 
            customDomainContext.hostedZoneId.length > 0 &&
            customDomainContext.hostName.length > 0 && 
            customDomainContext.domainName.length > 0)
        {
            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(scope, 'HostedZone', {
                hostedZoneId: customDomainContext.hostedZoneId,
                zoneName: customDomainContext.domainName
            });
            new route53.ARecord(scope, 'AliasRecord', {
                zone: hostedZone,
                comment: 'Alias for SuJie-GLWorkshop\'s API Gateway',
                recordName: customDomainName,
                target: route53.RecordTarget.fromAlias(new r53targets.ApiGateway(gameliftApi))
            });
        }

        const tokenRootPath = gameliftApi.root.addResource('tokens', {
            defaultMethodOptions: {
                apiKeyRequired: true
            }
        });
        const exchangeTokensPath = tokenRootPath.addResource('exchange');
        const exchangeTokensMethod = exchangeTokensPath.addMethod('POST', new apigateway.LambdaIntegration(codeToTokensFunction));
        const refreshTokensPath = tokenRootPath.addResource('refresh');
        refreshTokensPath.addMethod('POST', new apigateway.LambdaIntegration(refreshTokensFunction), {
            authorizationScopes: [
                props.cognitoScope
            ],
            authorizer: cognitoAuthorizer
        });
        const revokeTokensPath = tokenRootPath.addResource('revoke');
        revokeTokensPath.addMethod('POST', new apigateway.LambdaIntegration(revokeTokensFunction), {
            authorizationScopes: [
                props.cognitoScope
            ],
            authorizer: cognitoAuthorizer
        });

        const matchmakingRootPath = gameliftApi.root.addResource('matchmaking', {
            defaultMethodOptions: {
                apiKeyRequired: true,
                authorizationScopes: [
                    props.cognitoScope
                ],
                authorizer: cognitoAuthorizer
            }
        });
        matchmakingRootPath.addMethod('POST', new apigateway.LambdaIntegration(startMatchmakingFunction));
        const matchmakingTicketPath = matchmakingRootPath.addResource('{tid}');
        matchmakingTicketPath.addMethod('DELETE', new apigateway.LambdaIntegration(stopMatchmakingFunction));
        matchmakingTicketPath.addMethod('GET', new apigateway.LambdaIntegration(pollMatchmakingFunction));
        
        const playersRootPath = gameliftApi.root.addResource('players', {
            defaultMethodOptions: {
                apiKeyRequired: true,
                authorizationScopes: [
                    props.cognitoScope
                ],
                authorizer: cognitoAuthorizer
            }
        });
        const playerIdPath = playersRootPath.addResource('{pid}');
        playerIdPath.addMethod('GET', new apigateway.LambdaIntegration(getPlayerDataFunction));

        const gameSessionsRootPath = gameliftApi.root.addResource('game-sessions', {
            defaultMethodOptions: {
                apiKeyRequired: true,
                authorizationScopes: [
                    props.cognitoScope
                ],
                authorizer: cognitoAuthorizer
            }
        });
        const gameSessionIdPath = gameSessionsRootPath.addResource('{sid}');
        gameSessionIdPath.addMethod('POST', new apigateway.LambdaIntegration(gameResultFunction));

        const usagePlane = gameliftApi.addUsagePlan('UsagePlan', {
            name: 'SuJie-GLWorkshop-UsagePlan',
            throttle: {
                burstLimit: 10,
                rateLimit: 100
            },
            quota: {
                limit: 1000,
                offset: 0,
                period: apigateway.Period.DAY
            },
            apiStages: [
                {
                    api: gameliftApi,
                    stage: gameliftApi.deploymentStage,
                    throttle: [
                        {
                            method: exchangeTokensMethod,
                            throttle: {
                                burstLimit: 5,
                                rateLimit: 20
                            }
                        }
                    ]
                }
            ]
        });

        const apiKey = gameliftApi.addApiKey('ApiKey', {
            apiKeyName: 'SuJie-GLWorkshop-Key'
        });
        usagePlane.addApiKey(apiKey);
        new cdk.CfnOutput(scope, 'ApiKey', { 
            value: 'For security reasons we can\'t output API KEY here, please check it from the Web Console' 
        })
    }
}
