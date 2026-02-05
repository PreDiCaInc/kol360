# KOL360 E2E Tests

End-to-end tests for the KOL360 platform, covering the complete workflow from campaign creation to payment processing.

## Quick Start

```bash
# 1. Set up environment
cd e2e
cp .env.example .env
# Edit .env with your test password

# 2. Source environment and run tests
source .env
E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" pnpm test:api:aws:auth
```

## Test Architecture

### Test Files

| File | Description |
|------|-------------|
| `api/health.test.ts` | API health checks and connectivity |
| `api/auth.test.ts` | Authentication and authorization |
| `api/login.test.ts` | Cognito email/password authentication |
| `api/campaigns.test.ts` | Campaign CRUD operations |
| `api/campaigns-workflow.test.ts` | Campaign lifecycle transitions |
| `api/full-workflow.test.ts` | **Complete workflow from creation to payment** |

### Full Workflow Test Coverage

The `full-workflow.test.ts` covers these phases:

1. **Campaign Setup** - Create campaign with test client
2. **HCP Assignment** - Assign HCPs including real email (`hcp2@bio-exec.com`)
3. **Campaign Activation** - Transition DRAFT → ACTIVE
4. **Invitation Flow** - Send email invitations to HCPs
5. **Survey Completion** - Simulate HCP survey completion
6. **Score Calculation** - Calculate survey and composite scores
7. **Nomination Processing** - Match nominations to HCPs
8. **Campaign Close** - Transition ACTIVE → CLOSED
9. **Score Publication** - Publish campaign and scores
10. **Payment Processing** - Verify payment records
11. **Reporting** - Export responses, scores, and payments

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `E2E_API_URL` | API base URL | No (defaults to AWS) |
| `E2E_WEB_URL` | Web app URL | No (defaults to AWS) |
| `E2E_AUTH_TOKEN` | JWT auth token | Auto-generated if password provided |
| `E2E_TEST_EMAIL` | Test user email | No (defaults to `e2e.testuser@bio-exec.com`) |
| `E2E_TEST_PASSWORD` | Test user password | Yes, for auth tests |
| `SKIP_CLEANUP` | Set to `true` to preserve test data | No |

## Running Tests

### Against AWS (Recommended)

```bash
# With automatic Cognito authentication
E2E_TEST_PASSWORD="yourpassword" pnpm test:api:aws:auth

# Full workflow only
E2E_TEST_PASSWORD="yourpassword" pnpm test:workflow:aws

# Keep test data for inspection
SKIP_CLEANUP=true E2E_TEST_PASSWORD="yourpassword" pnpm test:api:aws:auth
```

### Against Local Development

```bash
# Ensure API is running on localhost:3001
E2E_AUTH_TOKEN="your-jwt" pnpm test:api:local
```

### Individual Test Files

```bash
# Run specific test file
npx vitest run api/full-workflow.test.ts

# Run with pattern matching
npx vitest run --testNamePattern="Phase 1"
```

## Authentication

### Option 1: Automatic Cognito Auth (Recommended)

Tests automatically authenticate using Cognito USER_PASSWORD_AUTH:

```bash
E2E_TEST_PASSWORD="password" pnpm test:api:aws:auth
```

### Option 2: Manual Token

Get a token and export it:

```bash
export E2E_AUTH_TOKEN=$(E2E_TEST_PASSWORD="password" npx tsx auth.ts)
pnpm test:api:aws
```

### Option 3: Get Token for CLI Use

```bash
E2E_TEST_PASSWORD="password" npx tsx auth.ts
# Outputs JWT token to stdout
```

## Test Data Management

### Test User
- **Email:** `e2e.testuser@bio-exec.com`
- **Group:** `platform-admins` (full access)

### Test HCPs

| ID | Email | Purpose |
|----|-------|---------|
| HCP_1 | `alice.test@e2etest.example.com` | Generic test HCP |
| HCP_2 | `hcp2@bio-exec.com` | **Real email for inbox verification** |
| HCP_3 | `carol.test@e2etest.example.com` | Generic test HCP |

### Seeding Test Data

Before running tests for the first time:

```bash
pnpm seed
```

This creates:
- Test client (E2E Test Pharma)
- Test disease area (E2E Test Oncology)
- Test specialty
- Test HCPs (3)
- Test user

### Cleaning Up

```bash
# Remove test campaigns only
pnpm cleanup

# Remove ALL test data (campaigns, HCPs, client, etc.)
pnpm cleanup:all
```

## API Client

The `api-client.ts` provides typed methods for all API endpoints:

