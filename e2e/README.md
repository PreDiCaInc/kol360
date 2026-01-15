# E2E Tests

End-to-end tests for KOL360 that can run against local or AWS deployments.

## Setup

```bash
cd e2e
pnpm install

# Install Playwright browsers (first time only)
pnpm exec playwright install chromium
```

## Running Tests

### Against Local Deployment

Start local services first:
```bash
# Terminal 1: Start API (port 3001)
pnpm --filter @kol360/api dev

# Terminal 2: Start Web (port 3000)
pnpm --filter @kol360/web dev
```

Then run tests:
```bash
# API tests only
pnpm test:api:local

# Web tests only
pnpm test:web:local

# All tests
pnpm test:all:local
```

### Against AWS Deployment

```bash
# API tests
pnpm test:api:aws

# Web tests
pnpm test:web:aws

# All tests
pnpm test:all:aws
```

### With Authentication

For authenticated endpoint tests, set environment variables:

```bash
# Get a valid JWT token from browser dev tools or Cognito
export E2E_AUTH_TOKEN="your-jwt-token"

# Then run tests
pnpm test:api:aws
```

## Test Structure

```
e2e/
├── api/                    # API endpoint tests
│   ├── health.test.ts      # Health check tests
│   ├── auth.test.ts        # Authentication tests
│   └── campaigns.test.ts   # Campaign API tests
├── web/                    # Web UI tests (Playwright)
│   ├── app.spec.ts         # App loading & performance
│   └── navigation.spec.ts  # Route navigation tests
├── config.ts               # Environment configuration
├── vitest.config.ts        # Vitest config for API tests
└── playwright.config.ts    # Playwright config for web tests
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
