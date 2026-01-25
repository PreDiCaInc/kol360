/**
 * Cognito Login E2E Tests
 *
 * Tests the authentication flow with AWS Cognito.
 * Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables.
 */

import { describe, it, expect } from 'vitest';
import { authenticateWithCognito } from '../auth';
import { config, getApiUrl } from '../config';

// Check if credentials are available for login tests
const hasCredentials =
  (config.testEmail || process.env.E2E_TEST_EMAIL) &&
  (config.testPassword || process.env.E2E_TEST_PASSWORD);

describe('Cognito Authentication', () => {
  describe('Login Flow', () => {
    it.skipIf(!hasCredentials)(
      'should authenticate with valid email/password',
      async () => {
        const email =
          config.testEmail ||
          process.env.E2E_TEST_EMAIL ||
          'e2e.testuser@bio-exec.com';
        const password = config.testPassword || process.env.E2E_TEST_PASSWORD!;

        const result = await authenticateWithCognito(email, password);

        // Verify we got tokens
        expect(result.accessToken).toBeTruthy();
        expect(result.idToken).toBeTruthy();
        expect(result.expiresIn).toBeGreaterThan(0);

        // Access token should be a JWT (three base64 parts separated by dots)
        const tokenParts = result.accessToken.split('.');
        expect(tokenParts).toHaveLength(3);
      },
      30000
    ); // 30s timeout for auth

    it('should reject invalid credentials', async () => {
      await expect(
        authenticateWithCognito('invalid@example.com', 'wrongpassword')
      ).rejects.toThrow();
    });
  });

  describe('Token Usage', () => {
    it.skipIf(!hasCredentials)(
      'should access protected endpoints with Cognito token',
      async () => {
        const email =
          config.testEmail ||
          process.env.E2E_TEST_EMAIL ||
          'e2e.testuser@bio-exec.com';
        const password = config.testPassword || process.env.E2E_TEST_PASSWORD!;

        // Get a fresh token from Cognito
        const { accessToken } = await authenticateWithCognito(email, password);

        // Use the token to access a protected endpoint
        const response = await fetch(getApiUrl('/api/v1/campaigns'), {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('items');
      },
      30000
    ); // 30s timeout for auth + API call
  });
});
