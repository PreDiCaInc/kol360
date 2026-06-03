# prod-rel-4.1.10 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible (code-only).
**Tag:** `prod-rel-4.1.10` → commit on `main` (cut after this docs PR merges).
**Supersedes:** `prod-rel-4.1.9` (v1.17.11).
**Bundles:** v1.17.12 + v1.17.13 + v1.17.14 (all ship together — v1.17.12 + v1.17.14 are small follow-ups around the v1.17.13 insights bug bundle).

## TL;DR

**Insights respondent-counting correctness fixes.** Three customer-facing bugs surfaced by pteam on Sun Pharma + Dry Eye after the 4.1.9 deploy:

1. **`getDemographics` was applying `excludeInternalEmails` uniformly at DA level** — ignoring each campaign's own flag, silently filtering out 195 valid respondents from flag-off campaigns.
2. **Headline (567) and dimension sums (583) didn't agree** — multi-campaign respondents double-counted in dimensions, single-counted in the headline.
3. **`byCoreFocus` returned `[]`** for any DA whose Core Focus question is MULTI_CHOICE (regression I introduced in v1.17.11 perf pass B — my diff-validation dataset happened to use SINGLE_CHOICE).

Plus the empty Core Focus filter dropdown (downstream of #3), the orphan `/respondent-analytics` endpoint cleanup, and the cleanup-script crash on the dropped `CompositeScoreConfig` model.

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

## Migrations

**None.** All code-only.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | 210/210 |
| E2E suite (test env, v1.17.14) | 194/194 of the relevant suite green (3 unrelated pre-existing flakes — `nominations.items[0]` undefined in 2 tests + stats 404 — same fixtures-dependent issues pteam knows from prior tdct runs, not introduced by this work) |
| **Dedup contract tests fire non-vacuously** | ✅ Smoke against test env's most-respondents client (BE-OC, 365 completed): `summary.totalRespondents == demographics.totalRespondents == 364`, `byCoreFocus` has 8 buckets, all 8 values selectable in 10-option filter |
| Sun Pharma + Dry Eye sanity (test env data) | summary tile 77 = demographics headline 77 (= dedup-aware count of 77 from 81 unique respondents in 83 total responses) |
| Deploy status | API + web both at v1.17.14 |

## Caveats (and what to watch in soak)

1. **`totalRespondents` value on prod will SHIFT.** Pre-4.1.10 it was a raw response-or-CampaignHcp count. Post-4.1.10 it's the dedup-aware count. For Sun Pharma + Dry Eye on prod we'd expect somewhere between 567 (current Demographics headline) and 778 (current top tile) — likely in the 720s. **Pteam should confirm the new number with the customer before declaring the regression "fixed," since the customer's stated expectation was 778** (their raw-response-count assumption). The 4.1.10 number is the *correct* count per the dedup rule, but it's a new value the customer needs to validate.
2. **Multi-campaign respondents now appear in only one campaign's dimensions** (their most recent). If a customer notices a respondent showing up in some dimension cuts but not others, that's expected — they skipped the relevant question in their most recent survey.
3. **`byCoreFocus` chart will appear where it was empty before.** For Sun Pharma + Dry Eye and any other DA with MULTI_CHOICE core focus, the chart populates. If a customer says "what is this new chart" — it's the bug fix, not a new feature.

## Rollback

Pure code rollback — redeploy v1.17.11 (prod-rel-4.1.9). No schema change.

Caveat: rolling back restores the 567/583/778 inconsistency on Demographics + the empty Core Focus filter dropdown + the empty byCoreFocus chart for MULTI_CHOICE DAs. Only roll back if the new numbers are themselves wrong — in which case ping the dev team for a hotfix rather than rolling back to known-broken.

## Soak checks

[`prod-rel-4.1.10-soak-checks.md`](prod-rel-4.1.10-soak-checks.md) — 3-phase checklist with focus on customer-facing numerics matching the dedup math.

## What's next on our side (the rest of the 2026-06-02 bug bundle)

The full bug bundle had 6 groups + batch-2 additions. This release covers **Group A + Group B (partial)**. The rest queued as separate PRs:

- **Group C** — Biased Leaders + reorder + "Dynamic Benchmarking" → "Benchmarking" label (~30 min)
- **Group E** — KOL Profile core focus noms (~3-4 hr)
- **Group F** — Filter UX (multi-select close-after-pick, 0-result handling) (~5-6 hr)
- **Group D** — Sociometric Leaders table layout (~2-3 hr)
- **Group B remainder** — 3 new dimensions (social media RANK_ORDER, valuable content, objectivity rating) — held until data is imported
