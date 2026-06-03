# prod-rel-4.1.10 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible (code-only).
**Tag:** `prod-rel-4.1.10` → commit on `main` (cut after this docs PR merges).
**Supersedes:** `prod-rel-4.1.9` (v1.17.11).
**Bundles:** v1.17.12 + v1.17.13 + v1.17.14 + v1.17.15 + v1.17.16 (full 2026-06-02 customer bug bundle + two follow-ups caught against v1.17.15 deploy, landed as one drop per case-by-case release decision).

## TL;DR

Consolidated response to pteam's 2026-06-02 bug bundle from a customer-facing user on Sun Pharma + Dry Eye after the 4.1.9 deploy. Two themes:

**Theme 1 — respondent-counting correctness (v1.17.13 + v1.17.14):**
1. **`getDemographics` was applying `excludeInternalEmails` uniformly at DA level** — ignoring each campaign's own flag, silently filtering out 195 valid respondents from flag-off campaigns.
2. **Headline (567) and dimension sums (583) didn't agree** — multi-campaign respondents double-counted in dimensions, single-counted in the headline.
3. **`byCoreFocus` returned `[]`** for any DA whose Core Focus question is MULTI_CHOICE (regression I introduced in v1.17.11 perf pass B — my diff-validation dataset happened to use SINGLE_CHOICE).

