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
