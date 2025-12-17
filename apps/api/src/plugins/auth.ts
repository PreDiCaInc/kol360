import fp from 'fastify-plugin';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { FastifyRequest, FastifyReply } from 'fastify';

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!,
  tokenUse: 'access',
});

export interface AuthUser {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/health',
  '/api/v1/auth/signup',
  '/api/v1/auth/login',
  '/api/v1/survey/take', // Public survey taking
  '/api/v1/unsubscribe', // Email opt-out
];

function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some(route => url.startsWith(route));
}

export const authPlugin = fp(async (fastify) => {
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public routes
    if (isPublicRoute(request.url)) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        statusCode: 401
      });
    }

    try {
      const token = authHeader.split(' ')[1];
      const payload = await verifier.verify(token);

      // Get role from custom attribute or from Cognito groups
      let role = payload['custom:role'] as string;

      if (!role) {
        // Check Cognito groups in the token
        const groups = payload['cognito:groups'] as string[] | undefined;
        if (groups?.includes('PLATFORM_ADMIN') || groups?.includes('platform-admins')) {
          role = 'PLATFORM_ADMIN';
        } else if (groups?.includes('CLIENT_ADMIN') || groups?.includes('client-admins')) {
          role = 'CLIENT_ADMIN';
        } else if (groups?.includes('TEAM_MEMBER') || groups?.includes('team-members')) {
          role = 'TEAM_MEMBER';
        } else {
          role = 'TEAM_MEMBER';
        }
      }

      request.user = {
        sub: payload.sub,
        email: payload.email as string,
        role,
        tenantId: payload['custom:tenant_id'] as string | undefined,
      };
    } catch (err) {
      fastify.log.warn({ err }, 'Token verification failed');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        statusCode: 401
      });
    }
  });
});
