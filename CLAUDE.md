# Claude Code Instructions for KOL360

## Standard Operating Procedure (SOP) - IMPORTANT

**Single repo workflow - PreDiCa/kol360 only.**

**Branches:**
- `dev` - Local development and testing
- `main` - AWS App Runner auto-deploys from this branch

**Workflow:**
```bash
# 1. Work on dev branch
git checkout dev
# ... make changes ...

# 2. Commit and push to dev
git add . && git commit -m "Your message"
git push origin dev

# 3. When ready to deploy to AWS, create a PR (do NOT merge locally)
gh pr create --base main --head dev --title "Your PR title" --body "Description"
# Then merge the PR on GitHub (or use: gh pr merge --merge)
# App Runner will auto-deploy both web and api services
```

**Do NOT:**
- Make changes directly on main branch
- Merge dev to main locally (always use a PR)

## Before Starting Any Work

Always verify these are running:

```bash
# Check all services
lsof -i :3000 -i :3001 -i :5555
```

If not running, start them:

1. **SSH Tunnel** (database):
   ```bash
   ssh -i /Users/haranath/genai/kol360/kol360-bastion-key.pem \
       -L 5432:kol360-db.czkyi4mem2bj.us-east-2.rds.amazonaws.com:5432 \
       ec2-user@3.142.171.8 -N -o StrictHostKeyChecking=no -f
   ```

2. **API** (port 3001): `pnpm --filter @kol360/api dev`

3. **Web** (port 3000):
   ```bash
   # Always clear cache before starting to avoid ChunkLoadError
   rm -rf apps/web/.next && pnpm --filter @kol360/web dev
   ```

4. **Prisma Studio** (port 5555): `pnpm --filter @kol360/api prisma studio`

## AWS Deployment

**AWS Profile:** `koluser`, **Region:** `us-east-2`

### Source Repositories
- **PreDiCaInc/kol360** (`git@github.com:PreDiCaInc/kol360.git`) - Primary development repo
- **Bio-Exec/kol360** (`git@github.com:Bio-Exec/kol360.git`) - Production deployment repo (synced from PreDiCaInc)

### Shared Resources
- **Cognito User Pool:** `us-east-2_63CJVTAV9`
- **Cognito Client ID:** `7tqkritsrh3dgmaj6oq8va46vj`
- **Cognito Region:** `us-east-2`
- **VPC Connector:** `arn:aws:apprunner:us-east-2:163859990568:vpcconnector/vpc-apprunner-to-rds/1/63018110ba474556b6e2771b3389858e`
- **GitHub Connection (PreDiCa):** `arn:aws:apprunner:us-east-2:163859990568:connection/kol360-predica-git/dfb3ee8f8b904c6da095d42218e43324`
- **GitHub Connection (Bio-Exec):** `arn:aws:apprunner:us-east-2:163859990568:connection/kol360-bioexec-git/f91ffb40b3aa45fda3bbee96f42dd81a`

### Production Environment
**Source:** Bio-Exec/kol360 main branch

**App Runner Services:**
- **kol360-api**
  - Service ARN: `arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd`
  - URL: `https://ik6dmnn2ra.us-east-2.awsapprunner.com`
- **kol360-web**
  - Service ARN: `arn:aws:apprunner:us-east-2:163859990568:service/kol360-web/9fe5595685ad4ab89cdb29333ab1f5f6`
  - URL: `https://y6empq5whm.us-east-2.awsapprunner.com`
  - Custom domain: `kol360.bio-exec.com` (active)

**Production Database (kol360-db-prod):**
- Endpoint: `kol360-db-prod.czkyi4mem2bj.us-east-2.rds.amazonaws.com`
- Port: `5432`
- Database: `kol360`
- Username: `kol360admin`
- Password: `RDS4Bioexec2025`
- DATABASE_URL: `postgresql://kol360admin:RDS4Bioexec2025@kol360-db-prod.czkyi4mem2bj.us-east-2.rds.amazonaws.com:5432/kol360`
- Engine: PostgreSQL 16.6
- Security Group: `sg-0b0360bc7e93707ff`

### Test Environment
**Source:** PreDiCaInc/kol360 main branch

**App Runner Services:**
- **kol360-api-test**
  - Service ARN: `arn:aws:apprunner:us-east-2:163859990568:service/kol360-api-test/bcc7d66db0844252adfc0284464719ea`
  - URL: `https://mpcu4inmtj.us-east-2.awsapprunner.com`
  - NODE_ENV: `staging`
