# prod-rel-5.0.5 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Fully reversible via PR revert.
**Tag:** `prod-rel-5.0.5` — anchor at the merge commit on `main`.
**Supersedes:** `prod-rel-5.0.4` (v2.0.4).
**Bundles:** v2.0.4 → v2.0.5 — three pteam-filed fixes (2 P2 + 1 P3).

**One-liner:** xlsx imports no longer silently drop hyperlink-email rows;
Bio-Exec internal QA sends no longer trip the 12-month cooldown;
`cleanup:all` no longer prints a phantom `✗ Failed:` line.

---

## On pull, run

**Nothing to reinstall. TS-only + one committed binary fixture. Just `git pull`.**

Zero `package.json` dep edits, zero `pnpm-lock.yaml` movement, zero
pretest-hook changes. The edits are:

1. New TS util `apps/api/src/utils/excel.ts` + its unit test.
2. Three service files call the new util (`distribution.service.ts`,
   `hcp.service.ts`, `influencer-type-import.service.ts`).
3. One-liner cooldown exemption in `email.service.ts` + its unit test.
4. Log-emit hygiene in `e2e/cleanup-test-data.ts`.
5. One new e2e file + one new e2e fixture binary (`e2e/fixtures/hyperlink-hcps.xlsx`).
6. Three `package.json` version-string bumps (2.0.4 → 2.0.5).
7. This handoff + soak-checks doc + README row.

Skip `pnpm install`, skip `npx playwright install`, skip
`npx prisma generate`.

---

## TL;DR (per ticket)

### 1. XLSX hyperlink cells silently drop rows (P2 — real customer impact)

Biz user uploaded `HCP Import List for BC Canada.xlsx` (417 rows) to
Campaign HCPs. UI showed a wall of red errors. Real state: 403 rows
created cleanly, **14 rows silently dropped** with per-row
`PrismaClientValidationError`. Same class silently affects every xlsx
importer.

**Root cause.** ExcelJS returns hyperlink cells as
`{ text: 'x@y.com', hyperlink: 'mailto:x@y.com' }` — an object, not a
string. Excel auto-hyperlinks any cell whose value looks like an email
address (blue-underlined mailto: link). Every parse site bound
`rowData[header] = cell.value` directly, so `rowData['Email']` became
the object. Downstream:

```ts
email: (row['Email'] || row['email'] || null) as string | null
```

`{...}` is truthy → the "Email is required" guard never fired → the
object was passed to `prisma.hcp.update` / `create` → Prisma threw
`Invalid value provided. Expected String or Null, provided (Object)`
→ per-row `try/catch` caught it → row silently vanished into the
results-panel red block.

**Fix.** New `cellText(v: unknown): string | null` helper at
[`apps/api/src/utils/excel.ts`](../apps/api/src/utils/excel.ts) that
flattens every ExcelJS cell shape (hyperlink, richText, formula,
plain, Date, primitive) to `string | null` at the parse boundary.
Applied at every affected parse site:

