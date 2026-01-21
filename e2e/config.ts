/**
 * E2E Test Environment Configuration
 *
 * Set these environment variables to run tests against different deployments:
 *
 * Local:
 *   E2E_API_URL=http://localhost:3001
 *   E2E_WEB_URL=http://localhost:3000
 *
 * AWS Production:
 *   E2E_API_URL=https://ik6dmnn2ra.us-east-2.awsapprunner.com
 *   E2E_WEB_URL=https://y6empq5whm.us-east-2.awsapprunner.com
 *
 * For authenticated tests, also set:
 *   E2E_AUTH_TOKEN=<valid JWT token>
 *   E2E_TEST_EMAIL=<test user email>
 *   E2E_TEST_PASSWORD=<test user password>
 */

export const config = {
  apiUrl: process.env.E2E_API_URL || 'http://localhost:3001',
  webUrl: process.env.E2E_WEB_URL || 'http://localhost:3000',
  authToken: process.env.E2E_AUTH_TOKEN || '',
  testEmail: process.env.E2E_TEST_EMAIL || '',
  testPassword: process.env.E2E_TEST_PASSWORD || '',
};

export function getApiUrl(path: string): string {
  return `${config.apiUrl}${path}`;
}

export function getWebUrl(path: string): string {
  return `${config.webUrl}${path}`;
}

export function getAuthHeaders(): Record<string, string> {
  if (!config.authToken) {
    return {};
  }
  return {
    Authorization: `Bearer ${config.authToken}`,
  };
}