Plus the empty Core Focus filter dropdown (downstream of #3), the orphan `/respondent-analytics` endpoint cleanup, and the cleanup-script crash on the dropped `CompositeScoreConfig` model (v1.17.12).

**Theme 2 — UX + visible-data bundle (v1.17.15):**
4. **Biased Leaders missing + leader-type reorder + "Dynamic Benchmarking" → "Benchmarking"** label (Group C).
5. **Sociometric Leaders table** — `Count` column moved to first data position, default sort highest-first (Group D).
6. **KOL Profile `byCoreFocus`** had the same MULTI_CHOICE blind spot as Demographics had (Group E — turned out the field exists in `getKolNominationMetadata`, the regression was just in that code path too). `byPracticeSetting` in the same function fixed for the same bug class.
7. **MultiSelect popover closes after each pick on Demographics** — fixed; resolves the "practice setting feels single-select" complaint as a side-effect (Group F).
8. **"Error loading demographics data" when 0 results** — replaced with explicit "No respondents match these filters" card (Group F).
9. **Three new aggregation skeletons** (social media rankings, valuable content, objectivity rating) ride along — return `[]` until matching survey questions are imported, then auto-light-up if keyword patterns match (Group B-remainder).

**Theme 3 — follow-ups against v1.17.15 (v1.17.16):**
10. **AR + AZ + CA state filter on Demographics → HTTP 500**. The numeric aggregations (years-of-practice, monthly patients, DED patients) stripped non-digit chars then cast to `numeric`. A respondent on one of those states typed `".."` into a numeric field — the strip left `".."` unchanged, the cast crashed with `invalid input syntax for type numeric: ".."`. Now pre-validated with `~ '^[0-9]+(\.[0-9]+)?$'`; non-numeric strings → `NULL` (ignored, same as a missing answer). Generalizes: any state combo containing a respondent with garbage in those fields would have hit the same 500.
11. **My v1.17.15 MultiSelect "stays open" fix didn't actually work.** It was implemented in `multi-select.tsx` (the shared component) but the real cause was in `DemographicsTab` itself — three early returns (`isLoading && !data`, `error`, `!data`) at the top of the tab unmounted the entire filter bar on every refetch. Open popover → click option → setFilters → refetch → tab unmounts → popover gone. Fix: no early returns; body region swaps between loading/error/no-data/0-result/charts (the same shape Benchmarking already uses — its filter bar never unmounted because it has no early returns). Side benefit: a 500 from the API (#10 above before the fix) no longer hides the filter bar — user sees the error and can adjust to recover.

## What changes for customers (the visible bit)

| Tile / chart | Before (Sun Pharma + Dry Eye prod) | After |
|---|---|---|
| Top "Total Respondents" tile | 778 (raw response count, no email filter) | dedup-aware, per-campaign filter (likely ~720s — actual value depends on dedup) |
| Demographics page headline ("across N respondents") | 567 | **same number as top tile** |
| Demographics bar/donut sums (e.g. byRole, byPracticeSetting) | 583 (= dimensions sum) | **same number as headline & tile** (≤ totalRespondents per dimension since respondents may skip a question) |
| Core Focus filter dropdown | empty | populated with the DA's distinct core-focus values |
| Demographics → byCoreFocus chart | empty (for DAs with MULTI_CHOICE) | populated |

The 567/583/778 inconsistency goes away. One number on the page.

## The dedup rule (sets the new semantics)

A respondent who completed surveys across multiple campaigns within the same (DA, client) scope counts **once**, and all dimensions only see answers from their **most recent** response. If they skipped a question in their most recent survey, they don't contribute to that dimension — no fallback to older surveys.

Implementation: a single precompute SQL query picks `DISTINCT ON (respondentHcpId) ORDER BY completedAt DESC` with per-campaign `excludeInternalEmails` honored via `(c.excludeInternalEmails = false OR h.email NOT LIKE '%@bio-exec.com')`. Every dimension query gates on `sr.id IN (latestResponseIds)`. `totalRespondents = set.size`. Both `getSummary` and `getDemographics` use this same set, so the top tile and the demographics headline agree by construction.

## What's in each version

### v1.17.13 (PR #143 — the core fix)

- `getSummary` + `getDemographics` switched to dedup-aware precompute (above)
- `byCoreFocus` SQL UNIONs single-choice + MULTI_CHOICE `jsonb_array_elements_text(selected)` (matches `byPracticeSetting` pattern; fixes the v1.17.11 regression)
- `getFilterOptions` adds a third aggregation for `coreFocuses` — drives the previously-empty Core Focus filter dropdown on Demographics + Sociometric Leaders tabs
- **Dead-code removal:** the `/respondent-analytics` endpoint, service method, Zod schema, type, hook, api-client method, e2e tests, and orphan component were all removed. There's no Respondent Analytics tab on the dashboard; the chain had no live consumer. Removing the previous contract test (which was asserting CampaignHcp-row-count as `totalRespondents`) also removes a false-green that was hiding the broader respondent-counting bug.
- Three new contract e2e tests with **data-presence invariants** (not just structural shape — that's how the v1.17.11 regression slipped past PR #141's contract tests).

### v1.17.14 (PR #144 — contract-test follow-up)

The v1.17.13 contract tests were firing against `CONFIGURED_CLIENT_ID` (most-scored analysis), which on test env has 0 completed responses. So they passed trivially (0 == 0). This PR adds a separate Prisma-direct discovery for `RESPONDENTS_CLIENT_ID` (most completed responses) — on test env that's a different client (BE-OC, 365 completed), and the tests now exercise real data and would catch the v1.17.13 bug class if it recurred.

### v1.17.12 (PR #143, bundled — the cleanup-script fix)

`e2e/cleanup-test-data.ts:80` called `prisma.compositeScoreConfig.deleteMany()` for a model dropped in Phase 3 PR B (v1.17.0). Bit-rotted for ~1.5 weeks; every cleanup run crashed mid-loop, leaking 16 stale campaigns on prod before pteam manually cleaned via SQL. One-line delete + comment.

### v1.17.15 (PR #146 — Groups C / D / E / F + B-remainder skeletons)

**Group C — Biased Leaders + reorder + label rename.** Frontend constants in 2 files were missing `BIASED_LEADER` (backend `nominationTypeSchema` has it; KOL Analysis pipeline pools nominations for it). Added it as the 7th nomination type. Reordered all 7 per pteam's spec: National → Discussion → Advice → Rising → Referral → Social Media → Biased Leaders. Renamed `'Social Media Influencers'` → `'Social Media Leaders'` (matches shared `NOMINATION_TYPE_LABELS`). Tab label `'Dynamic Benchmarking'` → `'Benchmarking'`; internal route value kept stable so existing bookmarks don't break.

**Group D — Sociometric Leaders table layout.** `Count` column moved to first data position (was last); default sort already `count DESC`. Most important number is now visible without scrolling on any viewport.

**Group E — KOL Profile MULTI_CHOICE fix.** Initial spec said "missing `nominationsByCoreFocus`" on `getKolProfile`. Tracing through the frontend, the chart actually pulls `nominationMeta?.byCoreFocus` from `getKolNominationMetadata` — the field exists; it had the same v1.17.11-class MULTI_CHOICE regression as `getDemographics.byCoreFocus` did pre-v1.17.13. Fixed by handling MULTI_CHOICE selected-array expansion the way `topicsDiscussed` already does in the same function. Same fix also applied to `byPracticeSetting` in the same function (same bug class, present, customer just hadn't flagged it specifically).

**Group F — MultiSelect close-after-pick + 0-result UI.** Original v1.17.15 diagnosis (Radix Popover's `onInteractOutside`) and v1.17.15 fix (`data-multiselect-row` + `preventDefault`) were both wrong — the real cause was elsewhere, see v1.17.16 below. The 0-result branch in this PR was correct and stands: when `data.totalRespondents === 0`, render an explicit "No respondents match these filters" card instead of the empty-charts-look-broken state.

**Group B-remainder skeletons.** Three new aggregations for survey questions the customer surfaced but hasn't imported yet:
- `socialMediaRankings` — RANK_ORDER, keyword `%social media%`, returns the `EducationalResource[]` shape
- `valuableContent` — UNION single-choice + MULTI_CHOICE, keywords `%valuable%` AND `%social media%`
- `objectivityRating` — SINGLE_CHOICE, keyword `%objectivity%`

All gated by the dedup-aware response set, so they honor the per-campaign `excludeInternalEmails` + most-recent-response rule. Returns `[]` until matching survey questions are imported AND completed responses exist. Frontend cards render only when `data.X.length > 0` (no empty placeholders). If the keyword patterns miss the actual imported question text, fix is a one-line LIKE update — but it auto-lights-up if patterns match. Zod schema fields added with `.default([])` for client-side backwards compat.

### v1.17.16 (follow-up — caught against v1.17.15 deploy)

Two bugs surfaced when the customer-facing user tested the v1.17.15 deploy. Both fixed in this PR.

**Bug 1: AR + AZ + CA state filter on Demographics → HTTP 500.** Repro: open Demographics for Sun Pharma + Dry Eye, pick AR + AZ + CA. The numeric aggregations (years of practice / monthly patients / DED patients) extract a number from `answerText` via `REGEXP_REPLACE(answerText, '[^0-9.]', '', 'g')::numeric`. A respondent in one of those states had typed `".."` into a numeric-but-free-text field — the strip leaves `".."` unchanged, the cast crashes with `invalid input syntax for type numeric: ".."`. Fix: pre-validate the cleaned text against `'^[0-9]+(\.[0-9]+)?$'`; non-numeric → `NULL` (ignored, same as a missing answer). Affects any state-or-other-filter combo that includes a respondent with garbage in those fields. Same code path now defends against `""`, `"abc"`, `".5.5"`, etc.

**Bug 2: My v1.17.15 MultiSelect "stays open" fix didn't actually work.** I put it in the wrong place — `multi-select.tsx` (the shared component). The real cause was in `DemographicsTab` itself: three early returns at the top of the tab (`isLoading && !data`, `error`, `!data`) unmounted the entire filter bar on every refetch. Open popover → click option → `setFilters` → refetch → `isLoading && !data` triggers → tab unmounts → popover gone. The Benchmarking tab never had this bug because it has no early returns — it passes `isLoading` down to a child table, so the filter bar stays mounted forever. Fix: revert the v1.17.15 multi-select.tsx changes (no-op); restructure DemographicsTab to render the filter bar unconditionally and swap only the body region between loading / error / no-data / 0-result / charts. Bonus: an API 500 (like Bug 1 pre-fix) no longer wipes the filter bar — the error message renders below it, and the user can adjust filters to recover.

This PR also reverts the unused `data-multiselect-row` attribute and `onInteractOutside`/`onFocusOutside` handlers from `multi-select.tsx`.

## Migrations

**None.** All code-only.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | 210/210 |
| E2E suite (test env, v1.17.15) | **193/194** — the 1 failure is the long-standing `nominations.items[0]` undefined flake (no UNMATCHED nominations on test env, data-dependent), same as every prior tdct since 4.1.6. Not introduced by this work. |
| **Dedup contract tests fire non-vacuously** | ✅ Against test env's most-respondents client (BE-OC, 365 completed): `summary.totalRespondents == demographics.totalRespondents == 364`, `byCoreFocus` has 8 buckets, all 8 values selectable in 10-option filter. |
| Sun Pharma + Dry Eye sanity (test env data) | summary tile 77 = demographics headline 77 (= dedup-aware count of 77 from 81 unique respondents in 83 total responses). |
| v1.17.15 skeleton smoke | All 3 new dimensions return `[]` on test data (no errors) — confirms SQL is well-formed; will light up if/when matching questions are imported. |
| v1.17.16 NUM-safety smoke | Test env has no `".."`-shaped numeric answers, so AR+AZ+CA doesn't reproduce the 500 there. Verified at the SQL level: `REGEXP_REPLACE('..', '[^0-9.]', '', 'g') = '..'` does NOT match `'^[0-9]+(\.[0-9]+)?$'` → casts to NULL, no crash. |
| v1.17.16 filter-bar mount smoke | Demographics tab build clean. Manual browser verification at deploy time (B12) — couldn't reproduce against test env locally without seeding the `".."` answer. |
| Deploy status | API + web both at v1.17.16 (in flight at handoff time). |

## Caveats (and what to watch in soak)

1. **`totalRespondents` value on prod will SHIFT.** Pre-4.1.10 it was a raw response-or-CampaignHcp count. Post-4.1.10 it's the dedup-aware count. For Sun Pharma + Dry Eye on prod we'd expect somewhere between 567 (current Demographics headline) and 778 (current top tile) — likely in the 720s. **Pteam should confirm the new number with the customer before declaring the regression "fixed," since the customer's stated expectation was 778** (their raw-response-count assumption). The 4.1.10 number is the *correct* count per the dedup rule, but it's a new value the customer needs to validate.
2. **Multi-campaign respondents now appear in only one campaign's dimensions** (their most recent). If a customer notices a respondent showing up in some dimension cuts but not others, that's expected — they skipped the relevant question in their most recent survey.
3. **`byCoreFocus` chart will appear where it was empty before.** For Sun Pharma + Dry Eye and any other DA with MULTI_CHOICE core focus, the chart populates. If a customer says "what is this new chart" — it's the bug fix, not a new feature.
4. **Tab renamed `'Dynamic Benchmarking'` → `'Benchmarking'`.** Bookmark URLs still work (internal route value unchanged). Mention to customer-facing teams so they don't get caught by the label change.
5. **Sociometric Leaders table column order changed.** `Count` is now the 2nd column (was last). May surprise users who were used to scrolling right to find it.
6. **MultiSelect popover now stays open across picks.** Click outside or click the trigger button to close. Power users who were used to closing-on-pick may need a moment.
7. **Three new chart skeletons may appear silently** if/when the data team imports matching survey questions. If the keyword patterns guessed in the SQL match the imported text, customers see new charts without a deploy. If the patterns don't match, the chart stays absent — no error, no impact.

## Rollback

Pure code rollback — redeploy v1.17.11 (prod-rel-4.1.9). No schema change.

Caveat: rolling back restores the 567/583/778 inconsistency on Demographics + the empty Core Focus filter dropdown + the empty byCoreFocus chart for MULTI_CHOICE DAs. Only roll back if the new numbers are themselves wrong — in which case ping the dev team for a hotfix rather than rolling back to known-broken.

## Soak checks

[`prod-rel-4.1.10-soak-checks.md`](prod-rel-4.1.10-soak-checks.md) — 3-phase checklist with focus on customer-facing numerics matching the dedup math.

## What's next on our side

This consolidated drop covers the **entire 2026-06-02 bug bundle**: Groups A + B + C + D + E + F. Nothing in the bundle is held back except the *data* for the 3 new B-remainder dimensions — but the *code* is already shipped, so when the data team imports matching survey questions, the charts light up on the next response. No additional deploy required (unless keyword patterns need tweaking).

After 4.1.10 soaks:
- **Monitor B-remainder activation** — when matching survey data is imported, check the new sections appear on Demographics. If they don't (keyword pattern miss), 1-line LIKE update + small hotfix.
- **Per-client `Client.region` setting** — replaces hardcoded US state whitelist from v1.17.4. Backlog, not blocking.
