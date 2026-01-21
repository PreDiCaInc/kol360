/**
 * E2E Test Fixtures
 *
 * Fixed IDs for test data to ensure idempotent seeding and easy cleanup.
 * All test data uses the "E2E_TEST_" prefix for easy identification.
 */

export const TEST_IDS = {
  // Test Client (Tenant) - CUID format required by API schema
  CLIENT_ID: 'cme2e0test0client00001',
  CLIENT_NAME: 'E2E Test Pharma',

  // Test Disease Area / Therapeutic Area - CUID format required
  DISEASE_AREA_ID: 'cme2e0test0disease0001',
  DISEASE_AREA_NAME: 'E2E Test Oncology',
  DISEASE_AREA_CODE: 'E2E_ONCOLOGY',
  THERAPEUTIC_AREA: 'E2E Test Therapeutic Area',

  // Test Specialty - CUID format required
  SPECIALTY_ID: 'cme2e0test0special0001',
  SPECIALTY_NAME: 'E2E Test Oncology Specialist',
  SPECIALTY_CODE: 'E2E_ONC',

  // Test HCPs (3 test HCPs) - CUID format required
  HCP_1: {
    id: 'cme2e0test0hcp0000001',
    npi: '9990000001',
    firstName: 'Alice',
    lastName: 'TestDoctor',
    email: 'alice.test@e2etest.example.com',
    city: 'Boston',
    state: 'MA',
  },
  HCP_2: {
    id: 'cme2e0test0hcp0000002',
    npi: '9990000002',
    firstName: 'Bob',
    lastName: 'TestPhysician',
    email: 'bob.test@e2etest.example.com',
    city: 'New York',
    state: 'NY',
  },
  HCP_3: {
    id: 'cme2e0test0hcp0000003',
    npi: '9990000003',
    firstName: 'Carol',
    lastName: 'TestSpecialist',
    email: 'carol.test@e2etest.example.com',
    city: 'Chicago',
    state: 'IL',
  },

  // Test User (for authentication) - CUID format required
  USER_ID: 'cme2e0test0user000001',
  USER_EMAIL: 'e2e.testuser@bio-exec.com',
  USER_COGNITO_SUB: 'd11b2570-8051-7098-327c-3d660a97d7a0',

  // Campaign prefix (campaigns are created dynamically)
  CAMPAIGN_PREFIX: 'E2E_TEST_CAMPAIGN_',
} as const;

/**
 * Get all test HCPs as an array
 */
export function getTestHcps() {
  return [TEST_IDS.HCP_1, TEST_IDS.HCP_2, TEST_IDS.HCP_3];
}

/**
 * Check if an ID belongs to test data
 */
export function isTestData(id: string): boolean {
  return id.startsWith('cme2e0test') || id.startsWith('E2E_TEST_');
}

/**
 * Generate a unique test campaign name
 */
export function generateTestCampaignName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${TEST_IDS.CAMPAIGN_PREFIX}${timestamp}`;
}
