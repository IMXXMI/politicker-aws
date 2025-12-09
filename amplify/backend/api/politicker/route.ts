import { defineFunction } from '@aws-amplify/backend';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

const pollsFunction = defineFunction({
  name: 'pollsHandler',
  entry: 'src/handlers/polls.ts',
  runtime: Runtime.NODEJS_18_X,
});

const api = new RestApi(stack, 'PolitickerApi', {
  restApiName: 'Politicker API',
});

const pollsIntegration = new LambdaIntegration(pollsFunction.resources.lambda);
api.root.addResource('polls').addMethod('GET', pollsIntegration);