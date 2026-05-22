import { NextResponse } from 'next/server';

type CheckStatus = 'ok' | 'error';

interface CheckResult {
  name: string;
  status: CheckStatus;
  latency_ms?: number;
  error?: string;
}

interface StatusResponse {
  status: 'ok' | 'degraded' | 'error';
  checks: CheckResult[];
}

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  const checks: CheckResult[] = [];

  // Check Frontend
  checks.push({ name: 'Frontend', status: 'ok' });

  // Check Backend API and Database via backend's /health/full endpoint.
  //
  // v1.17.1: forward HEALTH_CHECK_TOKEN as Authorization Bearer. The backend
  // gates /health/full in any non-dev environment (see health.ts). The token
  // IS available in this server-side route's env (apps/web/.env.production
  // sets HEALTH_CHECK_TOKEN) — it was just never being read. Pre-fix: prod's
  // admin status widget showed red because the proxy got a 401 from the
  // backend's gate. Fix discovered by prod team 2026-05-22 during 4.1.1 soak.
  //
  // Header rotation: if HEALTH_CHECK_TOKEN is ever rotated, both the
  // App Runner backend env var AND apps/web/.env.production must update
  // in lockstep.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    const start = Date.now();
    try {
      const token = process.env.HEALTH_CHECK_TOKEN;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetchWithTimeout(`${apiUrl}/health/full`, { headers });
      const latency = Date.now() - start;

      if (response.ok) {
        const data = await response.json();
        checks.push({
          name: 'Backend API',
          status: 'ok',
          latency_ms: latency,
        });
        // Extract database check from backend's full health response
        if (data.checks?.database) {
          checks.push({
            name: 'Database',
            status: data.checks.database.status,
            latency_ms: data.checks.database.latency_ms,
            error: data.checks.database.error,
          });
        }
        // Extract SES (email service) check from backend's full health response
        if (data.checks?.ses) {
          checks.push({
            name: 'Email Service',
            status: data.checks.ses.status,
            latency_ms: data.checks.ses.latency_ms,
            error: data.checks.ses.error,
          });
        }
      } else {
        checks.push({
          name: 'Backend API',
          status: 'error',
          latency_ms: latency,
          error: `HTTP ${response.status}`,
        });
        checks.push({
          name: 'Database',
          status: 'error',
          error: 'Backend unavailable',
        });
      }
    } catch (error) {
      checks.push({
        name: 'Backend API',
        status: 'error',
        latency_ms: Date.now() - start,
        error: error instanceof Error ? error.message : 'Connection failed',
      });
      checks.push({
        name: 'Database',
        status: 'error',
        error: 'Backend unavailable',
      });
    }
  } else {
    checks.push({ name: 'Backend API', status: 'error', error: 'Not configured' });
    checks.push({ name: 'Database', status: 'error', error: 'Backend not configured' });
  }

  // Check Cognito (reachability)
  const cognitoStart = Date.now();
  try {
    const response = await fetchWithTimeout(
      'https://cognito-idp.us-east-2.amazonaws.com',
      { method: 'HEAD' }
    );
    checks.push({
      name: 'Auth Service',
      status: 'ok',
      latency_ms: Date.now() - cognitoStart,
    });
  } catch (error) {
    checks.push({
      name: 'Auth Service',
      status: 'error',
      latency_ms: Date.now() - cognitoStart,
      error: error instanceof Error ? error.message : 'Connection failed',
    });
  }

  // Determine overall status
  const hasError = checks.some((c) => c.status === 'error');
  const allOk = checks.every((c) => c.status === 'ok');

  const response: StatusResponse = {
    status: allOk ? 'ok' : hasError ? 'degraded' : 'ok',
    checks,
  };

  return NextResponse.json(response);
}
