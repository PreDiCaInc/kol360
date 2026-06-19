# prod-rel-4.1.36 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.36` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.35` (v1.17.55).
**Bundles:** v1.17.56 — three independent items bundled into one release. All small, all additive/in-place; bundled because each is too small for its own cycle.

## TL;DR

1. **KOL Profile drill-down — Apply Filters pattern.** The last remaining tab without the Track B Apply Filters batch UX (4 other tabs converted in 4.1.33). Pteam ticket [`insights-apply-filters-button-2026-06-16.md`](../docs/findings/insights-apply-filters-button-2026-06-16.md) requested respondent filters affecting the Nominators table + the per-nominator demographic sub-charts on the single-HCP drill-down. Live "N nominators match" indicator next to the Apply button — uses the `useNominatorMatchCount` hook already shipped in 4.1.32.

2. **Seg-only HCPs in analysis recalc.** Pteam ask: *"WTD tab — we need to include all hcps who have the seg scores, even if they don't have nominations."* `computePooled` now persists `HcpAnalysisScore` rows for every HCP with current `HcpDiseaseAreaScore` data in the DA, regardless of nomination activity. Seg-only HCPs land with `nominationCount=0`, `scoreSurvey=null`, all per-type counts=0; `compositeScore` is the segment-driven weighted sum (survey contribution = 0). **Requires a Recalculate click on each analysis post-deploy** to backfill — App Runner deploy alone does not populate these rows.

3. **HCP importer UPDATE branch accepts partials.** Pteam P3 ticket [`hcp-import-relax-validation-for-update-rows-2026-06-18.md`](../docs/findings/hcp-import-relax-validation-for-update-rows-2026-06-18.md). The HCP CSV importer used to require firstName + lastName + email + specialty on every row regardless of whether the NPI matched an existing HCP — partial-update CSVs (`NPI,City,State` / `NPI,Email` / `NPI,Specialty`) were rejected at validation. Every demographic-correction ask required a direct-SQL trip through the prod tunnel. Validator restructured to apply per-branch rules: UPDATE accepts partials; CREATE + MERGE stay strict.

## What changes for customers

### Item 1: KOL Profile Apply Filters

Open the KOL Explorer ("Total Weighted Score") tab → click into any KOL's profile.

**Before**: profile shows scores, nomination counts, per-nominator demographic charts (Specialty / State / Type), Nominators table. No filtering possible on the drill-down.

**After**: a new "Respondent Filters" bar above the demographic charts with all 7 respondent filter dimensions (Role / Core Focus / State of Practice / Practice Setting / Years in Practice / Monthly Patients / DED Patients). Apply button to the right with live "N nominators match" indicator. Pending edits → click Apply → the Nominators table AND the demographic sub-charts re-render scoped to nominations whose response passes the filters. Enter inside any filter input triggers Apply. Reset clears.

Same UX shape as the 4 tabs converted in 4.1.33. Live count parity guaranteed by the 4.1.32 backend E2E.

### Item 2: WTD shows seg-only HCPs

WTD = "Total Weighted Score" tab (KOL Explorer).

**Before**: only HCPs with at least one nomination in the analysis's included campaigns appeared. HCPs with segment scores (peer-reviewed publications, trade pubs, org leadership, etc.) but zero nominations were invisible.

**After**: every HCP with `HcpDiseaseAreaScore` rows for the DA shows in WTD with a composite computed from their segment scores × analysis weights (survey weight contributes 0 since they have no survey data). Sort by composite still works — these HCPs sort wherever their segment-driven composite places them.

**CRITICAL ROLLOUT STEP**: code deploy alone does NOT populate the new rows. The change only takes effect on the **next `recalculateAnalysis` run**. Click "Recalculate" on each prod analysis from the admin page after deploy to backfill. Pteam confirmed this is acceptable.

### Item 3: HCP importer accepts partial UPDATE CSVs

**Before**: every CSV row required `NPI,First Name,Last Name,Email,Specialty` at minimum. Partial updates were rejected at validation.

**After**: per-branch validation. If NPI matches an existing HCP → row only needs the columns it's actually changing. If NPI doesn't match → today's strict CREATE rules still apply (and the MERGE branch via HcpAlias also stays strict).

