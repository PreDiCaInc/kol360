# prod-rel-5.0.1 — Soak Checks (v1.19.2)

Tag at the merge commit on `main`. Hygiene bundle addressing the 5 post-soak tickets from prod-rel-5.0. **No migrations** in this release. No product runtime path changed except the Insights KOL Explorer influencer-type filter dropdown (gains 8 options; no other behavior change).

---

## Phase A — Version deployed

### A1. Version returned by `/health`

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.19.2", ... }
```

If the version doesn't flip within ~5 min of merge, trigger a manual deploy per the `tdct` runbook.

There are **no migrations** to verify — skip the `_prisma_migrations` query that Phase A on 5.0 ran.

---

## Phase B — Insights filter dropdown (Ticket 1, customer-visible)

The one customer-facing surface in this release. Confirm the 8 post-retag categories are now selectable.

1. Log in as PLATFORM_ADMIN or CLIENT_ADMIN → `/admin/dashboards/<da-id>` on a DA that has the retagged HCPs (Dry Eye is the reference — 2,261 HCPs across the new labels).
2. Open **KOL Explorer** tab → open the **Influencer Type** filter dropdown.
3. Confirm all 8 new options appear alongside the pre-retag values:
   - DED Trace
   - Industry
   - Glaucoma
   - Retina
   - Retired
   - Canada
   - Deceased
   - FDA
4. Pick any one (e.g. `Retired`) → Apply Filters → KOL Explorer returns a non-empty result set matching the retagged HCPs.
5. Reset the filter → full list restored.

If any of the 8 values is missing from the dropdown, the const extension didn't ship — check the deployed web version matches 1.19.2.

---

## Phase C — Targeted e2e rerun on `brand-grid-survey-submit` (Ticket 4)

This is the specific ticket that unblocks Phase B2 verification of the grid respondent submit path. Confirm the test now runs in isolation after any level of cleanup.

```bash
cd e2e

# 1. Full cleanup — deletes SurveyTemplate rows, per the original bug repro
pnpm cleanup:all

# 2. Run only the grid-submit spec (was 400ing on template lookup pre-fix)
pnpm --filter @kol360/e2e test:api:aws:auth -- brand-grid-survey-submit
```

**Expected:** all tests in `brand-grid-survey-submit.test.ts` pass green. `beforeAll` should no longer 400 on `createTestCampaign()` — it now uses `createCampaign()` without `surveyTemplateId`, so the template row's absence is a non-event.

If the test still 400s in `beforeAll`: verify the file on the deployed branch does NOT contain a call to `createTestCampaign()` (should be `createCampaign()` with no surveyTemplateId arg).

---

## Phase D — Cleanup logs honest failures (Ticket 3)

Confirm the FK-order fix + honest success-message fix landed together.

```bash
cd e2e
pnpm cleanup:all
```

**Expected:**
- No `Foreign key constraint violated on the fields: (CampaignHcp_hcpId_fkey)` traceback mid-run.
- Trailing summary line reflects true state — a `✗ Failed:` line appears if anything actually failed (matching the campaign-cleanup style), and the terminal `✅` only appears when the run was fully clean.

To smoke the honest-failure path (optional): temporarily invalidate one of the delete calls (e.g. wrong table name) and re-run — expect a `✗ Failed:` line surfacing that failure instead of a green "successfully".

---

## Phase E — `prisma:generate` pretest hooks (Ticket 5)

Confirm the e2e scripts regenerate the Prisma client automatically before tests run.

```bash
cd e2e
pnpm test:api:aws:auth 2>&1 | head -30
```

**Expected:** a `prisma generate` (or `pretest:api:aws:auth`) line appears in the output before the test runner starts. On a schema-changing release, the client is regenerated with fresh types so `Unknown argument …` errors don't surface from a stale pnpm cache.

Repeat the smoke against `test:workflow:test` — same pre-hook should fire.

---

## Phase F — 24h watch

Light — no new endpoints, no new persisted state, no schema.

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for:
- Any 4xx / 5xx surge on `/api/v1/insights/:daId/kol-explorer` (the endpoint the filter dropdown feeds). Ticket 1 is purely additive to the accepted-values list, so no new class of validation error is expected — surface any anomaly for review.
- Any unexpected regression flagged by the API/web health probes.

Cognito Ops sweep is complete pre-release; no ongoing watch item there. If Cognito `e2e-*` accumulation re-emerges above the manual-sweep baseline on a future soak, reopen Ticket 6 option (c).

---

## Rollback gate

Roll back if any of the following fail:

- **A1** — `/health` doesn't return 1.19.2 within the deployment window → App Runner issue; check CloudWatch + redeploy or revert the tag.
- **B (dropdown)** — any of the 8 new influencer-type options is missing → const extension didn't ship; verify web deploy version matches 1.19.2.
- **C (targeted rerun)** — `brand-grid-survey-submit` still 400s in `beforeAll` after `cleanup:all` → fix didn't ship; verify the file on the deployed branch matches dev.

**Rollback shape:** revert the PR on `main` → App Runner auto-redeploys to v1.19.1. No schema to unwind, no Cognito state to unwind (the sweep is complete and deleted users had no active sessions).

---

## See also

- Handoff: [`prod-rel-5.0.1-handoff.md`](prod-rel-5.0.1-handoff.md)
- Source ticket doc: [`docs/findings/prod-rel-5.0-post-soak-tickets-2026-07-22.md`](../docs/findings/prod-rel-5.0-post-soak-tickets-2026-07-22.md)