- **kol360-web-test**
  - Service ARN: `arn:aws:apprunner:us-east-2:163859990568:service/kol360-web-test/3d324e4a9fd4404393b10d88e655a337`
  - URL: `https://nba3pdn2jm.us-east-2.awsapprunner.com`
  - Custom domain: `koltest.bio-exec.com` (active)

**Test Database (kol360-db - existing with test data):**
- Endpoint: `kol360-db.czkyi4mem2bj.us-east-2.rds.amazonaws.com`
- Port: `5432`
- Database: `kol360`
- Username: `kol360admin`
- Password: `RDS4Bioexec!`

### App Runner Notes
- **Runtime:** Must use `NODEJS_22` (NODEJS_18 reached end of support in App Runner)
- **Auto-deploy:** Both test services auto-deploy from PreDiCaInc/kol360 main branch
- **VPC Egress:** Both API services use VPC Connector for RDS access

## Key Files

- Database schema: `apps/api/prisma/schema.prisma`
- API routes: `apps/api/src/routes/`
- Web pages: `apps/web/src/app/`
- Shared types: `packages/shared/src/`

## Git Commit Guidelines

- **Do NOT include** the "🤖 Generated with [Claude Code]" line in commit messages
- **Do NOT include** the "Co-Authored-By: Claude" line in commit messages
- Keep commit messages concise and descriptive of the actual changes

## Change Management Process (CRITICAL)

### Before Making ANY Changes
1. Run `git status` to see current state
2. Run `git diff` to review any uncommitted changes
3. If there are uncommitted changes, decide: commit them first or stash them

### Database Schema Changes (Prisma)
Database changes require coordinated updates across multiple files. **NEVER** change just one without the others:

1. **schema.prisma** - The Prisma schema definition
2. **Shared schemas** - Zod schemas in `packages/shared/src/schemas/`
3. **Service files** - Any services using the changed models
4. **API routes** - Routes that use the changed data

**Process for DB changes:**
```bash
# 1. Update schema.prisma with new columns/enums/models
# 2. Generate Prisma client to verify
cd apps/api && npx prisma generate

# 3. Update shared Zod schemas to match
# 4. Update any service files using the models
# 5. Build to verify no type errors
pnpm --filter @kol360/api build

# 6. If schema changes actual DB structure, create migration
npx prisma migrate dev --name descriptive_name

# 7. Commit ALL related files together
git add apps/api/prisma/schema.prisma packages/shared/src/schemas/*.ts apps/api/src/services/*.ts
git commit -m "Add new field X - schema, types, and services"
```

### Before Creating a PR
**ALWAYS run this checklist:**
```bash
# 1. Check ALL modified files (not just staged)
git status

# 2. Review what's being committed
git diff --cached

# 3. Review what's NOT being committed (might be forgotten)
git diff

# 4. Build both packages to catch type errors
pnpm --filter @kol360/shared build
pnpm --filter @kol360/api build
pnpm --filter @kol360/web build

# 5. Only after all builds pass, push and create PR
```

### After PR is Merged
1. Check App Runner deployment status
2. If deployment fails, check CloudWatch logs:
   ```bash
   aws logs filter-log-events \
     --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
     --start-time $(( $(date +%s) - 600 ))000 \
     --region us-east-2 --profile koluser \
     --query 'events[*].message' --output text | tail -50
   ```

### Common Mistakes to Avoid
- ❌ Changing database via direct SQL without updating schema.prisma
- ❌ Updating schema.prisma without updating shared Zod schemas
- ❌ Committing only some files from a related set of changes
- ❌ Creating PR without running builds locally first
- ❌ Assuming changes from previous sessions are committed

### Session Start Checklist
At the START of every session, Claude should:
```bash
# 1. Check for uncommitted changes from previous sessions
git status

# 2. If there are uncommitted changes, LIST them and ASK:
#    "I found uncommitted changes to X, Y, Z. Should I:
#     a) Commit these changes first
#     b) Stash them for later
#     c) Discard them"

# 3. Never proceed with new work until previous changes are addressed
```

### Session End Checklist
Before ending a session or switching tasks:
```bash
# 1. Check what's been modified
git status

# 2. Commit all completed work
git add <relevant-files>
git commit -m "Description of changes"

# 3. Push to remote
git push origin dev

# 4. If work is incomplete, document what's left in a comment or TODO
```

