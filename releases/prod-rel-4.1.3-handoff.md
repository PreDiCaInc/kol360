# prod-rel-4.1.3 — Handoff to Prod Team

**Status:** Ready for prod deploy. **P1 — admin users blocked.**
**Tag:** [`prod-rel-4.1.3`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.1.3) → commit [`3516fe7`](https://github.com/PreDiCaInc/kol360/commit/3516fe7) on `main`.
**Supersedes:** `prod-rel-4.1.2` (v1.17.1) — patch release that bundles a P1 hotfix with two queued P2/UX items.

## P1 first — please deploy ahead of the 4.1.2 soak schedule

Every HCP CSV upload has been crashing with HTTP 503 since the v1.17.0 (`prod-rel-4.1.1`) deploy 3 days ago. Multiple admins blocked. **This release unblocks them.** Recommend deploying as soon as your standard pre-cutover checks pass — don't wait out the full 4.1.2 soak window.

## What this is

Three workstreams bundled into one code-only patch. **No migrations.** Reversible (redeploy 4.1.2 if anything regresses).

| # | Severity | Area | Change |
|---|---|---|---|
| 1 | **P1** | HCP CSV import | Delete local `normalizeSpecialty` (credential-form output) in [`hcp.service.ts`](apps/api/src/services/hcp.service.ts); all CSV import write paths now normalize via the canonical `normalizeHcpSpecialty` at the validation phase. Unrecognized inputs land as per-row errors instead of 503-ing the batch. |
| 2 | P2 | Insights Dashboard | 5 prop-forwarding bugs that made dashboard tiles + KOL Explorer + profile combobox render 0s / empty. Backend now returns **400** on the 5 analysis-backed endpoints when `clientId` is missing (was: silent `{0,0,0, notConfigured:true}` shape that hid the bugs for ~2 months). Frontend hooks gated on `clientId`. Duplicate IntroductionTab tiles removed. |
| 3 | UX | Insights filters | "Clear filters" button visibility fix from v1.17.1 applied to the two remaining tab-level filter bars (Demographics + Leader Rankings). |

## P1 root cause (for the runbook)

`HcpService.importFromFile()` has three write paths into the `Hcp` table:

- **CREATE** (new HCP) — fixed in v1.15.31 to canonicalize the specialty input.
- **UPDATE** (existing HCP matched by NPI) — still wrote raw `'MD'` / `'OD'` / `'DO'` until v1.17.2.
- **MERGE** (matched via alias name) — same.

While the column had only a blacklist constraint (`Hcp_specialty_not_role_form`, which forbade only `'Optometrist'` / `'Ophthalmologist'`), the non-canonical writes were silently accepted. When v1.17.0 swapped the blacklist for the strict whitelist (`Hcp_specialty_check`: `Optometry` / `Ophthalmology` / `NULL`), every CSV row that matched an existing HCP triggered a CHECK violation. Prisma's batched-transaction semantics rolled the whole 100-row batch back, surfacing as HTTP 503 to the user with no per-row diagnostic.

Latent in code for ~2 months; user-impacting for 3 days (2026-05-22 → today).

## What it does for customer-facing surfaces

- **HCP CSV upload (admin):** works again. Inputs like `'Optometrist'` / `'OD'` / `'MD'` from real NPI exports now normalize to canonical `'Optometry'` or `'Ophthalmology'` at validation. Unrecognized values (e.g. `'Cardiology'`) land as per-row errors in the response — no batch crash.
- **Insights Dashboard:** IntroductionTab tiles, KOL Explorer table, KOL profile combobox now populate with real data (previously rendered 0s / empty when the client filter was active and the prop wasn't forwarded). KOL Explorer's Demographics + Leader Rankings filter bars have visible "Clear filters" buttons (matches the v1.17.1 fix on the top-level filter).
- **Lite client portal:** unchanged.
- **KOL Analysis dashboard:** unchanged.
- **Segment CSV import:** unchanged.

## Worth signaling to the customer team

The lite-client portal is unchanged. But the admin-facing Insights Dashboard now shows real numbers in spots where customers may have been seeing zeros for weeks. If anyone reported "the report says no data," re-invite them to look.

## Migrations

**None.** Code-only patch.

## Test environment verification

| Check | Result |
|---|---|
| Shared unit tests | 162/162 |
| API unit tests | 210/210 |
| Web build | green |
| Test-env deploy (`kol360-api-test` + `kol360-web-test`) | RUNNING on 1.17.2 ✓ |
| E2E full workflow vs test env (v1.17.2) | **168/169** (1 stale test asserting the pre-v1.17.2 silent-zero contract — production code is correct; fix queued in PR #126) |

The stale test (`access-control.test.ts:67`) was a self-inflicted miss — when I rewrote `insights-report.test.ts` for the new 400 contract, I didn't update a duplicate call in `access-control.test.ts`. Fix is a 1-line change (pass `clientId`); production behavior is correct.

## Soak checks

[`prod-rel-4.1.3-soak-checks.md`](prod-rel-4.1.3-soak-checks.md) — short 3-phase checklist scoped to the 3 fixes. The HCP CSV import check is the priority signal.

## Rollback

Redeploy 4.1.2 (v1.17.1). No data-state divergence — code-only patch. **But: the P1 returns on rollback.** Hotfix forward (not rollback) preferred unless the patch introduces a new regression worse than the 503.

## What's next on our side

After 4.1.3 soaks cleanly:
- No further code releases queued.
- Outstanding minor items (not blocking):
  - Migration baseline reconciliation on prod (housekeeping; see [`prod-team-deploy-guidance.md`](prod-team-deploy-guidance.md))
  - E2E suite improvements (the matrix test + stale-test fix from PR #126 — test-only, not deploy-affecting)
  - Process gate added: paired compatibility + rejection tests are now required for any migration that adds a constraint. See [`CONTRIBUTING.md`](CONTRIBUTING.md) — written specifically to prevent this class of P1 recurring.
