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

### Client Repo Deployment Workflow
When pushing to the client repo (Bio-Exec):
1. Create/use the `bioexec/` folder in the project root
2. Copy only the necessary files to `bioexec/` (excludes CLAUDE.md, dev configs, etc.)
3. The `bioexec/` folder has its own `.gitignore` with additional exclusions
4. Push from the `bioexec/` folder to avoid contaminating the dev environment
5. This keeps dev files (like CLAUDE.md) separate from client deliverables

## Git Commit Guidelines

- **Do NOT include** the "🤖 Generated with [Claude Code]" line in commit messages
- **Do NOT include** the "Co-Authored-By: Claude" line in commit messages
- Keep commit messages concise and descriptive of the actual changes
