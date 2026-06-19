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
  // Named with 'z' prefix to sort last in disease area lists
  DISEASE_AREA_ID: 'cme2e0test0disease0001',
  DISEASE_AREA_NAME: 'zE2E Test Oncology',
  DISEASE_AREA_CODE: 'E2E_ONCOLOGY',
  THERAPEUTIC_AREA: 'zTest',

  // Test Specialty - CUID format required
  SPECIALTY_ID: 'cme2e0test0special0001',
  SPECIALTY_NAME: 'E2E Test Oncology Specialist',
  SPECIALTY_CODE: 'E2E_ONC',

  // Test HCPs - CUID format required
  // HCP_1: Generic test HCP (fake email)
  HCP_1: {
    id: 'cme2e0test0hcp0000001',
    npi: '9990000001',
    firstName: 'Alice',
    lastName: 'TestDoctor',
    email: 'alice.test@e2etest.example.com',
    city: 'Boston',
    state: 'MA',
  },

  // HCP_2: Real email for testing email delivery (bio-exec.com inbox)
  HCP_2: {
    id: 'cme2e0test0hcp0000002',
    npi: '9990000002',
    firstName: 'E2E',
    lastName: 'TestHCP',
    email: 'hcp2@bio-exec.com', // Real email - can check inbox
    city: 'New York',
    state: 'NY',
  },

  // HCP_3: Generic test HCP (fake email)
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

  // Survey Template - required for campaign activation
  SURVEY_TEMPLATE_ID: 'cme2e0test0survey00001',
  SURVEY_TEMPLATE_NAME: 'E2E Test Survey Template',

  // Section Template
  SECTION_TEMPLATE_ID: 'cme2e0test0section0001',
  SECTION_TEMPLATE_NAME: 'E2E Test Section',

  // Questions
  QUESTION_1_ID: 'cme2e0test0quest00001', // Rating question
  QUESTION_2_ID: 'cme2e0test0quest00002', // Single choice
  QUESTION_3_ID: 'cme2e0test0quest00003', // Text question

  // Campaign prefix (campaigns are created dynamically)
  CAMPAIGN_PREFIX: 'E2E_TEST_CAMPAIGN_',

  // v1.17.41 — STABLE fixture campaign for read-side tests.
  //
  // Background: nomination-matching, ucpm-backfill, and ucpm-backfill-deep
  // tests used to scrape `E2E_TEST_CAMPAIGN_*` campaigns via listCampaigns,
  // racing with full-workflow.test.ts which creates AND deletes its own
  // such campaigns during the same run. Stress-testing the suite 3x
  // surfaced ~6 distinct flake patterns from this race class.
  //
  // The stable campaign uses a DIFFERENT prefix (`E2E_STABLE_FIXTURE_`)
  // so it is NOT touched by:
  //   - full-workflow.test.ts (which only creates/deletes E2E_TEST_CAMPAIGN_*)
  //   - cleanup-test-data.ts (filter uses CAMPAIGN_PREFIX)
  // Seeded once via `pnpm e2e:seed`; persists across runs; never deleted
  // by the suite. Tests look up by fixed CUID rather than scraping.
  STABLE_FIXTURE: {
    CAMPAIGN_ID: 'cme2e0stable0camp00001',
    CAMPAIGN_NAME: 'E2E_STABLE_FIXTURE_CAMPAIGN',
    NOMINATION_QUESTION_ID: 'cme2e0stable0quest0001',
    SURVEY_QUESTION_ID: 'cme2e0stable0srvquest1',
    // Two nominations pre-seeded MATCHED (matchedHcpId set to HCP_2 / HCP_3)
    MATCHED_NOMINATION_1_ID: 'cme2e0stable0nommatch1',
    MATCHED_NOMINATION_2_ID: 'cme2e0stable0nommatch2',
    // Two nominations pre-seeded UNMATCHED (rawNameEntered only)
    UNMATCHED_NOMINATION_1_ID: 'cme2e0stable0nomunmat1',
    UNMATCHED_NOMINATION_2_ID: 'cme2e0stable0nomunmat2',
    // The HCP_1 response that holds all 4 nominations (HCP_1 is the nominator)
    SURVEY_RESPONSE_ID: 'cme2e0stable0resp00001',
    SURVEY_TOKEN: 'e2e-stable-token-fixed-01',

    // v1.17.57 — separate disease area + campaign + analysis dedicated
    // to read-side parity tests (insights-match-count parity).
    // The "stable" campaign above lives under TEST_IDS.DISEASE_AREA_ID
    // which is shared with full-workflow's createTestCampaign() pool.
    // Tests that create/delete campaigns under that (client, DA)
    // race against parity reads (`resolveAccessibleCampaignIds`
    // returns the full owned set, so any mid-suite mutation diverges
    // the count). The PARITY_* fixture lives under its OWN disease
    // area that no other test touches.
    PARITY_DISEASE_AREA_ID: 'cme2e0stable0disease01',
    PARITY_DISEASE_AREA_NAME: 'E2E Stable Parity Disease Area',
    PARITY_DISEASE_AREA_CODE: 'E2E_PARITY_DA',
    PARITY_CAMPAIGN_ID: 'cme2e0stable0parity0c1',
    PARITY_CAMPAIGN_NAME: 'E2E_STABLE_FIXTURE_PARITY_CAMPAIGN',
    PARITY_SURVEY_QUESTION_ID: 'cme2e0stable0parity0q1',
    PARITY_SURVEY_RESPONSE_ID: 'cme2e0stable0parity0r1',
    PARITY_SURVEY_TOKEN: 'e2e-stable-parity-tok-01',
    PARITY_ANALYSIS_ID: 'cme2e0stable0parityana1',
  },

  // HCP for import test (with segmentation data).
  // v1.15.32: specialty flipped from 'Oncology' to 'Optometry' (canonical).
  // The old value was out-of-domain and accumulated as test pollution on prod
  // over ~2 months of E2E runs (the cleanup-script leak + the broken
  // normalizer on the bulk-import path both let it through). With the v1.15.32
  // strict whitelist CHECK constraint, non-canonical values now fail at the DB.
  HCP_IMPORT: {
    npi: '9990000004',
    firstName: 'Import',
    lastName: 'TestHCP',
    email: 'import.test@e2etest.example.com',
    specialty: 'Optometry',
    city: 'Los Angeles',
    state: 'CA',
    // Segmentation fields
    marketDecile: 8,
    product1Decile: 7,
    product2Decile: 5,
    practiceSetting: 'Academic',
    practiceSentiment: 'Positive',
    prescribingBehavior: 'Champions/Loyalist',
    segmentation1: 'High Value',
    segmentation2: 'Early Adopter',
    segmentation3: 'Key Opinion Leader',
  },
} as const;