Self-serve UI uploads now possible:
- `NPI,City,State` — bulk demographics correction.
- `NPI,Email` — bulk email correction.
- `NPI,Specialty` — bulk specialty reclassification.
- `NPI,Sub-specialty` — bulk sub-specialty.
- Any partial subset against existing HCPs.

Removes the direct-SQL ops session that previously handled these.

## API changes

| Endpoint | Change |
|---|---|
| `GET /:da/kol-profile/:hcpId` | New optional respondent-filter query params (`respondentRoles`, `coreFocuses`, etc.) — same shape as Demographics / Sociometric / Benchmarking. When provided, the nominators list AND the per-nominator demographics are filtered. |
| `POST /api/v1/hcps/import` (and the campaign-scoped variant) | Validator restructured: per-branch rules. Same response shape. Existing full-row CSVs work unchanged. |
| `POST /api/v1/admin/kol-analysis/:id/recalculate` | Behavior change: now also persists rows for seg-only HCPs. No request/response shape change. |

## Migrations

**None.** Code-only.

## Risk

**Low-medium overall. Items split:**

- **Item 1 (KOL Profile filters)**: Low. Pure additive surface on the drill-down. Existing profile view behavior unchanged when no filters are active.

- **Item 2 (seg-only HCPs in recalc)**: Medium. Behavioral change to the score persistence shape. Watch for:
  - WTD list growing significantly (e.g., 1.5K → 5K rows on Sun Pharma). The in-memory sort/paginate handles this in microseconds; the FE payload grows but is still bounded.
  - Customer surprise — "why are there KOLs with composite scores but no nominations?" The handoff doc + soak step explain the rationale; if any customer asks, the answer is "we have objective segment data on them; this is their objective-driven score."

- **Item 3 (importer relaxation)**: Low. Per-branch validation; CREATE + MERGE strict rules unchanged. 231/231 API unit tests pass + 5 new e2e cases cover the ticket's acceptance criteria.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.56 |
| API unit tests | 231/231 pass (incl. new test for seg-only recalc) |
| E2E suite | will run post-deploy via `tdct` (incl. new `hcp-import-partial-update.test.ts`) |
| Manual smoke | see soak doc Phase A |

## Rollback

Redeploy `prod-rel-4.1.35` (v1.17.55). Effects:
- KOL Profile drill-down reverts to no-filter mode.
- HCP importer requires full rows again.
- **Seg-only `HcpAnalysisScore` rows would stay in the DB** until the next recalc — which would drop them again under the old code. No data loss; just the score column for those HCPs goes away again.

No data destruction.

## Manual soak

See [`prod-rel-4.1.36-soak-checks.md`](prod-rel-4.1.36-soak-checks.md) for the phased checklist.

The critical bits:
1. After deploy, click **Recalculate** on each prod analysis (Sun Pharma → Dry Eye, B+L → Dry Eye, Bio-Exec → Dry Eye) to backfill seg-only rows. Verify WTD row count grows for analyses where seg-only HCPs exist.
2. Open the KOL Explorer ("Total Weighted Score") tab → click into any KOL → confirm new "Respondent Filters" bar above the demographic charts. Try a filter, click Apply, verify Nominators table + demographic charts re-render.
3. Test the importer: download the template; create a `NPI,City,State` CSV with one row for an existing HCP; upload via Admin → HCPs → Import. Verify only city/state change; name/email/specialty preserved.

## See also

- Soak checks: [`prod-rel-4.1.36-soak-checks.md`](prod-rel-4.1.36-soak-checks.md)
- Predecessor: [`prod-rel-4.1.35-handoff.md`](prod-rel-4.1.35-handoff.md)
- Source tickets:
  - [`docs/findings/insights-apply-filters-button-2026-06-16.md`](../docs/findings/insights-apply-filters-button-2026-06-16.md) (Item 1)
  - Pteam ask 2026-06-18 (Item 2, no formal ticket)
  - [`docs/findings/hcp-import-relax-validation-for-update-rows-2026-06-18.md`](../docs/findings/hcp-import-relax-validation-for-update-rows-2026-06-18.md) (Item 3)
