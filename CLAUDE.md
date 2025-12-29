# Claude Code Instructions for KOL360

## Standard Operating Procedure (SOP) - IMPORTANT

**Always work on the `dev` branch in the main kol360 folder.**

When pushing changes:
1. **Push to PreDiCa/kol360 main**: Commit and push from the dev branch to origin/main
2. **Push to Bio-Exec/kol360**: Use rsync to copy to bioexec folder, then commit and push to bioexec/main

**Never make changes directly in:**
- The bioexec folder (only rsync from main dev folder)
- Feature branches (unless explicitly decided for a specific situation)
- Any other location

**Workflow:**
```bash
# 1. Work on dev branch in main folder
git checkout dev
# ... make changes ...

# 2. Commit and push to PreDiCa
git add . && git commit -m "Your message"
git push origin dev  # or merge to main

# 3. Rsync to bioexec and push
rsync -av --delete [excludes] . /Users/haranath/genai/kol360/bioexec/
cd /Users/haranath/genai/kol360/bioexec
git add . && git commit -m "Your message"
git push origin main
```

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

## Git Commit Guidelines

- **Do NOT include** the "🤖 Generated with [Claude Code]" line in commit messages
- **Do NOT include** the "Co-Authored-By: Claude" line in commit messages
- Keep commit messages concise and descriptive of the actual changes
