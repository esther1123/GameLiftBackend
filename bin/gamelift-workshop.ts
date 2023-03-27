#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GameLiftWorkshopStack } from '../lib/gamelift-workshop-stack';

const app = new cdk.App();
new GameLiftWorkshopStack(app, 'SuJie-GameLiftWorkshop', {
    env: { 
        account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION
    }
});
