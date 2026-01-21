/**
 * E2E Test Fixtures
 *
 * Fixed IDs for test data to ensure idempotent seeding and easy cleanup.
 * All test data uses the "E2E_TEST_" prefix for easy identification.
 */

export const TEST_IDS = {
  // Test Client (Tenant)
  CLIENT_ID: 'e2e_test_client_001',
  CLIENT_NAME: 'E2E Test Pharma',

  // Test Disease Area / Therapeutic Area
  DISEASE_AREA_ID: 'e2e_test_disease_area_001',
  DISEASE_AREA_NAME: 'E2E Test Oncology',
  DISEASE_AREA_CODE: 'E2E_ONCOLOGY',
  THERAPEUTIC_AREA: 'E2E Test Therapeutic Area',

  // Test Specialty
  SPECIALTY_ID: 'e2e_test_specialty_001',
  SPECIALTY_NAME: 'E2E Test Oncology Specialist',
  SPECIALTY_CODE: 'E2E_ONC',

  // Test HCPs (3 test HCPs)
  HCP_1: {
    id: 'e2e_test_hcp_001',
    npi: '9990000001',
    firstName: 'Alice',
    lastName: 'TestDoctor',
    email: 'alice.test@e2etest.example.com',
    city: 'Boston',
    state: 'MA',
  },
  HCP_2: {
    id: 'e2e_test_hcp_002',
    npi: '9990000002',
    firstName: 'Bob',
    lastName: 'TestPhysician',
    email: 'bob.test@e2etest.example.com',
    city: 'New York',
    state: 'NY',
  },
  HCP_3: {
    id: 'e2e_test_hcp_003',
    npi: '9990000003',
    firstName: 'Carol',
    lastName: 'TestSpecialist',
    email: 'carol.test@e2etest.example.com',
    city: 'Chicago',
    state: 'IL',
  },

  // Test User (for authentication)
  USER_ID: 'e2e_test_user_001',
  USER_EMAIL: 'e2e.testuser@e2etest.example.com',
  USER_COGNITO_SUB: 'e2e-test-cognito-sub-001',

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
  return id.startsWith('e2e_test_') || id.startsWith('E2E_TEST_');
}

/**
 * Generate a unique test campaign name
 */
export function generateTestCampaignName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${TEST_IDS.CAMPAIGN_PREFIX}${timestamp}`;
}
