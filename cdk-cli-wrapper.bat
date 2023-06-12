@echo off

SET SCRIPT_FULL_PATH=%~dp0

SET AWS_ACCOUNT=
FOR /F "tokens=* USEBACKQ" %%F IN (`call aws sts get-caller-identity --query "Account" --output text`) DO (
    SET AWS_ACCOUNT=%%F
)

SET DEPLOYMENT_REGION=ap-northeast-1
if "%DEPLOYMENT_REGION%"=="" (
        FOR /F "tokens=* USEBACKQ" %%F IN (`call aws configure get region`) DO (
            SET DEPLOYMENT_REGION=%%F
        )
)

echo Run bootstrap...
call npx cdk bootstrap aws://%AWS_ACCOUNT%/%DEPLOYMENT_REGION% -c deploymentStage=DEV --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess 

SET CDK_DEPLOYMENT_OUTPUT_FILE=%SCRIPT_FULL_PATH%\cdk.out\deployment-output.json

SET CDK_DEPLOY_ACCOUNT=%AWS_ACCOUNT%
SET CDK_DEPLOY_REGION=%DEPLOYMENT_REGION%
npx cdk %* -c "deploymentStage=DEV" --outputs-file %CDK_DEPLOYMENT_OUTPUT_FILE%
