import { NextRequest, NextResponse } from 'next/server';

// Read version from package.json at build time
const APP_VERSION = process.env.npm_package_version || '0.0.1';

type CheckStatus = 'ok' | 'error';
type OverallStatus = 'ok' | 'degraded' | 'error';

interface CheckResult {
  status: CheckStatus;
  latency_ms?: number;
  response?: unknown;
  error?: string;
  details?: Record<string, string>;
}

interface HealthResponse {
  status: OverallStatus;
  timestamp: string;
  version: string;
  environment: string;
  checks: {
    frontend: CheckResult;
    env_vars: CheckResult;
    backend: CheckResult;
    backend_full: CheckResult;
    cognito: CheckResult;
  };
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

function validateToken(request: NextRequest): boolean {
  const expectedToken = process.env.HEALTH_CHECK_TOKEN;

  // If no token is configured, deny access
  if (!expectedToken) {
    return false;
  }

  // Check query parameter
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  if (queryToken === expectedToken) {
    return true;
  }

  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7);
    if (bearerToken === expectedToken) {
      return true;
    }
  }

  return false;
}

async function checkEnvVars(): Promise<CheckResult> {
  const envVars = {
    api_url: process.env.NEXT_PUBLIC_API_URL ? 'configured' : 'missing',
    cognito_pool: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ? 'configured' : 'missing',
    cognito_client: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ? 'configured' : 'missing',
  };

  const allConfigured = Object.values(envVars).every((v) => v === 'configured');

  return {
    status: allConfigured ? 'ok' : 'error',
    details: envVars,
  };
}

async function checkBackend(): Promise<CheckResult> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return { status: 'error', error: 'API URL not configured' };
  }

  const start = Date.now();
  try {
    const response = await fetchWithTimeout(`${apiUrl}/health`);
    const latency = Date.now() - start;

    if (!response.ok) {
      return {
        status: 'error',
        latency_ms: latency,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      status: 'ok',
      latency_ms: latency,
      response: data,
    };
  } catch (error) {
    return {
      status: 'error',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkBackendFull(): Promise<CheckResult> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return { status: 'error', error: 'API URL not configured' };
  }

  const start = Date.now();
  try {
    const response = await fetchWithTimeout(`${apiUrl}/health/full`);
    const latency = Date.now() - start;

    if (!response.ok) {
      return {
        status: 'error',
        latency_ms: latency,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      status: 'ok',
      latency_ms: latency,
      response: data,
    };
  } catch (error) {
    return {
      status: 'error',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkCognito(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const response = await fetchWithTimeout(
      'https://cognito-idp.us-east-2.amazonaws.com',
      { method: 'HEAD' }
    );
    const latency = Date.now() - start;

    // Cognito will return various status codes, but if we get a response it's reachable
    return {
      status: 'ok',
      latency_ms: latency,
    };
  } catch (error) {
    return {
      status: 'error',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function determineOverallStatus(checks: HealthResponse['checks']): OverallStatus {
  // Error if backend basic health fails
  if (checks.backend.status === 'error') {
    return 'error';
  }

  // Degraded if backend_full or cognito fails but basic backend works
  if (checks.backend_full.status === 'error' || checks.cognito.status === 'error') {
    return 'degraded';
  }

  // Ok if all checks pass
  return 'ok';
}

export async function GET(request: NextRequest) {
  // Validate authentication token
  if (!validateToken(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Valid HEALTH_CHECK_TOKEN required' },
      { status: 401 }
    );
  }

  // Run all checks in parallel
  const [envVars, backend, backendFull, cognito] = await Promise.all([
    checkEnvVars(),
    checkBackend(),
    checkBackendFull(),
    checkCognito(),
  ]);

  const checks: HealthResponse['checks'] = {
    frontend: { status: 'ok' },
    env_vars: envVars,
    backend,
    backend_full: backendFull,
    cognito,
  };

  const response: HealthResponse = {
    status: determineOverallStatus(checks),
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    environment: process.env.NODE_ENV || 'unknown',
    checks,
  };

  return NextResponse.json(response);
}
