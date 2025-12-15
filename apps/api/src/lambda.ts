import awsLambdaFastify from '@fastify/aws-lambda';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { buildApp, configureApp } from './app';

let handler: (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>;

async function bootstrap() {
  const app = buildApp();
  await configureApp(app);
  // Remove app.ready() - the lambda adapter handles this
  return awsLambdaFastify(app);
}

export const main = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  if (!handler) {
    handler = await bootstrap();
  }
  return handler(event, context);
};