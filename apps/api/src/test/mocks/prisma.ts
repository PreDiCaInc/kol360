import { vi } from 'vitest';

/**
 * Mock Prisma client for unit testing
 * Provides type-safe mocks for all Prisma models
 */

export const createMockPrismaClient = () => ({
  // Campaign
  campaign: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // HCP
  hcp: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // HCP Alias
  hcpAlias: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  // HCP Campaign Score
  hcpCampaignScore: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
  },
  // HCP Disease Area Score
  hcpDiseaseAreaScore: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  // Nomination
  nomination: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  // Survey Response
  surveyResponse: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // Survey Question
  surveyQuestion: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  // Campaign HCP
  campaignHcp: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // Composite Score Config
  compositeScoreConfig: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  // Opt Out
  optOut: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  // Payment
  payment: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
  // Payment Export Batch
  paymentExportBatch: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  // Payment Import Batch
  paymentImportBatch: {
    create: vi.fn(),
    update: vi.fn(),
  },
  // Payment Status History
  paymentStatusHistory: {
    create: vi.fn(),
  },
  // User
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // Client
  client: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // Audit Log
  auditLog: {
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  // Disease Area
  diseaseArea: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // Question
  question: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // Section
  sectionTemplate: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // Survey Template
  surveyTemplate: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  // $transaction
  $transaction: vi.fn((callback) => callback(createMockPrismaClient())),
  // $disconnect
  $disconnect: vi.fn(),
});

export type MockPrismaClient = ReturnType<typeof createMockPrismaClient>;

/**
 * Reset all mocks for a fresh state
 */
export const resetMockPrisma = (mockPrisma: MockPrismaClient) => {
  Object.values(mockPrisma).forEach((model) => {
    if (typeof model === 'object' && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === 'function' && 'mockReset' in method) {
          (method as ReturnType<typeof vi.fn>).mockReset();
        }
      });
    }
  });
};

/**
 * Helper to create mock HCP data
 */
export const createMockHcp = (overrides = {}) => ({
  id: 'hcp-1',
  npi: '1234567890',
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@example.com',
  specialty: 'Cardiology',
  city: 'New York',
  state: 'NY',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  createdBy: 'user-1',
  aliases: [],
  ...overrides,
});

/**
 * Helper to create mock Campaign data
 */
export const createMockCampaign = (overrides = {}) => ({
  id: 'campaign-1',
  clientId: 'client-1',
  diseaseAreaId: 'disease-area-1',
  name: 'Test Campaign',
  description: 'A test campaign',
  status: 'ACTIVE' as const,
  surveyTemplateId: 'template-1',
  honorariumAmount: 100,
  surveyOpenDate: new Date('2024-01-01'),
  surveyCloseDate: new Date('2024-12-31'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  createdBy: 'user-1',
  ...overrides,
});

/**
 * Helper to create mock Nomination data
 */
export const createMockNomination = (overrides = {}) => ({
  id: 'nomination-1',
  responseId: 'response-1',
  questionId: 'question-1',
  rawNameEntered: 'John Smith',
  matchStatus: 'UNMATCHED' as const,
  matchedHcpId: null,
  matchedBy: null,
  matchedAt: null,
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

/**
 * Helper to create mock HcpCampaignScore data
 */
export const createMockHcpCampaignScore = (overrides = {}) => ({
  id: 'score-1',
  hcpId: 'hcp-1',
  campaignId: 'campaign-1',
  scoreSurvey: 75.5,
  nominationCount: 10,
  compositeScore: 82.3,
  calculatedAt: new Date('2024-01-15'),
  publishedAt: null,
  ...overrides,
});

/**
 * Helper to create mock CompositeScoreConfig data
 */
export const createMockScoreConfig = (overrides = {}) => ({
  id: 'config-1',
  campaignId: 'campaign-1',
  weightPublications: 10,
  weightClinicalTrials: 15,
  weightTradePubs: 10,
  weightOrgLeadership: 10,
  weightOrgAwareness: 10,
  weightConference: 10,
  weightSocialMedia: 5,
  weightMediaPodcasts: 5,
  weightSurvey: 25,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

/**
 * Helper to create mock HcpDiseaseAreaScore data
 */
export const createMockDiseaseAreaScore = (overrides = {}) => ({
  id: 'da-score-1',
  hcpId: 'hcp-1',
  diseaseAreaId: 'disease-area-1',
  scorePublications: 80,
  scoreClinicalTrials: 70,
  scoreTradePubs: 60,
  scoreOrgLeadership: 75,
  scoreOrgAwareness: 65,
  scoreConference: 85,
  scoreSocialMedia: 50,
  scoreMediaPodcasts: 55,
  scoreSurvey: null,
  compositeScore: 70,
  totalNominationCount: 0,
  campaignCount: 0,
  isCurrent: true,
  effectiveFrom: new Date('2024-01-01'),
  effectiveTo: null,
  lastCalculatedAt: new Date('2024-01-01'),
  ...overrides,
});

/**
 * Helper to create mock User data
 */
export const createMockUser = (overrides = {}) => ({
  id: 'user-1',
  cognitoId: 'cognito-123',
  email: 'user@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'CLIENT_ADMIN' as const,
  status: 'ACTIVE' as const,
  clientId: 'client-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

/**
 * Helper to create mock Client data
 */
export const createMockClient = (overrides = {}) => ({
  id: 'client-1',
  name: 'Test Client',
  slug: 'test-client',
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

/**
 * Helper to create mock Payment data
 */
export const createMockPayment = (overrides = {}) => ({
  id: 'payment-1',
  campaignId: 'campaign-1',
  hcpId: 'hcp-1',
  responseId: 'response-1',
  amount: 100,
  currency: 'USD',
  status: 'PENDING_EXPORT' as const,
  exportedAt: null,
  exportBatchId: null,
  statusUpdatedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});