## E2E Testing

### Test User Credentials
- **Email:** `e2e.testuser@bio-exec.com`
- **Password:** `E2eTest@2024Secure!`
- **Cognito Sub:** `d11b2570-8051-7098-327c-3d660a97d7a0`
- **User ID:** `cme2e0test0user000001`
- **Role:** `platform-admins` (full access)

### Test Data IDs (CUID format)
- **Client:** `cme2e0test0client00001` (E2E Test Pharma)
- **Disease Area:** `cme2e0test0disease0001` (E2E Test Oncology)
- **Specialty:** `cme2e0test0special0001`
- **HCP 1:** `cme2e0test0hcp0000001` (alice.test@e2etest.example.com)
- **HCP 2:** `cme2e0test0hcp0000002` (hcp2@bio-exec.com - real inbox)
- **HCP 3:** `cme2e0test0hcp0000003` (carol.test@e2etest.example.com)

### Running E2E Tests

**Quick Start (single command):**
```bash
# Against TEST environment
cd e2e && source .env && E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" pnpm test:workflow:test

# Against PROD environment
cd e2e && source .env && E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" pnpm test:workflow:prod
```

**With SKIP_CLEANUP (preserve test data for inspection):**
```bash
cd e2e && source .env && SKIP_CLEANUP=true E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" pnpm test:workflow:test
```

**Available Scripts:**
| Command | Description |
|---------|-------------|
| `pnpm test:api:test:auth` | Run API tests against TEST env with auth |
| `pnpm test:api:prod:auth` | Run API tests against PROD env with auth |
| `pnpm test:workflow:test` | Run full workflow against TEST env |
| `pnpm test:workflow:prod` | Run full workflow against PROD env |
| `pnpm seed` | Seed test data (client, HCPs, user) |
| `pnpm cleanup` | Remove test campaigns only |
| `pnpm cleanup:all` | Remove ALL test data |

### Full Workflow Test Phases
The `full-workflow.test.ts` covers 11 phases:
1. Campaign Setup - Create campaign with test client
2. HCP Assignment - Assign HCPs including real email (hcp2@bio-exec.com)
3. Campaign Activation - DRAFT → ACTIVE
4. Invitation Flow - Send email invitations
5. Survey Completion - Simulate survey responses
6. Score Calculation - Calculate survey and composite scores
7. Nomination Processing - Match nominations to HCPs
8. Campaign Close - ACTIVE → CLOSED
9. Score Publication - CLOSED → PUBLISHED
10. Payment Processing - Verify payment records
11. Reporting - Export responses, scores, payments

### Test Data Lifecycle
```bash
# 1. Seed test data (first time or after cleanup:all)
pnpm e2e:seed

# 2. Run tests (creates campaigns, then cleans them up)
cd e2e && source .env && E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" pnpm test:workflow:test

# 3. If SKIP_CLEANUP was used, manually cleanup after inspection
pnpm e2e:cleanup      # Remove test campaigns only
pnpm e2e:cleanup:all  # Remove ALL test data (requires re-seed)
```

### Ensuring Test User Exists in Database
The test user must exist in both Cognito AND the database. If `/users/me` returns 404:
```sql
-- Check if user exists
SELECT id, email, "cognitoSub" FROM "User" WHERE email = 'e2e.testuser@bio-exec.com';

-- Insert if missing (run via Prisma Studio or psql)
INSERT INTO "User" (id, "cognitoSub", email, "firstName", "lastName", role, status, "clientId")
VALUES (
  'cme2e0test0user000001',
  'd11b2570-8051-7098-327c-3d660a97d7a0',
  'e2e.testuser@bio-exec.com',
  'E2E',
  'TestUser',
  'PLATFORM_ADMIN',
  'ACTIVE',
  'cme2e0test0client00001'
);
```

### Branch Cleanup
Keep only essential branches. Periodically clean up orphaned feature branches:
```bash
# List all branches
git branch -a

# Delete merged remote branches
git push origin --delete branch-name

# Delete local branches
git branch -D branch-name

# Prune remote tracking branches
git remote prune origin
```

## Custom Commands

### `ucpm` - Update, Commit, Push, Merge

When the user says "ucpm", follow this complete enhancement workflow. This ensures all changes are properly synchronized across database, code, tests, and deployment.