- **Primary site** — `apps/api/src/services/distribution.service.ts`
  `parseExcelToRows` (Campaign HCPs import — the BC Canada file's path).
- `apps/api/src/services/hcp.service.ts` `parseExcelToRows` — covers
  `POST /hcps/import` (generic HCP import), `POST /hcps/aliases/import`
  (aliases import), `POST /hcps/import-segment-scores` (segment scores).
  All three route through `parseFileToRows` → `parseExcelToRows` in this
  file; one fix covers all three.
- `apps/api/src/services/influencer-type-import.service.ts` — inline
  Excel parser for `POST /hcps/import-influencer-types`.

**Sites deliberately NOT touched (out of scope per pteam's audit):**

- `apps/api/src/services/export.service.ts:617,675,678,690` — payment
  status xlsx import. Same class of pattern (`String(cell.value || '')`
  would stringify an object as `'[object Object]'`) but pteam did not
  list it in their affected-parse-sites audit. Payment-ID / NPI /
  status columns are unlikely to be auto-hyperlinked in real customer
  exports. Left untouched to keep this PR's diff surgical; noted here
  for a future hygiene sweep if a customer trips it.

**Regression coverage:**
- Unit test — `apps/api/src/utils/excel.test.ts` (18 tests across all
  shape variants incl. hyperlink, richText, formula, primitive, empty).
  This is the load-bearing regression net — every parse site now
  delegates to the helper.
- E2E — `e2e/api/hcp-import-xlsx-hyperlink.test.ts` uploads a
  pre-generated fixture xlsx (`e2e/fixtures/hyperlink-hcps.xlsx`)
  with one plain-string email row + one ExcelJS-hyperlink email row,
  asserts both land with zero errors and the hyperlinked row
  persists with a clean string email in the DB.

Source: [`docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md`](../docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md).

### 2. Send cooldown blocks Bio-Exec internal QA (P2 — biz-team friction)

Biz team preparing a new B&L Canada campaign test send to
`jboyd@bio-exec.com` + `jpikor@bio-exec.com` — both **silently
skipped** by the 12-month same-disease-area cooldown because they
completed Sun Pharma / Dry Eye surveys ~4.7 months ago. Biz worked
around by creating lookalike-email HCPs (`jboyd@exec-bio.com` etc.).

**Root cause** (correcting the earlier "6 months" note on the
ticket — actual gate is **12 months**): `EmailService.sendBulkInvitations`
at `apps/api/src/services/email.service.ts:920` skips any HCP whose
id appears in `recentlySurveyedHcpIds` (`SurveyResponse WHERE
status='COMPLETED' AND completedAt >= now() - 1 year AND diseaseAreaId
= current AND campaignId != current`). Correct behavior for real
HCPs; wrong behavior for internal QA test users.

**Fix.** One-line domain exemption. Extracted as a named helper
`isCooldownExempt(email)` at the top of `email.service.ts` (exported
so the unit test can hit the predicate directly without mocking Prisma
+ SES + the full send loop):

```ts
export function isCooldownExempt(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}
```

Used inline at the cooldown check:

```ts
if (recentlySurveyedHcpIds.has(hcp.id) && !isCooldownExempt(hcp.email)) {
```

**What was NOT changed** (deliberately kept per pteam's guidance):

- The opt-out check at `email.service.ts:906` stays untouched.
  Opt-outs are a legal / SES-suppression signal and MUST apply to
  every domain, including bio-exec.com.
- The placeholder-email skip at line 884 stays untouched.
- The bounce / complaint skip in the reminder loop stays untouched.

**Deferred to a follow-up** (pteam flagged as explicitly optional,
NOT in scope for this PR):

- The un-wired single-send route `POST /api/v1/campaigns/:campaignId/distribution/:hcpId/send`
  (`apps/api/src/routes/distribution.ts:418-442`) — zero web callers,
  bypasses the cooldown, dev's call whether to wire it as a UI
  break-glass button, remove it, or leave as-is.
- The four orphan `SurveyResponse status='RECENTLY_SURVEYED'` rows
  written for jboyd / jpikor on the two B&L Canada campaigns on
  2026-07-30 — safe to leave (CampaignHcp rows already removed by
  biz user); optional prod-side `DELETE` documented in the finding.

**Regression coverage:**
- Unit test — `apps/api/src/services/__tests__/email.service.test.ts`
  (15 tests: bio-exec addresses in various cases pass; non-bio-exec
  incl. suffix-injection guards fail; null/undefined/empty return
  false).

**Why not an e2e test:** the cooldown check is gated to
`NODE_ENV === 'production'` at `email.service.ts:830` (dev/test envs
skip the cooldown entirely so re-surveying works). The deployed test
env runs `NODE_ENV=staging` → an e2e can't exercise the
`recentlySurveyedHcpIds`-populated branch. Full end-to-end validation
is a manual prod-side test send documented in the soak checks.

Source: [`docs/findings/send-cooldown-bioexec-exception-2026-07-30.md`](../docs/findings/send-cooldown-bioexec-exception-2026-07-30.md).

### 3. `cleanup:all` phantom `✗ Failed:` line (P3 — cosmetic)

`pnpm cleanup --all` (and `--tsx e2e/cleanup-test-data.ts --all`) prints
a phantom failure line with an **empty error message** on every recent
prod cutover (5.0.2 / 5.0.3 / 5.0.4):

```
✗ Failed: per-run test HCP cleanup —
✅ All E2E test data cleaned up successfully!
```

Exit 0. No data loss. Just misleading.

**Root cause.** The catch branch at `e2e/cleanup-test-data.ts:208` did:

```ts
const message = e instanceof Error ? e.message.split('\n')[0] : String(e);
console.warn(`  ✗ Failed: per-run test HCP cleanup — ${message}`);
```

When the caught error carries an empty top line (e.g. Prisma
multi-line message whose first line is blank after `.split('\n')[0]`,
or a rethrown non-Error whose `String()` was empty), `message` came
out empty — but the phantom `✗ Failed:` line still printed with
nothing after the dash.

**Fix per pteam's fallback (b) recommendation.** Fall back to the
error's class name when the message is empty (adds a diagnostic
hint for future occurrences), and suppress the noisy `✗` line
entirely when we have literally nothing to say (prints an
informational `- No per-run test HCPs to clean up (no rows matched)`
instead). No behavior change to the actual delete cascade — this is
log-emit hygiene only.

**Explicitly NOT touched:** the T3 FK-ordering fix from prod-rel-5.0.1
(the CampaignHcp-before-Hcp delete order) is a DIFFERENT cleanup issue,
already shipped, and continues to work correctly.

Source: [`docs/findings/cleanup-test-data-cosmetic-failed-line-2026-07-31.md`](../docs/findings/cleanup-test-data-cosmetic-failed-line-2026-07-31.md).

---

## Migrations

**None.** Zero schema.

---

## Risk

**Low.**

- **XLSX fix**: additive; the CSV path is byte-for-byte unchanged
  (strings pass straight through `cellText()`). Every string cell in
  every xlsx pass through the helper as a trimmed string — same result
  as prior `String(cell.value || '').trim()` for the common case. Only
  the object-shape cases (hyperlink / richText / formula) behave
  differently — and pre-fix those cases were the bug. Unit test
  regression net on the helper (18 tests, all shape variants). E2E
  fixture proves full end-to-end integration on the primary route.
- **Cooldown fix**: one-line predicate at one call site. Non-bio-exec
  addresses continue to be skipped exactly as before. Bio-exec addresses
  bypass ONE check (12-month cooldown) — every other gate (opt-out,
  placeholder, bounce, complaint) still applies. Unit test covers
  edge cases incl. suffix-injection guards.
- **Cleanup fix**: log-emit hygiene only. No change to the delete
  cascade. Exit code semantics unchanged.

Rollback shape: revert the PR. No schema, no infra state.

---

## Test environment verification

At `v2.0.5` on dev branch:

| Check | Result |
|---|---|
| `pnpm --filter @kol360/shared build` | pass |
| `pnpm --filter @kol360/api build` | pass |
| `pnpm --filter @kol360/web build` | pass |
| `apps/api/src/utils/excel.test.ts` (18 tests) | pass |
| `apps/api/src/services/__tests__/email.service.test.ts` (15 tests) | pass |

Formal e2e / soak verification happens post-deploy per `tdct` — see
`prod-rel-5.0.5-soak-checks.md`.

---

## Rollback shape

1. Revert the PR on `main` → App Runner auto-redeploys to v2.0.4.
2. No DB state to unwind (no migrations in this release).
3. No Cognito or infra state to unwind.
4. The four orphan `SurveyResponse status='RECENTLY_SURVEYED'` rows
   noted under ticket #2 are unrelated to this PR — they were written
   on 2026-07-30 pre-PR. Optional cleanup is documented in the
   finding doc; not required for rollback.

---

## See also

- Soak checks: [`prod-rel-5.0.5-soak-checks.md`](prod-rel-5.0.5-soak-checks.md)
- Predecessor: [`prod-rel-5.0.4-handoff.md`](prod-rel-5.0.4-handoff.md)
- Pteam findings:
  - [`docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md`](../docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md)
  - [`docs/findings/send-cooldown-bioexec-exception-2026-07-30.md`](../docs/findings/send-cooldown-bioexec-exception-2026-07-30.md)
  - [`docs/findings/cleanup-test-data-cosmetic-failed-line-2026-07-31.md`](../docs/findings/cleanup-test-data-cosmetic-failed-line-2026-07-31.md)
