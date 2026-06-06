import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../lib/logger';

// v1.17.29 — Machine-to-machine (M2M) auth verifier for curation integration.
//
// Sits alongside the existing user-SPA auth plugin (apps/api/src/plugins/auth.ts)
// rather than replacing it. The user-SPA plugin verifies tokens for the
// kol360 web client (`COGNITO_CLIENT_ID`, the SPA); this one verifies
// tokens for the `curation-svc-to-kol360` confidential client minted via
// the `client_credentials` grant per
// kolcuration/spec/dba-reply-cognito-service-accounts-done.md.
//
// Two key differences from the user-SPA verifier:
//   1. Token's `client_id` claim must match the curation M2M client (not
//      the SPA client).
//   2. The token's `scope` claim must include the scope this route
//      requires. Cognito uses `<resource-server>/<scope>` naming, e.g.
//      `kol360-api/hcps:write-stub`.
//
// Routes opt in by adding `requireM2M({ scope: 'kol360-api/hcps:write-stub' })`
// as a preHandler. The user-SPA `request.user` is NOT populated for M2M
// routes; M2M sets `request.m2m = { clientId, scopes }` instead. Routes
// that need to know which curation client called them read from there.

export interface M2MIdentity {
  clientId: string;
  scopes: string[];
  tokenUse: 'access';
}

declare module 'fastify' {
  interface FastifyRequest {
    m2m?: M2MIdentity;
  }
}

// Lazy-init so missing env vars don't break startup for envs where the
// curation client isn't provisioned (e.g. local dev without secrets).
let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;
function getVerifier() {
  if (_verifier) return _verifier;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const curationClientId = process.env.COGNITO_CURATION_M2M_CLIENT_ID;
  if (!userPoolId || !curationClientId) {
    throw new Error(
      'M2M auth not configured: COGNITO_USER_POOL_ID + COGNITO_CURATION_M2M_CLIENT_ID required'
    );
  }
  _verifier = CognitoJwtVerifier.create({
    userPoolId,
    clientId: curationClientId,
    tokenUse: 'access',
  });
  return _verifier;
}

/**
 * Fastify preHandler factory: gate a route on a valid M2M token from the
 * curation Cognito client that ALSO carries the named scope.
 *
 * Returns 401 for missing/invalid token, 403 for valid token without the
 * required scope. Populates `request.m2m` on success.
 */
export function requireM2M(opts: { scope: string }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        statusCode: 401,
      });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    let payload: Awaited<ReturnType<ReturnType<typeof CognitoJwtVerifier.create>['verify']>>;
    try {
      payload = await getVerifier().verify(token);
    } catch (err) {
      logger.warn('M2M token verification failed', {
        url: request.url,
        error: err instanceof Error ? err.message : String(err),
      });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        statusCode: 401,
      });
    }

    // Cognito `scope` claim is a space-separated string of full
    // `<resource-server>/<scope>` names.
    const scopeClaim = (payload as { scope?: string }).scope ?? '';
    const scopes = scopeClaim.split(/\s+/).filter(Boolean);
    if (!scopes.includes(opts.scope)) {
      logger.warn('M2M token missing required scope', {
        url: request.url,
        required: opts.scope,
        got: scopes,
      });
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Missing required scope: ${opts.scope}`,
        statusCode: 403,
      });
    }

    request.m2m = {
      clientId: (payload as { client_id?: string }).client_id ?? '',
      scopes,
      tokenUse: 'access',
    };
  };
}