**Full Checklist:**

```bash
# 1. DATABASE & PRISMA CHANGES (CRITICAL!)
# If schema.prisma was modified:
cd apps/api

# Step 1a: Check for schema drift (compare schema.prisma vs actual DB)
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code || echo "Schema has pending changes!"

# Step 1b: Create migration if needed
npx prisma migrate dev --name descriptive_name  # Creates migration + applies to local/test DB

# Step 1c: Verify migration file was created
ls -la prisma/migrations/                       # Should see new migration folder

# Step 1d: Generate client
npx prisma generate

# 2. UPDATE E2E TEST INFRASTRUCTURE
# Update these files if the change affects test data:
# - e2e/fixtures.ts        (add new test IDs if needed)
# - e2e/seed-test-data.ts  (seed any new required data)
# - e2e/cleanup-test-data.ts (cleanup new test data)
# - e2e/api-client.ts      (add API methods for new endpoints)
# - e2e/*.test.ts          (add/update test cases)

# 3. VERIFY ALL BUILDS PASS
pnpm --filter @kol360/shared build
pnpm --filter @kol360/api build
pnpm --filter @kol360/web build

# 4. RUN E2E TESTS (against TEST environment)
cd e2e && source .env && E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" pnpm test:workflow:test

# 5. VERSION BUMP (ALWAYS - required for deployment verification)
# Bump PATCH version in all 3 package.json files:
# - apps/api/package.json
# - apps/web/package.json
# - packages/shared/package.json
# Format: MAJOR.MINOR.PATCH (e.g., 1.5.0 -> 1.5.1 for patches, 1.5.0 -> 1.6.0 for features)
# The API /health endpoint returns the version - used to verify deployments

# 6. COMMIT & PUSH
git add .
git status                             # Review - MUST include migration files!
git commit -m "Descriptive message"
git push origin dev

# 7. CREATE PR & WAIT FOR CI
gh pr create --base main --head dev --title "PR Title" --body "Description"
gh pr checks --watch                   # Wait for CI to pass
gh pr merge --merge                    # Only after CI passes

# 8. APPLY MIGRATIONS TO PROD (if schema changed!)
# After PR is merged and before running prod tests:
ssh -i kol360-bastion-key.pem -L 5433:kol360-db-prod.czkyi4mem2bj.us-east-2.rds.amazonaws.com:5432 ec2-user@3.142.171.8 -N -f
cd apps/api
DATABASE_URL="postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360" npx prisma migrate deploy

# 9. VERIFY DEPLOYMENT (check version matches what was just committed)
curl -s https://mpcu4inmtj.us-east-2.awsapprunner.com/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Deployed: {d[\"version\"]}')"
# If version doesn't match, trigger manual deploy:
# aws apprunner start-deployment --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api-test/bcc7d66db0844252adfc0284464719ea" --region us-east-2 --profile koluser
# aws apprunner start-deployment --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-web-test/3d324e4a9fd4404393b10d88e655a337" --region us-east-2 --profile koluser
```

**Database Migration Rules (IMPORTANT!):**
- NEVER modify schema.prisma without creating a migration
- ALWAYS verify migration files are included in commits
- ALWAYS apply migrations to PROD after merging to main
- App Runner does NOT auto-run migrations - they must be run manually

**Quick Reference:**
| Step | Action | Verify |
|------|--------|--------|
| 1 | Update schema.prisma | Migration file created |
| 2 | Create migration | `prisma migrate dev` succeeds |
| 3 | Update Zod schemas | Types match Prisma models |
| 4 | Update services/routes | No type errors |
| 5 | Update E2E fixtures | New IDs added |
| 6 | Update seed script | Seeds new data correctly |
| 7 | Update cleanup script | Removes new test data |
| 8 | Update test cases | Tests cover new functionality |
| 9 | Build all packages | All builds pass |
| 10 | Run E2E tests | All tests pass |
| 11 | **Bump version** | All 3 package.json files updated |
| 12 | Commit & push | Migration files + version bump included! |
| 13 | Create PR | PR created |
| 14 | **Wait for CI checks** | `gh pr checks --watch` shows all passed |
| 15 | Merge PR | PR merged to main |
| 16 | **Apply migrations to PROD** | `prisma migrate deploy` on prod DB |
| 17 | Verify deployment | `curl /health` shows new version |
