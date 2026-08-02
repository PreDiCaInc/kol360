# prod-rel-5.0.5 — Soak Checks (v2.0.5)

Tag at the merge commit on `main`. Three pteam-filed fixes bundled:
xlsx-hyperlink row-drop (P2), Bio-Exec cooldown exemption (P2),
`cleanup:all` phantom Failed line (P3). See handoff for per-ticket
details.

**No migrations.** No dep changes. Nothing to reinstall.

---

## On pull, run

Nothing. TS-only edits + one committed xlsx fixture binary. Skip
`pnpm install`, skip `npx playwright install`, skip
`npx prisma generate`.

---

## Phase A — Version deployed

### A1. Version returned by `/health`

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "2.0.5", ... }
```

If the version doesn't flip within ~5 min of merge, trigger a manual
deploy per the `tdct` runbook.

There are **no migrations** to verify — skip the `_prisma_migrations`
query.

---

## Phase B — XLSX hyperlink cells no longer silently drop rows (P2 primary gate)

**The BC Canada file re-test.** This is the highest-value soak
verification — the exact file (or one shaped like it) that
originally lost 14/417 rows on 2026-07-31.

### B1. Best-case: re-upload the original BC Canada file

If pteam still has `HCP Import List for BC Canada.xlsx`:

1. Log in as PLATFORM_ADMIN on `https://kol360.bio-exec.com`.
2. Pick a real Bio-Exec Canada client + create (or navigate to) a
   test campaign for a BC-scoped disease area.
3. Open **Campaign HCPs** tab → **Upload HCPs** → pick the xlsx.
4. **Green gate:** all 417 rows land as **Added / Updated** with
   **zero** row-level errors. Confirm no red rows in the results
   panel; specifically no `PrismaClientValidationError` / `Invalid
   value provided. Expected String or Null, provided (Object).`
   messages.
5. Spot-check one of the previously-silently-dropped HCPs on
   `/admin/hcps` — the email should be a clean string
   (`hover the email chip; no `[object Object]` shape`).

### B2. Fallback: general HCP import with a hyperlinked email

If the original file isn't handy, exercise the same code path via
the general HCP import at `/admin/hcps` → Upload icon → **Import HCPs**:

1. In Excel, type an email in a cell (e.g. `test@example.com`) —
   Excel will auto-hyperlink it (blue underline, mailto: link).
2. Save as `.xlsx` and upload via the general HCP import dialog.
3. **Green gate:** row lands in **Created** or **Updated** with zero
   errors. Pre-fix (v2.0.4): row would be in `errors[]` with
   `Invalid value provided. Expected String or Null, provided
   (Object).`.

### B3. Alias / segment-scores / influencer-type import spot-check

Same fix covers `/hcps/aliases/import`, `/hcps/import-segment-scores`,
`/hcps/import-influencer-types`. If pteam has a real xlsx alias /
segment / influencer file with any hyperlinked cell (URL, email, or
otherwise), upload one to spot-check. Zero errors expected.

### B4. E2E fixture test on the deployed test env

```bash
cd e2e
E2E_API_URL=https://mpcu4inmtj.us-east-2.awsapprunner.com \
  npx tsx run-with-auth.ts api -- \
  --testNamePattern='XLSX HCP import — hyperlink email cells' \
  2>&1 | tail -20
```

**Expected:** test passes. This uploads the committed fixture
(`e2e/fixtures/hyperlink-hcps.xlsx`, one plain-string email row +
one ExcelJS-hyperlink email row) to `/hcps/import` and asserts
both rows land with zero errors and the hyperlinked-email row's
`email` field persists as a clean string in the DB.

If this test fails on the deployed test env but passes locally:
the deploy didn't take — recheck `/health` version.

---

## Phase C — Bio-Exec send cooldown exemption (P2 secondary gate)

**Cannot be exercised in the deployed test env** — the 12-month
cooldown check is gated to `NODE_ENV === 'production'` at
`apps/api/src/services/email.service.ts:830`. Test env runs
`NODE_ENV=staging` and skips the cooldown entirely. Full end-to-end
verification requires a controlled prod-side test send.

### C1. Prod-side controlled test send (Bio-Exec team, coordinated)

**Recommended shape (Bio-Exec / biz team to run when convenient):**

1. Pick an existing ACTIVE prod campaign whose disease area matches
   a previously-completed Bio-Exec internal QA survey (Dry Eye is
   the natural candidate — jboyd / jpikor completed Sun Pharma Dry
   Eye surveys ~4.7 months ago).
2. Attach ONE bio-exec.com internal QA HCP (e.g. `jboyd@bio-exec.com`)
   to the campaign via the Campaign HCPs tab. Do NOT bulk-attach real
   HCPs for this test.
3. Send the invitation via the "Send Invitations" button.
4. **Green gate:** the bio-exec.com HCP receives the invitation
   normally (no "Skipped" entry, no `RECENTLY_SURVEYED` row written
   for them). Verifiable via:
   - Inbox at `jboyd@bio-exec.com` should show the branded survey
     invitation email.
   - Prod DB check (see C2 below).
5. **Regression guard:** in the SAME send, if you also want to
   confirm real HCPs still get the cooldown, attach one real HCP who
   completed the same-disease-area survey within the past 12 months
   and confirm that HCP appears in the Skipped section with
   `Recently surveyed in same disease area - N nominations copied`.

