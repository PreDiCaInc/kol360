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
- Use the bioexec folder (deprecated)
- Use rsync (deprecated)
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

**App Runner Services (auto-deploy from PreDiCa/kol360 main):**
- **kol360-api**
  - Service ARN: `arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd`
  - URL: `https://ik6dmnn2ra.us-east-2.awsapprunner.com`
  - GitHub Connection: `kol360-predica-git`
- **kol360-web**
  - Service ARN: `arn:aws:apprunner:us-east-2:163859990568:service/kol360-web/9fe5595685ad4ab89cdb29333ab1f5f6`
  - URL: `https://y6empq5whm.us-east-2.awsapprunner.com`
  - GitHub Connection: `kol360-predica-git`

**Database:** RDS PostgreSQL via SSH tunnel through bastion (3.142.171.8)

**Cognito:**
- User Pool ID: `us-east-2_63CJVTAV9`
- Client ID: `7tqkritsrh3dgmaj6oq8va46vj`
- Region: `us-east-2`

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
