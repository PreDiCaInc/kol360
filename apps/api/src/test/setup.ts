import { vi, beforeEach } from 'vitest';

// Mock Prisma Client
export const mockPrisma = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  client: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  campaign: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  hcp: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
  },
  hcpAlias: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  hcpSpecialty: {
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  specialty: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  question: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  section: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  survey: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  surveyResponse: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  surveyQuestion: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  nomination: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  score: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  scoreConfig: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  diseaseArea: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  auditLog: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  payment: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  distributionList: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  distributionListHcp: {
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  liteClientDiseaseArea: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
};

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Factory functions for creating test data
export function createMockUser(overrides = {}) {
  return {
    id: 'user-1',
    cognitoSub: 'cognito-sub-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'TEAM_MEMBER',
    status: 'ACTIVE',
    clientId: 'client-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockClient(overrides = {}) {
  return {
    id: 'client-1',
    name: 'Test Client',
    type: 'FULL',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockCampaign(overrides = {}) {
  return {
    id: 'campaign-1',
    name: 'Test Campaign',
    clientId: 'client-1',
    status: 'DRAFT',
    honorariumAmount: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: 'user-1',
    ...overrides,
  };
}

export function createMockHcp(overrides = {}) {
  return {
    id: 'hcp-1',
    npi: '1234567890',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    state: 'CA',
    city: 'Los Angeles',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockQuestion(overrides = {}) {
  return {
    id: 'question-1',
    text: 'Test question',
    type: 'SINGLE_SELECT',
    options: ['Option A', 'Option B', 'Option C'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockSection(overrides = {}) {
  return {
    id: 'section-1',
    name: 'Test Section',
    description: 'Test section description',
    sortOrder: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockNomination(overrides = {}) {
  return {
    id: 'nomination-1',
    responseId: 'response-1',
    nominatedName: 'Jane Smith',
    matchStatus: 'UNMATCHED',
    matchedHcpId: null,
    matchConfidence: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockSurveyResponse(overrides = {}) {
  return {
    id: 'response-1',
    campaignId: 'campaign-1',
    surveyToken: 'token-123',
    status: 'PENDING',
    hcpId: 'hcp-1',
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
