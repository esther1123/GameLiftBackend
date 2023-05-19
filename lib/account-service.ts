import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class AccountService extends Construct {

    public readonly playerTable: dynamodb.Table;
    public readonly playerPool: cognito.UserPool;

    public readonly cognitoDomain: string;
    public readonly cognitoCallbackUrl = 'https://my-json-server.typicode.com/cowcoa/dayone-rest-api/signinresult';
    public readonly cognitoClientId: string;
    public readonly cognitoScope: string;

    private getRandomInt(max: number): number {
        return Math.floor(Math.random() * max);
    }

    private getFibonacciNumber(n: number): number {
        return Math.round((Math.pow((1 + Math.sqrt(5)) / 2, n) - Math.pow((1 - Math.sqrt(5)) / 2, n)) / Math.sqrt(5));
    }

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.playerTable = new dynamodb.Table(this, 'PlayerTable', {
            tableName: 'SuJie-GLWorkshop-Player',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, 
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: 'Id', 
                type: dynamodb.AttributeType.STRING
            }, 
            pointInTimeRecovery: true
        });
        new cdk.CfnOutput(scope, 'PlayerTable', {  value: this.playerTable.tableName });

        const cognitoTriggerRole = new iam.Role(this, 'CognitoEventRole', {
            roleName: `SuJie-GLWorkshop-CognitoEventRole-${cdk.Stack.of(this).region}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonCognitoReadOnly')
            ],
        });

        const functionSettings : lambdanodejs.NodejsFunctionProps = {
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_16_X,
            memorySize: 128,
            timeout: cdk.Duration.seconds(60),
            architecture: cdk.aws_lambda.Architecture.X86_64,
            role: cognitoTriggerRole,
            logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK
        }

        const signUpCheckFunction = new lambdanodejs.NodejsFunction(this, 'HandlePreSignUpEvent', {
            functionName: 'SuJie-GLWorkshop-HandlePreSignUpEvent',
            entry: './resources/account-service/handle-pre-signup-event.ts',
            ...functionSettings
        });

        const signUpConfirmFunction = new lambdanodejs.NodejsFunction(this, 'HandlePostConfirmEvent', {
            functionName: 'SuJie-GLWorkshop-HandlePostConfirmEvent',
            entry: './resources/account-service/handle-post-confirm-event.ts',
            environment: {
                'DDB_PLAYER_TABLE': this.playerTable.tableName
            },
            ...functionSettings
        });
        this.playerTable.grantWriteData(signUpConfirmFunction);
        this.playerTable.grantReadData(signUpConfirmFunction);

        this.playerPool = new cognito.UserPool(this, 'PlayerPool', {
            userPoolName: 'SuJie-GLWorkshop-PlayerPool',
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            autoVerify: {
                email: true,
                phone: false
            },
            email: cognito.UserPoolEmail.withCognito('jsumz@amazon.com'),
            mfa: cognito.Mfa.OFF,
            passwordPolicy: {
                minLength: 6,
                requireDigits: false,
                requireLowercase: false,
                requireSymbols: false,
                requireUppercase: false,
                tempPasswordValidity: cdk.Duration.days(7)
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
                username: false,
                phone: false,
                preferredUsername: false
            },
            signInCaseSensitive: false,
            standardAttributes: {
                email: {
                    mutable: true,
                    required: true
                }
            },
            lambdaTriggers: {
                postConfirmation: signUpConfirmFunction,
                preSignUp: signUpCheckFunction
            }
        });
        new cdk.CfnOutput(scope, 'PoolId', { value: this.playerPool.userPoolId });

        const fiboIndex1 = this.getRandomInt(11);
        const fiboIndex2 = this.getRandomInt(23);
        const fiboNumber1 = this.getFibonacciNumber(fiboIndex1);
        const fiboNumber2 = this.getFibonacciNumber(fiboIndex2);
        const domainPrefix = `sujie-gl-workshop-${fiboNumber1}${fiboNumber2}`;
        const poolDomain = this.playerPool.addDomain('PlayerPoolDomain', {
            cognitoDomain: {
                domainPrefix: domainPrefix
            }
        });
        this.cognitoDomain = poolDomain.baseUrl().replace('https://', '');
        new cdk.CfnOutput(scope, 'Domain', { value: this.cognitoDomain, description: 'A domain for your Hosted UI and OAuth 2.0 endpoints' });

        const scopeName = '*'
        const fullAccessScope = new cognito.ResourceServerScope({
            scopeName: scopeName,
            scopeDescription: 'Full access'
        });
        const playerServerId = 'players'
        const playerServer = this.playerPool.addResourceServer('PlayerResourceServer', {
            userPoolResourceServerName: 'PlayerResourceServer',
            identifier: playerServerId,
            scopes: [
                fullAccessScope
            ]
        });
        this.cognitoScope = `${playerServerId}/${scopeName}`;
        new cdk.CfnOutput(scope, 'Scope', { value: this.cognitoScope, description: 'Resource Server\'s scope' });

        const supportedIdps : cognito.UserPoolClientIdentityProvider[] = [cognito.UserPoolClientIdentityProvider.COGNITO];
        const googleIdpContext = this.node.tryGetContext('googleIdp');
        if (googleIdpContext.clientId.length > 0 && googleIdpContext.clientSecret.length > 0)
        {
            supportedIdps.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
        }
        const fullAccessClient = this.playerPool.addClient('FullAccessClient', {
            userPoolClientName: 'FullAccessClient',
            authFlows: {
                userPassword: true,
                userSrp: true,
                adminUserPassword: false,
                custom: false
            },
            enableTokenRevocation: true,
            generateSecret: false,
            disableOAuth: false,
            oAuth: {
                callbackUrls: [
                    this.cognitoCallbackUrl
                ],
                flows: {
                    authorizationCodeGrant: true,
                    clientCredentials: false,
                    implicitCodeGrant: false
                },
                scopes: [
                    cognito.OAuthScope.COGNITO_ADMIN,
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.resourceServer(playerServer, fullAccessScope)
                ]
            },
            preventUserExistenceErrors: true,
            accessTokenValidity: cdk.Duration.hours(1),
            idTokenValidity: cdk.Duration.hours(1),
            refreshTokenValidity: cdk.Duration.days(7),
            supportedIdentityProviders: supportedIdps
        });
        this.cognitoClientId = fullAccessClient.userPoolClientId;
        new cdk.CfnOutput(scope, 'ClientId', { value: fullAccessClient.userPoolClientId });
        new cdk.CfnOutput(scope, 'CallbackUrl', { value: this.cognitoCallbackUrl });

        if (googleIdpContext.clientId.length > 0 && googleIdpContext.clientSecret.length > 0)
        {
            const googleIdp = new cognito.UserPoolIdentityProviderGoogle(scope, 'GoogleIdp', {
                userPool: this.playerPool,
                attributeMapping: {
                    email: cognito.ProviderAttribute.GOOGLE_EMAIL,
                    custom: {
                        'username': cognito.ProviderAttribute.other('sub')
                    }
                },
                clientId: googleIdpContext.clientId,
                clientSecretValue: googleIdpContext.clientSecret,
                scopes: [
                    'profile',
                    'email',
                    'openid'
                ]
            });
            this.playerPool.registerIdentityProvider(googleIdp);
        }
    }
}
