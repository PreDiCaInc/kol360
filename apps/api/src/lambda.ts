import awsLambdaFastify from '@fastify/aws-lambda';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { buildApp, configureApp } from './app';

let handler: (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>;

async function bootstrap() {
  const app = buildApp();
  await configureApp(app);
  await app.ready();
  return awsLambdaFastify(app);
}

export const main = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  // Reuse handler across warm invocations
  if (!handler) {
    handler = await bootstrap();
  }
  return handler(event, context);
};
