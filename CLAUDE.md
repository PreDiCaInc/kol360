# Claude Code Instructions for KOL360

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

3. **Web** (port 3000): `pnpm --filter @kol360/web dev`

4. **Prisma Studio** (port 5555): `pnpm --filter @kol360/api prisma studio`

## AWS Deployment

- **Lambda API**: Profile `koluser`, Region `us-east-2`, Function `kol360-api`
- **Web**: App Runner (auto-deploy from main)

## Key Files

- Database schema: `apps/api/prisma/schema.prisma`
- API routes: `apps/api/src/routes/`
- Web pages: `apps/web/src/app/`
- Shared types: `packages/shared/src/`

## Git Remotes & Push Strategy

This repository has two remotes:
- **origin** (PreDiCa): `git@github.com:PreDiCaInc/kol360.git` - Primary development repo
- **bioexec** (Client): `git@github.com:Bio-Exec/kol360.git` - Client's forked repo

### Push Rules
1. **Regular pushes go to `origin` (PreDiCa)**: `git push origin HEAD`
2. **Only push to `bioexec` (client) when explicitly instructed**
3. Never push directly to `bioexec` without explicit approval

### REQUIRED: Build Verification Before Any Push
**NEVER push code to either PreDiCa or Bio-Exec without verifying the build passes first.**

Before pushing to ANY repo, run:
```bash
# Verify API builds without TypeScript errors
pnpm --filter @kol360/api build

# Verify Web builds without TypeScript errors
pnpm --filter @kol360/web build
```

If either build fails, fix the errors before pushing. This prevents deployment failures on App Runner.

### Client Repo Deployment Workflow
When pushing to the client repo (Bio-Exec):

1. The `bioexec/` folder contains a separate git clone of Bio-Exec/kol360
2. Sync files from main dev folder to bioexec using rsync (excludes dev-only files)
3. Create a feature branch, commit, and push to create a PR for review
4. This keeps dev files (like CLAUDE.md) separate from client deliverables

**Rsync command to sync files to bioexec:**
```bash
cd /Users/haranath/genai/kol360
rsync -av \
  --exclude='CLAUDE.md' \
  --exclude='.claude/' \
  --exclude='bioexec/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='dist/' \
  --exclude='.turbo/' \
  --exclude='.git/' \
  --exclude='.env*' \
  --exclude='*.pem' \
  --exclude='tmp/' \
  --exclude='func-spec/' \
  --exclude='tech-spec/' \
  --exclude='*.zip' \
  --exclude='func_spec-KOL_Platform_vF.md' \
  --exclude='DEPLOYMENT.md' \
  --exclude='apps/api/dist-lambda/' \
  --exclude='apps/api/lambda-bundle/' \
  --exclude='apps/web/out/' \
  --exclude='.DS_Store' \
  . /Users/haranath/genai/kol360/bioexec/
```

**After syncing, in bioexec folder:**
```bash
cd /Users/haranath/genai/kol360/bioexec
git checkout -b feature/your-feature-name
git add .
git commit -m "Your commit message"
git push -u origin feature/your-feature-name
# Then create PR on GitHub
```

## Git Commit Guidelines

- **Do NOT include** the "🤖 Generated with [Claude Code]" line in commit messages
- **Do NOT include** the "Co-Authored-By: Claude" line in commit messages
- Keep commit messages concise and descriptive of the actual changes