```typescript
import { ApiClient } from '../api-client';

const client = new ApiClient(authToken);

// Campaign lifecycle
await client.createCampaign(data);
await client.activateCampaign(id);
await client.closeCampaign(id);
await client.publishCampaign(id);

// Distribution
await client.assignHcpsToCampaign(campaignId, hcpIds);
await client.sendInvitations(campaignId);
await client.sendReminders(campaignId);

// Survey taking (public)
await client.getSurveyByToken(token);
await client.submitSurvey(token, answers);

// Scores
await client.calculateAllScores(campaignId);
await client.getScores(campaignId);

// Exports
await client.exportResponses(campaignId);
await client.exportScores(campaignId);
await client.exportPayments(campaignId);

// Payments
await client.listPayments(campaignId);
await client.getPaymentStats(campaignId);
```

## Email Verification

To verify email delivery:

1. Assign `hcp2@bio-exec.com` to campaign
2. Send invitations
3. Check the bio-exec.com inbox for the email
4. Extract the survey link from the email

The test output will remind you to check the inbox:

```
📧 Check inbox for: hcp2@bio-exec.com
```

## Debugging

### Preserve Test Data

```bash
SKIP_CLEANUP=true pnpm test:api:aws:auth
```

The test output will show campaign IDs for inspection.

### Verbose Output

```bash
DEBUG=* pnpm test:api:aws:auth
```

### Run Single Test

```bash
npx vitest run api/full-workflow.test.ts --testNamePattern="Phase 1: Campaign Setup"
```

## CI/CD Integration

E2E tests are NOT run automatically in CI. They require:
- Live AWS deployment
- Test user credentials
- Real email verification (for invitation tests)

To run in CI, add secrets and a manual trigger:

```yaml
e2e:
  runs-on: ubuntu-latest
  if: github.event_name == 'workflow_dispatch'
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v3
    - run: pnpm install
    - run: |
        cd e2e
        E2E_TEST_PASSWORD="${{ secrets.E2E_TEST_PASSWORD }}" \
        pnpm test:api:aws:auth
```

## AWS URLs

- **API**: `https://ik6dmnn2ra.us-east-2.awsapprunner.com`
- **Web**: `https://y6empq5whm.us-east-2.awsapprunner.com`

## Troubleshooting

### "E2E_AUTH_TOKEN is required"

Use the auth runner:
```bash
E2E_TEST_PASSWORD="password" pnpm test:api:aws:auth
```

### "Campaign not found"

Run the seed script:
```bash
pnpm seed
```

### Cold Start Timeout

AWS App Runner may take up to 10 seconds on cold start. The health check has a 15-second timeout.

### Survey Submission Fails

Surveys require specific answer formats. Check the survey questions and ensure all required fields are answered correctly.

## File Structure

```
e2e/
├── api/                      # API tests
│   ├── auth.test.ts         # Auth tests
│   ├── campaigns.test.ts    # Campaign CRUD
│   ├── campaigns-workflow.test.ts
│   ├── full-workflow.test.ts # Complete workflow
│   ├── health.test.ts       # Health checks
│   └── login.test.ts        # Cognito login
├── web/                      # Playwright web tests
├── api-client.ts            # Typed API client
├── auth.ts                  # Cognito auth helper
├── config.ts                # Environment config
├── fixtures.ts              # Test data fixtures
├── run-with-auth.ts         # Auth test runner
├── seed-test-data.ts        # Create test data
├── cleanup-test-data.ts     # Remove test data
├── vitest.config.ts         # Vitest config
├── playwright.config.ts     # Playwright config
└── README.md                # This file
```

## What Gets Tested

### Health & Basic Tests (No Auth Required)
- ✅ API health endpoint responds
- ✅ API responds within acceptable time (10s for cold starts)
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
- ✅ Campaign lifecycle (DRAFT → ACTIVE → CLOSED → PUBLISHED)
- ✅ Send invitations and reminders
- ✅ Score calculation and publication
- ✅ Export responses, scores, payments
- ✅ Cleanup (delete test campaign)

### Catching Regressions

| Issue | How It's Caught |
|-------|-----------------|
| Broken API endpoints | Health tests fail |
| Auth issues | Auth validation tests fail |
| Campaign CRUD bugs | Workflow tests fail |
| HCP assignment bugs | Distribution tests fail |
| Schema/type changes | Validation tests fail |
| Score calculation bugs | Score phase tests fail |
| Export issues | Export tests fail |
| JS build errors | Web page load tests fail |

Run these tests **before deploying** and **after making changes** to catch issues early!
