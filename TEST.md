# KOL360 Testing Guide

This document outlines the testing strategy and commands for KOL360. Use this as a reference when making changes to ensure tests are run and regressions are caught.

## Quick Reference

```bash
# Run all unit tests (fast, no dependencies needed)
pnpm --filter @kol360/shared test
pnpm --filter @kol360/api test
pnpm --filter @kol360/web test

# Run e2e tests against AWS (requires auth token)
export E2E_AUTH_TOKEN="your-jwt-token"
pnpm e2e:aws
```

## Test Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Unit Tests                              │
│  Fast, isolated, mocked dependencies - run these ALWAYS        │
├─────────────────────────────────────────────────────────────────┤
│  packages/shared (163 tests)  │  Schema validation, types      │
│  apps/api (209 tests)         │  Service business logic        │
│  apps/web (91 tests)          │  UI components                 │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                          E2E Tests                              │
│  Live deployment testing - run before/after significant changes │
├─────────────────────────────────────────────────────────────────┤
│  e2e/api/*   │  API endpoint tests (health, auth, campaigns)   │
│  e2e/web/*   │  Web app tests (loading, navigation, errors)    │
└─────────────────────────────────────────────────────────────────┘
```

## When to Run Tests

| Scenario | Commands |
|----------|----------|
| After editing shared schemas | `pnpm --filter @kol360/shared test` |
| After editing API services | `pnpm --filter @kol360/api test` |
| After editing web components | `pnpm --filter @kol360/web test` |
| Before creating a PR | Run all unit tests + build |
| After deploying to AWS | `pnpm e2e:aws` |
| Debugging regressions | `pnpm e2e:api:aws` with auth token |

## Unit Tests

### Shared Package (163 tests)
```bash
pnpm --filter @kol360/shared test
```

Tests Zod schemas for:
- `campaign.test.ts` - Campaign schemas and validation
- `client.test.ts` - Client/tenant schemas
- `hcp.test.ts` - HCP schemas and NPI validation
- `nomination.test.ts` - Nomination schemas and match status
- `question.test.ts` - Question types and nomination types
- `response.test.ts` - Survey response schemas
- `user.test.ts` - User schemas and roles

### API Package (209 tests)
```bash
pnpm --filter @kol360/api test
```

Tests service business logic:
- `campaign.service.test.ts` - Campaign CRUD operations
- `client.service.test.ts` - Client/tenant management
- `distribution.service.test.ts` - Campaign HCP distribution
- `nomination.service.test.ts` - Nomination matching logic
- `nomination-scoring.test.ts` - Name matching algorithms
- `question.service.test.ts` - Question management
- `response.service.test.ts` - Survey response handling
- `score-calculation.service.test.ts` - Score calculation logic
- `user.service.test.ts` - User management
- `audit.service.test.ts` - Audit logging
- `logger.test.ts` - Logger utilities
- `errors.test.ts` - Error handling

### Web Package (91 tests)
```bash
pnpm --filter @kol360/web test
```

Tests UI components:
- `badge.test.tsx` - Badge component variants
- `button.test.tsx` - Button component states
- `card.test.tsx` - Card component layouts
- `input.test.tsx` - Input component validation

## E2E Tests

E2E tests run against live deployments (local or AWS).

### Setup (One-time)

```bash
# 1. Seed test data to database
pnpm e2e:seed

# 2. Install Playwright browsers
pnpm --filter @kol360/e2e exec playwright install chromium
```

### Test Data

The e2e tests use a dedicated test tenant:

| Entity | ID | Description |
|--------|-----|-------------|
| Client | `e2e_test_client_001` | E2E Test Pharma |
| Disease Area | `e2e_test_disease_area_001` | E2E Test Oncology |
| HCP 1 | `e2e_test_hcp_001` | Alice TestDoctor (NPI: 9990000001) |
| HCP 2 | `e2e_test_hcp_002` | Bob TestPhysician (NPI: 9990000002) |
| HCP 3 | `e2e_test_hcp_003` | Carol TestSpecialist (NPI: 9990000003) |

### Running E2E Tests

```bash
# Get auth token from browser (DevTools → Application → Local Storage → accessToken)
export E2E_AUTH_TOKEN="your-jwt-token"

# Against AWS deployment
pnpm e2e:aws              # All tests
pnpm e2e:api:aws          # API only
pnpm e2e:web:aws          # Web only

# Against local deployment (localhost:3000/3001)
pnpm e2e:local            # All tests
pnpm e2e:api:local        # API only
pnpm e2e:web:local        # Web only
```

### E2E Test Coverage

**Without Auth Token:**
- API health check responds
- API responds within 2 seconds
- Web app loads without JS errors
- Protected routes redirect to login
- Invalid auth tokens rejected

**With Auth Token:**
- Create campaign with test tenant
- Assign HCPs to campaign
- List assigned HCPs
- Get distribution stats
- Update campaign
- Remove HCP from campaign
- Validation error handling
- Campaign cleanup

### Cleanup

```bash
# Remove test campaigns only (keeps test client/HCPs)
pnpm e2e:cleanup

# Remove ALL test data
pnpm e2e:cleanup:all
```

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on:
- Pull requests to `main`
- Push to `dev` or `main`

Pipeline steps:
1. Install dependencies
2. Generate Prisma client
3. Build shared package
4. Type check all packages
5. Lint all packages
6. Run unit tests (shared → api → web)
7. Build all applications

## Testing Checklist for PRs

Before creating a PR, ensure:

- [ ] All unit tests pass: `pnpm --filter @kol360/shared test && pnpm --filter @kol360/api test && pnpm --filter @kol360/web test`
- [ ] Type check passes: `pnpm type-check`
- [ ] Build succeeds: `pnpm build`
- [ ] If schema changed, update related test files
- [ ] If new service added, create corresponding test file
- [ ] If API endpoints changed, consider updating e2e tests

## Adding New Tests

### Unit Test Template (API Service)

```typescript
// apps/api/src/services/__tests__/myservice.service.test.ts
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

vi.mock('../../lib/prisma', () => ({
  prisma: {
    myModel: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { MyService } from '../myservice.service';
import { prisma } from '../../lib/prisma';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MyService();
  });

  describe('myMethod', () => {
    it('should do something', async () => {
      (prisma.myModel.findMany as Mock).mockResolvedValue([]);
      const result = await service.myMethod();
      expect(result).toEqual([]);
    });
  });
});
```

### Unit Test Template (Shared Schema)

```typescript
// packages/shared/src/schemas/__tests__/myschema.test.ts
import { describe, it, expect } from 'vitest';
import { mySchema } from '../myschema';

describe('mySchema', () => {
  it('should accept valid data', () => {
    const result = mySchema.safeParse({ field: 'value' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid data', () => {
    const result = mySchema.safeParse({ field: '' });
    expect(result.success).toBe(false);
  });
});
```

## Debugging Test Failures

### Unit Tests
```bash
# Run specific test file
pnpm --filter @kol360/api test src/services/__tests__/campaign.service.test.ts

# Run with verbose output
pnpm --filter @kol360/api test -- --reporter=verbose

# Run in watch mode
pnpm --filter @kol360/api test -- --watch
```

### E2E Tests
```bash
# Run with debug output
DEBUG=1 pnpm e2e:api:aws

# Check API directly
curl -H "Authorization: Bearer $E2E_AUTH_TOKEN" \
  https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/campaigns
```

## Test File Locations

```
kol360/
├── packages/shared/
│   └── src/schemas/__tests__/     # Schema validation tests
├── apps/api/
│   ├── src/services/__tests__/    # Service unit tests
│   └── src/lib/__tests__/         # Utility tests
├── apps/web/
│   └── src/components/ui/__tests__/  # Component tests
└── e2e/
    ├── api/                       # API e2e tests
    └── web/                       # Web e2e tests (Playwright)
```

## AWS URLs

- **API**: `https://ik6dmnn2ra.us-east-2.awsapprunner.com`
- **Web**: `https://y6empq5whm.us-east-2.awsapprunner.com`
