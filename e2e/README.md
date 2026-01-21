# E2E Tests

End-to-end tests for KOL360 that can run against local or AWS deployments.

## Test Data Setup

The e2e tests use a dedicated **test tenant** with fixed test data:

| Entity | ID | Description |
|--------|-----|-------------|
| Client | `e2e_test_client_001` | E2E Test Pharma |
| Disease Area | `e2e_test_disease_area_001` | E2E Test Oncology |
| HCP 1 | `e2e_test_hcp_001` | Alice TestDoctor (NPI: 9990000001) |
| HCP 2 | `e2e_test_hcp_002` | Bob TestPhysician (NPI: 9990000002) |
| HCP 3 | `e2e_test_hcp_003` | Carol TestSpecialist (NPI: 9990000003) |
| User | `e2e_test_user_001` | e2e.testuser@e2etest.example.com |

## Quick Start

### 1. Install Dependencies

```bash
pnpm install

# Install Playwright browsers (first time only)
pnpm --filter @kol360/e2e exec playwright install chromium
```

### 2. Seed Test Data

**One-time setup** - creates the test client, disease area, and HCPs:

```bash
# From root directory
pnpm e2e:seed

# Or from e2e directory
cd e2e && pnpm seed
```

### 3. Get Auth Token

For authenticated tests (campaign workflows), you need a valid JWT token:

1. Log into the app in your browser
2. Open DevTools → Application → Local Storage
3. Copy the `accessToken` value
4. Set it as an environment variable:

```bash
export E2E_AUTH_TOKEN="your-jwt-token-here"
```

### 4. Run Tests

```bash
# Against LOCAL deployment
pnpm e2e:local              # All tests
pnpm e2e:api:local          # API tests only
pnpm e2e:web:local          # Web tests only

# Against AWS deployment
pnpm e2e:aws                # All tests
pnpm e2e:api:aws            # API tests only
pnpm e2e:web:aws            # Web tests only
```

## Test Structure

```
e2e/
├── api/
│   ├── health.test.ts              # Health checks (no auth needed)
│   ├── auth.test.ts                # Auth validation tests
│   ├── campaigns.test.ts           # Basic campaign tests
│   └── campaigns-workflow.test.ts  # Full campaign workflow tests
├── web/
│   ├── app.spec.ts                 # App loading & performance
│   └── navigation.spec.ts          # Route navigation tests
├── fixtures.ts                     # Test data IDs and helpers
├── config.ts                       # Environment configuration
├── api-client.ts                   # API helper for tests
├── seed-test-data.ts               # Seed script
└── cleanup-test-data.ts            # Cleanup script
```

## What Gets Tested

### Health & Basic Tests (No Auth Required)
- ✅ API health endpoint responds
- ✅ API responds within acceptable time
- ✅ Web app loads without JS errors
- ✅ Protected routes redirect to login
- ✅ Invalid auth tokens are rejected

### Campaign Workflow Tests (Auth Required)
- ✅ Create new campaign with test client/disease area
- ✅ Assign test HCPs to campaign
- ✅ List assigned HCPs
- ✅ Get distribution stats
- ✅ Update campaign
- ✅ Remove HCP from campaign
- ✅ Validation (reject invalid data)
- ✅ Cleanup (delete test campaign)

### HCP Tests (Auth Required)
- ✅ Search HCPs by name
- ✅ Search HCPs by NPI
- ✅ Get HCP by ID

## Cleanup

### Clean up test campaigns only
Removes campaigns created during tests, keeps the base test data (client, HCPs):

```bash
pnpm e2e:cleanup
```

### Clean up ALL test data
Removes everything including the test client and HCPs:

```bash
pnpm e2e:cleanup:all
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `E2E_API_URL` | API base URL | `http://localhost:3001` |
| `E2E_WEB_URL` | Web app base URL | `http://localhost:3000` |
| `E2E_AUTH_TOKEN` | JWT token for authenticated tests | - |

## AWS URLs

- **API**: `https://ik6dmnn2ra.us-east-2.awsapprunner.com`
- **Web**: `https://y6empq5whm.us-east-2.awsapprunner.com`

## Catching Regressions

The workflow tests are designed to catch common regressions:

| Issue | How It's Caught |
|-------|-----------------|
| Broken API endpoints | Health tests fail |
| Auth issues | Auth validation tests fail |
| Campaign CRUD bugs | Workflow tests fail |
| HCP assignment bugs | Distribution tests fail |
| Schema/type changes | Validation tests fail |
| JS build errors | Web page load tests fail |

Run these tests **before deploying** and **after making changes** to catch issues early!