### C2. DB verification (via prod tunnel)

Read-only check that the bio-exec HCP got a normal COMPLETED /
PENDING SurveyResponse row rather than a RECENTLY_SURVEYED one:

```bash
scripts/tunnel-up.sh prod   # port 5433
PGPASSWORD=RDS4Bioexec2025 psql \
  -h localhost -p 5433 -U kol360admin -d kol360 -c "
    SELECT sr.\"respondentHcpId\", h.email, sr.status, sr.\"createdAt\"
    FROM \"SurveyResponse\" sr
    JOIN \"Hcp\" h ON h.id = sr.\"respondentHcpId\"
    WHERE h.email LIKE '%@bio-exec.com'
      AND sr.\"campaignId\" = '<the campaign id from C1>'
    ORDER BY sr.\"createdAt\" DESC LIMIT 5;
  "
```

**Green:** status is NOT `RECENTLY_SURVEYED` for the bio-exec HCP.
**Red:** status IS `RECENTLY_SURVEYED` → the fix didn't take, or
the deploy didn't take. Recheck `/health` version and the deploy
history.

### C3. Unit-test regression pass (already run locally)

```bash
cd apps/api && pnpm vitest run src/services/__tests__/email.service.test.ts
# Expected: 15 tests pass. Covers bio-exec address variants (case,
# real customer domains, workarounds pteam used); suffix-injection
# guards; null/undefined/empty inputs.
```

If a future release relaxes the ALLOWED_EMAIL_DOMAIN constant or the
predicate shape, this suite should catch the drift.

---

## Phase D — cleanup:all no longer prints phantom Failed line (P3)

### D1. Run cleanup:all on the test env

```bash
cd e2e
pnpm cleanup:all 2>&1 | tail -30
```

**Green gate:**

- No `✗ Failed: per-run test HCP cleanup — ` line with an empty
  message after the dash.
- Either a `✓ Deleted N per-run test HCP(s)` line (when rows
  matched), OR an informational `- No per-run test HCPs to clean up
  (no rows matched)` line (when nothing was there to delete).
- Trailing `✅ All E2E test data cleaned up successfully!` accurately
  reflects the run.

**Red:** if a real `✗ Failed:` line appears with a **non-empty**
error message (e.g. `Foreign key constraint failed on the field:
CampaignHcp_hcpId_fkey`), that's a REAL cleanup failure worth
investigating — separate from the cosmetic issue this release fixed.
Capture the error message + prior context and file back to dev.

### D2. Re-run immediately (idempotency check)

```bash
cd e2e
pnpm cleanup:all 2>&1 | tail -30
```

**Green:** second run cleanly reports no-op ("already deleted" +
"no per-run test HCPs to clean up"). No phantom `✗ Failed:` line.

---

## Phase E — 24h light watch

Same posture as 5.0.4.

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for:

- Any spike in `/hcps/import` or `/campaigns/:id/import-hcps` 5xx
  responses — the xlsx parse boundary is new code; regression risk
  is low but non-zero. Baseline is ~0 today.
- Any spike in per-row `PrismaClientValidationError` in the API logs
  — pre-fix these were buried in the response body's `errors[]`
  array; post-fix they should be absent for the hyperlink shape.
- Any user report of "my import lost rows" — should NOT happen
  post-fix for the hyperlink shape. If reported: capture the file
  + response body and file back to dev with the row count from the
  file vs the reported `created`+`updated` count.

No new API endpoints; API error baseline should remain flat.

---

## Rollback gate

Roll back if any of the following fail:

- **A1** — `/health` doesn't return 2.0.5 within the deployment window
  → App Runner issue; check CloudWatch + redeploy or revert the tag.
- **B1 or B2 (P2 gate)** — xlsx import with a hyperlinked email cell
  still emits `PrismaClientValidationError` / drops the row → the
  `cellText()` helper isn't wired at the parse site (or the deploy
  didn't take). Capture the response body's `errors[]` before rolling
  back.
- **B4** — the fixture e2e fails on the deployed test env → same
  class as B1/B2.
- **C2 (P2 secondary)** — bio-exec HCP gets a `RECENTLY_SURVEYED`
  row on the controlled prod-side test send → the exemption didn't
  take. Not a data-loss gate; rollback is optional (behavior reverts
  to the pre-fix cooldown block).

**Rollback shape:** revert the PR on `main` → App Runner auto-redeploys
to v2.0.4. No schema to unwind, no infra state to unwind.

---

## See also

- Handoff: [`prod-rel-5.0.5-handoff.md`](prod-rel-5.0.5-handoff.md)
- Predecessor: [`prod-rel-5.0.4-handoff.md`](prod-rel-5.0.4-handoff.md)
- Pteam findings:
  - [`docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md`](../docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md)
  - [`docs/findings/send-cooldown-bioexec-exception-2026-07-30.md`](../docs/findings/send-cooldown-bioexec-exception-2026-07-30.md)
  - [`docs/findings/cleanup-test-data-cosmetic-failed-line-2026-07-31.md`](../docs/findings/cleanup-test-data-cosmetic-failed-line-2026-07-31.md)
