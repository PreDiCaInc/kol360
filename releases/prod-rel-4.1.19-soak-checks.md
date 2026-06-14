# prod-rel-4.1.19 — Soak Checks (v1.17.39)

Tag at the merge commit on `main`. Hotfix roll-forward on top of `prod-rel-4.1.18`. **No migrations.** Supersedes 4.1.18 for pteam sync.

## What 4.1.19 changed

Single fix: `POST /hcps/import` was 400ing on every upload under 4.1.18 because the per-row audit `auditLog.createMany` passed the Cognito sub as `userId` (FK→User.id). Now resolved via the new `resolveUserIdForAudit()` helper in `apps/api/src/lib/audit.ts`.

The 4.1.18 soak items still apply for the 4 incident-ticket features (HCP audit foundation, placeholder gate, SES delivery events, survey-email mismatch surface) — see [`prod-rel-4.1.18-soak-checks.md`](prod-rel-4.1.18-soak-checks.md). 4.1.19 only flips the broken HCP import path back to green.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.39", ... }
```

Web — open `https://kol360.bio-exec.com`, footer / admin header should report `1.17.39`.

### A2. HCP CSV import returns 200

Upload a tiny CSV (1 row) via the HCP admin page → expected `200 OK` with `batchId` in the response.

Or via curl:
```bash
TOK=<auth-token>
NPI=9912345678  # any free NPI
cat > /tmp/test.csv <<CSV
NPI,First Name,Last Name,Email,Specialty,City,State
${NPI},Smoke,Test,smoke@e2e.example.com,Optometry,LEXINGTON,KY
CSV
curl -sS -X POST https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/hcps/import \
  -H "Authorization: Bearer $TOK" \
  -F "file=@/tmp/test.csv"
# Expected: { "total": 1, "created": 1, ..., "batchId": "cm..." }
# Pre-4.1.19: returned 400 with "Foreign key constraint violated: AuditLog_userId_fkey"
```

### A3. Per-row audit rows land for the import

```sql
-- Replace <user-id> with the actor's User.id (NOT cognitoSub)
SELECT action, "entityId", "newValues"->>'batchId' AS batch, "createdAt"
FROM "AuditLog"
WHERE "userId" = '<user-id>'
  AND "createdAt" > NOW() - INTERVAL '5 minutes'
  AND action IN ('hcp.created', 'hcp.updated', 'hcp.bulk_import')
ORDER BY "createdAt" DESC;
-- Expected: one hcp.bulk_import summary row + one hcp.created per CSV row.
-- All rows reference the same batchId.
```

### A4. e2e regression suite passes

```bash
cd e2e && pnpm test:api:test:auth
# Expected: hcp-audit-trail.test.ts — 4/4 passing
# Pre-4.1.19: 2/4 failed (bulk import + email-changed both 400'd).
```

---

## Phase B — Re-run 4.1.18 soak items

All Phase B checks from [`prod-rel-4.1.18-soak-checks.md`](prod-rel-4.1.18-soak-checks.md) (B1–B9) still apply — the 4 incident-ticket features ship unchanged in 4.1.19. Run them per the 4.1.18 doc.

---

## Rollback gate

If A1–A4 don't all pass within 30 min of deploy, redeploy `prod-rel-4.1.17` (NOT 4.1.18 — it has the broken import). Effects per the 4.1.18 handoff rollback section.
