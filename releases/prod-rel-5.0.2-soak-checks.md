# prod-rel-5.0.2 — Soak Checks (v1.19.3)

Tag at the merge commit on `main`. Hygiene continuation of 5.0.1 addressing the 2 post-soak tickets pteam raised on prod-rel-5.0.1. **No migrations** in this release. No product runtime path changed — e2e-only + one const-mirror sync.

---

## Phase A — Version deployed

### A1. Version returned by `/health`

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.19.3", ... }
```

If the version doesn't flip within ~5 min of merge, trigger a manual deploy per the `tdct` runbook.

There are **no migrations** to verify — skip the `_prisma_migrations` query.

---

## Phase B — Full-suite e2e self-heals seeded fixtures (Ticket 7)

The point of this ticket. Confirm the pretest hook chain now includes `seed`, so a full-suite run in isolation (post-cleanup) can bring itself up.

```bash
cd e2e

# 1. Force the exact failure condition from the 2026-07-25 repro:
#    nuke all seeded fixtures.
pnpm cleanup:all

# 2. Kick a full-suite run against prod aws:auth. Expected: pretest hook
#    fires prisma:generate + seed BEFORE the test runner starts.
pnpm test:all:aws:auth 2>&1 | head -60
```

**Expected in the output** (in order):
1. `> @kol360/e2e@0.0.1 pretest:all:aws:auth` line
2. `pnpm prisma:generate` invocation (5.0.1 T5 gate)
3. `pnpm seed` invocation (this release, T7 gate) — script prints its own `🧪 Seeding E2E test data...` header + per-fixture `✓` lines
4. Test runner starts

**Green gate:** the 45 tests that were previously failing on `Campaign_surveyTemplateId_fkey` / `AuditLog_userId_fkey` should pass. Full-workflow, users, questions, ucpm-backfill-deep, influencer-type-import, opt-outs, brand-grid-question-toggle, `/users/me`, access-control impersonation — all rely on the seeded fixtures the pretest hook now restores.

If the `pnpm seed` step is missing from the output: verify the deployed dev branch matches — the change is a one-line `&& pnpm seed` appended to every `pretest:*:auth` script in `e2e/package.json`.

---

## Phase C — Insights-report diagnostic surfaces the offending value on failure (Ticket 8)

Two success paths, either is acceptable.

```bash
cd e2e
pnpm --filter @kol360/e2e vitest run api/insights-report.test.ts 2>&1 | tail -40
```

**Path C1 (expected, green):** the `"labels every KOL with a valid influencer type"` test passes. The prod audit run at PR time showed all 11 distinct `HcpDiseaseArea.influencerType` values on prod are already in the 13-value `INFLUENCER_TYPES` const (DED Trace / Regional Leaders / Rising Stars / National Leaders / Industry / Glaucoma / Retina / Retired / Canada / Deceased / FDA). No 14th value found; test should be green.

**Path C2 (contingency, diagnostic):** if the test still fails, the new `.toContain()` shape will now surface the offending value in the vitest diff, e.g.:

```
AssertionError: expected [ 'National Leaders', 'Rising Stars', … ] to contain 'SomeNewValue'
```

That was the entire point of Part A of Ticket 8 — the pre-fix `.toBe(true)` shape stranded pteam on "expected false to be true." If Path C2 fires, hand the offending value back for a one-line `INFLUENCER_TYPES` extension in a follow-up release.

---

## Phase D — 24h light watch

Very low bar — no new endpoints, no new persisted state, no schema, no runtime path changed.

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for:
- Any unexpected error signature from the API or web health probes (none expected — nothing on the runtime path moved).

No customer-visible surface changed. Cognito posture unchanged from 5.0.1 (sweep complete, zero post-fix leakage).

---

## Rollback gate

Roll back if any of the following fail:

- **A1** — `/health` doesn't return 1.19.3 within the deployment window → App Runner issue; check CloudWatch + redeploy or revert the tag.
- **B (full-suite gate)** — the `pnpm seed` step does NOT appear in the pretest output → change didn't ship; verify `e2e/package.json` on the deployed branch has `&& pnpm seed` on every `pretest:*:auth` line.
- **C (diagnostic gate)** — insights-report test fails with the OLD `expected false to be true` message instead of a diff naming the offending value → assertion swap didn't ship; verify `e2e/api/insights-report.test.ts` uses `.toContain()`.

**Rollback shape:** revert the PR on `main` → App Runner auto-redeploys to v1.19.2. No schema to unwind, no infra state to unwind.

---

## See also

- Handoff: [`prod-rel-5.0.2-handoff.md`](prod-rel-5.0.2-handoff.md)
- Source ticket doc: [`docs/findings/prod-rel-5.0.1-post-soak-tickets-2026-07-25.md`](../docs/findings/prod-rel-5.0.1-post-soak-tickets-2026-07-25.md)
