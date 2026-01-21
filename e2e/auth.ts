/**
 * E2E Test Authentication
 *
 * Authenticates against Cognito to get a JWT token for e2e tests.
 *
 * Environment variables:
 *   E2E_TEST_EMAIL    - Test user email (default: e2e.testuser@bio-exec.com)
 *   E2E_TEST_PASSWORD - Test user password (required)
 *
 * Usage:
 *   # Get token and export it
 *   export E2E_AUTH_TOKEN=$(npx tsx e2e/auth.ts)
 *
 *   # Or run tests directly with auth
 *   E2E_TEST_PASSWORD=yourpassword pnpm e2e:api:aws
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';

// Cognito configuration (from CLAUDE.md)
const COGNITO_CONFIG = {
  region: 'us-east-2',
  userPoolId: 'us-east-2_63CJVTAV9',
  clientId: '7tqkritsrh3dgmaj6oq8va46vj',
};

// Test user defaults
const DEFAULT_TEST_EMAIL = 'e2e.testuser@bio-exec.com';

export interface AuthResult {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}

/**
 * Authenticate with Cognito using username/password
 */
export async function authenticateWithCognito(
  email: string,
  password: string
): Promise<AuthResult> {
  const client = new CognitoIdentityProviderClient({
    region: COGNITO_CONFIG.region,
  });

  const command = new InitiateAuthCommand({
    AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
    ClientId: COGNITO_CONFIG.clientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });

  const response = await client.send(command);

  if (!response.AuthenticationResult) {
    throw new Error('Authentication failed: No result returned');
  }

  const { AccessToken, IdToken, RefreshToken, ExpiresIn } =
    response.AuthenticationResult;

  if (!AccessToken || !IdToken) {
    throw new Error('Authentication failed: Missing tokens');
  }

  return {
    accessToken: AccessToken,
    idToken: IdToken,
    refreshToken: RefreshToken,
    expiresIn: ExpiresIn || 3600,
  };
}

/**
 * Get auth token for e2e tests
 * Uses environment variables for credentials
 */
export async function getE2EAuthToken(): Promise<string> {
  const email = process.env.E2E_TEST_EMAIL || DEFAULT_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!password) {
    throw new Error(
      'E2E_TEST_PASSWORD environment variable is required.\n' +
        'Set it before running e2e tests:\n' +
        '  export E2E_TEST_PASSWORD="your-password"\n' +
        '  pnpm e2e:api:aws'
    );
  }

  const result = await authenticateWithCognito(email, password);
  return result.accessToken; // Use accessToken for API auth (expected by Cognito JWT verifier)
}

// CLI: Run directly to get a token
async function main() {
  try {
    const token = await getE2EAuthToken();
    // Output only the token for easy shell capture
    console.log(token);
  } catch (error) {
    console.error('Authentication failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