/**
 * Get all test HCPs as an array
 */
export function getTestHcps() {
  return [TEST_IDS.HCP_1, TEST_IDS.HCP_2, TEST_IDS.HCP_3];
}

/**
 * Get the HCP with the real email for email delivery testing
 */
export function getRealEmailHcp() {
  return TEST_IDS.HCP_2;
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

/**
 * Generate a unique CUID-like ID for test data
 * Format: cme2e + random suffix (must be 25 chars total)
 */
export function generateTestId(prefix: string = 'test'): string {
  const random = Math.random().toString(36).substring(2, 15);
  const id = `cme2e0${prefix}0${random}`.substring(0, 25);
  return id.padEnd(25, '0');
}

/**
 * Generate CSV content for HCP import with segmentation data
 */
export function generateHcpImportCsv(hcps: Array<{
  npi: string;
  firstName: string;
  lastName: string;
  email: string;
  specialty: string;
  city?: string;
  state?: string;
  marketDecile?: number;
  product1Decile?: number;
  product2Decile?: number;
  practiceSetting?: string;
  practiceSentiment?: string;
  prescribingBehavior?: string;
  segmentation1?: string;
  segmentation2?: string;
  segmentation3?: string;
}>): string {
  const headers = [
    'NPI',
    'First Name',
    'Last Name',
    'Email',
    'Specialty',
    'City',
    'State',
    'Market Decile',
    'Product1 Decile',
    'Product2 Decile',
    'Practice Setting',
    'Practice Sentiment',
    'Prescribing Behavior',
    'Segmentation1',
    'Segmentation2',
    'Segmentation3',
  ];

  const rows = hcps.map((hcp) => [
    hcp.npi,
    hcp.firstName,
    hcp.lastName,
    hcp.email,
    hcp.specialty,
    hcp.city || '',
    hcp.state || '',
    hcp.marketDecile?.toString() || '',
    hcp.product1Decile?.toString() || '',
    hcp.product2Decile?.toString() || '',
    hcp.practiceSetting || '',
    hcp.practiceSentiment || '',
    hcp.prescribingBehavior || '',
    hcp.segmentation1 || '',
    hcp.segmentation2 || '',
    hcp.segmentation3 || '',
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

/**
 * Sample survey answers for testing
 * These match the expected format for survey submission
 */
export function generateSampleAnswers(questions: { id: string; type: string }[]) {
  return questions.map((q) => {
    switch (q.type) {
      case 'SINGLE_SELECT':
        return { questionId: q.id, value: 0 }; // First option
      case 'MULTI_SELECT':
        return { questionId: q.id, value: [0] }; // First option selected
      case 'RATING':
        return { questionId: q.id, value: 4 }; // Rating of 4
      case 'TEXT':
        return { questionId: q.id, value: 'E2E test response' };
      case 'NOMINATION':
        return {
          questionId: q.id,
          value: [
            { name: 'Dr. John Smith', institution: 'Test Hospital' },
            { name: 'Dr. Jane Doe', institution: 'Test Clinic' },
          ],
        };
      default:
        return { questionId: q.id, value: 'test' };
    }
  });
}
