import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { generateTraceId, logger } from '../lib/logger';

declare module 'fastify' {
  interface FastifyRequest {
    traceId: string;
  }
}

const loggingPluginCallback: FastifyPluginAsync = async (fastify) => {
  // Add trace ID to each request
  fastify.addHook('onRequest', async (request) => {
    // Check for incoming trace ID header, or generate new one
    const incomingTraceId = request.headers['x-trace-id'] as string | undefined;
    request.traceId = incomingTraceId || generateTraceId();
  });

  // Log request completion with timing
  fastify.addHook('onResponse', async (request, reply) => {
    const duration = reply.elapsedTime;

    // Skip health check endpoints from logging (too noisy)
    if (request.url.startsWith('/health')) {
      return;
    }

    const logContext = {
      trace_id: request.traceId,
      user_id: request.user?.sub,
      tenant_id: request.user?.tenantId,
      method: request.method,
      url: request.url,
      status_code: reply.statusCode,
      duration_ms: Math.round(duration),
    };

    if (reply.statusCode >= 500) {
      logger.error('Request failed', logContext);
    } else if (reply.statusCode >= 400) {
      logger.warn('Request client error', logContext);
    } else {
      logger.info('Request completed', logContext);
    }
  });

  // Log errors
  fastify.addHook('onError', async (request, _reply, error) => {
    logger.error(
      'Request error',
      {
        trace_id: request.traceId,
        user_id: request.user?.sub,
        tenant_id: request.user?.tenantId,
        method: request.method,
        url: request.url,
      },
      error
    );
  });

  // Add trace ID to response headers for debugging
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-trace-id', request.traceId);
  });
};

export const loggingPlugin = fp(loggingPluginCallback, {
  name: 'logging',
  fastify: '4.x',
});
