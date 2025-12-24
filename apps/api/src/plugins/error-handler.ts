import { FastifyPluginAsync, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { ApiError } from '../lib/errors';

/**
 * User-friendly error messages for common error types
 * These are safe to show to end users
 */
const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  // Database connection errors
  DATABASE_CONNECTION: 'Service temporarily unavailable. Please try again in a moment.',
  DATABASE_TIMEOUT: 'Request timed out. Please try again.',

  // Authentication errors
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to perform this action.',

  // Validation errors
  VALIDATION_ERROR: 'Please check your input and try again.',

  // Rate limiting
  RATE_LIMIT: 'Too many requests. Please wait a moment and try again.',

  // Generic errors
  INTERNAL_ERROR: 'Something went wrong. Please try again later.',
  NOT_FOUND: 'The requested resource was not found.',
};

/**
 * Determine if we're in production environment
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Extract a user-friendly message from various error types
 */
function getUserFriendlyMessage(error: Error | FastifyError): string {
  // Handle our custom ApiError - these already have user-friendly messages
  if (error instanceof ApiError) {
    return error.message;
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return 'This record already exists.';
      case 'P2025':
        return USER_FRIENDLY_MESSAGES.NOT_FOUND;
      case 'P2003':
        return 'This operation cannot be completed due to related data.';
      default:
        return USER_FRIENDLY_MESSAGES.INTERNAL_ERROR;
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return USER_FRIENDLY_MESSAGES.DATABASE_CONNECTION;
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return USER_FRIENDLY_MESSAGES.DATABASE_CONNECTION;
  }

  if (
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error.message?.includes('connect ECONNREFUSED') ||
    error.message?.includes("Can't reach database")
  ) {
    return USER_FRIENDLY_MESSAGES.DATABASE_CONNECTION;
  }

  // Handle Fastify errors
  const fastifyError = error as FastifyError;
  if (fastifyError.statusCode) {
    switch (fastifyError.statusCode) {
      case 400:
        return USER_FRIENDLY_MESSAGES.VALIDATION_ERROR;
      case 401:
        return USER_FRIENDLY_MESSAGES.UNAUTHORIZED;
      case 403:
        return USER_FRIENDLY_MESSAGES.FORBIDDEN;
      case 404:
        return USER_FRIENDLY_MESSAGES.NOT_FOUND;
      case 429:
        return USER_FRIENDLY_MESSAGES.RATE_LIMIT;
      default:
        if (fastifyError.statusCode >= 500) {
          return USER_FRIENDLY_MESSAGES.INTERNAL_ERROR;
        }
    }
  }

  // Default fallback
  return USER_FRIENDLY_MESSAGES.INTERNAL_ERROR;
}

/**
 * Get appropriate HTTP status code for error
 */
function getStatusCode(error: Error | FastifyError): number {
  // ApiError has its own status code
  if (error instanceof ApiError) {
    return error.statusCode;
  }

  // Fastify errors have status codes
  const fastifyError = error as FastifyError;
  if (fastifyError.statusCode) {
    return fastifyError.statusCode;
  }

  // Prisma specific errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return 409; // Conflict
      case 'P2025':
        return 404; // Not Found
      case 'P2003':
        return 400; // Bad Request
      default:
        return 500;
    }
  }

  // Database connection errors
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error.message?.includes('connect ECONNREFUSED') ||
    error.message?.includes("Can't reach database")
  ) {
    return 503; // Service Unavailable
  }

  return 500;
}

const errorHandlerCallback: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = getStatusCode(error);
    const traceId = request.traceId || 'unknown';

    // Always log the full error details server-side
    logger.error(
      'Request error',
      {
        trace_id: traceId,
        user_id: request.user?.sub,
        tenant_id: request.user?.tenantId,
        method: request.method,
        url: request.url,
        status_code: statusCode,
        error_name: error.name,
        error_code: (error as Prisma.PrismaClientKnownRequestError).code,
      },
      error
    );

    // Build response based on environment
    const response: Record<string, unknown> = {
      error: true,
      statusCode,
      traceId,
    };

    if (isProduction()) {
      // In production: return user-friendly message only
      response.message = getUserFriendlyMessage(error);
    } else {
      // In development: include full error details for debugging
      response.message = error.message;
      response.errorName = error.name;
      response.stack = error.stack;

      // Include Prisma error code if available
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        response.prismaCode = error.code;
        response.prismaMeta = error.meta;
      }
    }

    reply.status(statusCode).send(response);
  });
};

export const errorHandlerPlugin = fp(errorHandlerCallback, {
  name: 'error-handler',
  fastify: '4.x',
});
