# prod-rel-5.1.2 — Soak Checks (v2.1.2)

Audit-write-path patch. Cosmetic-if-partial: the only user-visible surface that would show trouble here is the `AuditLog` row shape on the next bulk-import batch, which is a diagnostic surface (not a customer-runtime path). No rollback gate unless deploy itself fails.

---

## Phase A — Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: {"status":"ok","version":"2.1.2", ... }
```

App Runner auto-deploys from `main`. If `/health` still shows 2.1.1 after ~10 min, trigger a manual deploy per the standard runbook.

---

## Phase B — Live audit-write assertion on test env (small CSV import)

Small, self-contained probe against test env's `/hcps/import` (the primary fixed path):

```bash
# 1. Get a fresh auth token for the E2E test user (or reuse from CI).
# 2. Upload a 2-row CSV that updates 2 known-existing HCPs.

# Example CSV (pick two NPIs known to exist on test env — the E2E
# fixture HCPs work fine; see e2e/fixtures.ts:TEST_IDS.HCP_1/HCP_2).

cat >/tmp/v2.1.2-soak.csv <<'EOF'
NPI,First Name,Last Name,Email,Specialty,City,State
1111111111,Alice,SoakTest,alice.soak@example.com,Optometry,Boston,MA
2222222222,Bob,SoakTest,bob.soak@example.com,Ophthalmology,Miami,FL
EOF

# Upload:
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/v2.1.2-soak.csv" \
  https://mpcu4inmtj.us-east-2.awsapprunner.com/api/v1/hcps/import

# Response: { "batchId": "cm...", "created": 0, "updated": 2, ... }
# Note the batchId.
```

Then, via SSH tunnel (`scripts/tunnel-up.sh test`) and `psql`:

```sql
SELECT id, entity_id, "oldValues", "newValues"
FROM "AuditLog"
WHERE action = 'hcp.updated'
  AND ("newValues"->>'batchId') = '<batchId from response>'
ORDER BY "createdAt" DESC;
```

**Expected on every row:**
- `oldValues` is **NOT NULL** — must contain at least `firstName`, `lastName`, `email`, `specialty`, `city`, `state` (the fix populates the full 13-field pick per `UPDATABLE_HCP_AUDIT_FIELDS`).
- `newValues` still carries `{source: 'bulk_import', batchId, fileName}` — the metadata shape is unchanged.

**Fail signal:** if `oldValues` is NULL on any row of the batch, the fix did not deploy — check `/health` version and CloudWatch logs, and consider rollback.

---

## Phase C — Broader SQL check over any post-deploy bulk-import activity

After 6–24h of natural test-env activity (any admin who runs `pnpm test:workflow:test`, or any biz-team CSV upload to test env), run:

```sql
-- All hcp.updated rows from bulk_import that landed AFTER the v2.1.2 deploy.
SELECT
  COUNT(*)                                    AS total_rows,
  COUNT(*) FILTER (WHERE "oldValues" IS NULL) AS still_null_rows
FROM "AuditLog"
WHERE action = 'hcp.updated'
  AND ("newValues"->>'source') = 'bulk_import'
  AND "createdAt" > '2026-08-05 00:00:00'::timestamp;
```

**Expected:** `still_null_rows = 0` — every post-deploy `hcp.updated` row from bulk-import now carries `oldValues`.

If any row is NULL post-deploy: check whether that row came in through a path this PR didn't cover (unlikely — the two identified paths are covered). Confirm the deploy went out and the running service is on 2.1.2.

Also check the campaign-scoped path (already worked pre-v2.1.2 but the shared-const refactor could have regressed):

```sql
SELECT COUNT(*)
FROM "AuditLog"
WHERE action = 'hcp.updated'
  AND ("newValues"->>'_source') = 'campaign-import'
  AND "createdAt" > '2026-08-05 00:00:00'::timestamp
  AND "oldValues" IS NULL;
-- Expected: 0
```

---

## Phase D — 24h light watch on CloudWatch

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"?hcp?" ?error ?exception' \
  --query 'events[*].message' --output text | head -20
```

Focus on:
- `hcp.service.ts` errors (the primary modified file).
- `distribution.service.ts` errors on `importHcpsFromFile` (the refactored file).
- `routes/hcps.ts` PUT-handler errors (the admin-edit refactor).

**Expected:** no new error patterns compared to v2.1.1 baseline. The change is additive to the audit-write; nothing else moved.

If any HCP CSV import fails post-deploy with a Prisma type error mentioning `oldValues` or `select`, the change didn't deploy cleanly — check the pre-update `select` expansion in `hcp.service.ts:importFromFile` around the `existingHcps` findMany.

---

## Rollback gate

Roll back only if:

- **A** — `/health` doesn't return 2.1.2 within the deploy window.
- **B** — the live probe shows `oldValues` still NULL on the new batch (fix didn't take).
- **D** — CloudWatch shows a new error class on the modified files that wasn't in v2.1.1.

Phase C over the 6–24h window is diagnostic — a single NULL row from an unknown path is a "figure out where it came from" signal, not automatically a rollback trigger (this PR doesn't touch the pre-existing NULL rows; only future rows on the two identified paths).

**Rollback shape:** revert PR — no schema to unwind, no data migration to undo. Historical NULL-oldValues rows stay NULL either way (the PR never claimed to backfill them). Post-rollback, new bulk-import rows go back to NULL-oldValues; existing v2.1.2-emitted rows with populated oldValues are harmless (richer diagnostic data on a subset of rows).

---

## See also

- Handoff: [`prod-rel-5.1.2-handoff.md`](prod-rel-5.1.2-handoff.md)
- Source finding: [`docs/findings/bulk-import-no-oldvalues-blocks-surgical-revert-2026-08-05.md`](../docs/findings/bulk-import-no-oldvalues-blocks-surgical-revert-2026-08-05.md)
