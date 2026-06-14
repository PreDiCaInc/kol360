# prod-rel-4.1.20 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible (code-only).
**Tag:** `prod-rel-4.1.20` → commit on `main` (cut immediately after this PR merges per combined-PR workflow).
**Supersedes:** `prod-rel-4.1.19` (v1.17.39).
**Bundles:** v1.17.40 — `scoreSurvey` formula rewrite + methodology tooltips + sticky-Name on KOL Explorer.

## TL;DR

The in-platform `scoreSurvey` did not match Sun Pharma's published "Total Sociometric Weighted Score" (their reference file: `csv/Sun Pharma Sociometric Score Calculations.xlsx`). Karpecki ranked behind Periman in ours; he ranks first in theirs (and is the well-established top KOL in dry-eye externally).

This release rewrites the formula to the customer's published methodology — verified to the 2nd decimal across 2,301 HCPs in their file.

## What changes for customers

| Surface | Before (4.1.19) | After (4.1.20) |
|---|---|---|
| `HcpAnalysisScore.scoreSurvey` | Average of per-type-normalized scores across all 7 nomination types | `(sum of nominations across 4 COUNTED types) ÷ (max-such-sum across HCPs) × 100` |
| Counted types (the new formula) | n/a | **4:** National Leader, Discussion Leaders, Advice Leaders, Rising Star |
| Excluded types (now zero-contribution) | All 7 counted equally | **4:** Referral Leaders, Social Leader, Biased Leader, Regional Leader |
| Per-type score columns (`scoreNationalLeader`, etc.) | Per-type-max-normalized | **Unchanged.** Sociometric Summary matrix is unaffected. |
| `compositeScore` | Weighted blend, 25% from scoreSurvey | **Weighting unchanged.** Composite shifts naturally because its scoreSurvey input shifts. |
| Insights surfaces (Sociometric Summary, KOL Explorer, KOL Profile badge) | No in-product explainer for the formula | New **(i)** info icon next to Survey + Composite + per-category column headers. Hover reveals the methodology + the counted/excluded type list. Single source of truth in `packages/shared/src/score-methodology.ts`. |
| KOL Explorer (Weighted-Score tab) | Only the `#` column was frozen during horizontal scroll | **Name column is also frozen** so the HCP stays visible while scrolling the score columns. |

### Expected directional rank shifts (customer-visible)

- **HCPs concentrated in National / Discussion / Advice / Rising** → scoreSurvey **rises**, composite rises. *Karpecki: 70.7 → 100.0.*
- **HCPs concentrated in Social / Referral / Biased / Regional only** → scoreSurvey **drops to 0**, composite drops by 25%. *Flanary (Social-only, 21 noms): 41.2 → 0.*
- **HCPs with a mix** → middling shift, depends on math.

For Sun Pharma's analytics team this is exactly what they want — the in-platform numbers will now agree with their published methodology. **For B+L:** their next Recalc click will shift their numbers the same way. Pteam should confirm with B+L before triggering Recalc on their analyses. There is no automatic backfill.

## Rollout

**No automatic backfill of existing scores.** The existing **"Recalculate" button** on the KOL Analysis admin page is the trigger:

- Pteam clicks Recalc on each Sun Pharma analysis → new numbers.
- B+L clicks Recalc (or pteam, with B+L approval) → their numbers shift the same way.
- Until Recalc is clicked, an analysis's stored `scoreSurvey` values stay frozen at their pre-4.1.20 values.

This means dashboards do not change the moment 4.1.20 deploys — they change when an admin explicitly recomputes.

## Migrations

**None.** Code-only change.

## Risk

**Low for code; moderate for the customer-visible numerical shift on Recalc.**

- Single ~30 LOC change in `apps/api/src/services/kol-analysis.service.ts` (lines 218-244 region).
- New `packages/shared/src/score-methodology.ts` is additive.
- Frontend changes: new `<ScoreTooltip>` component + 3 wire-up sites (KOL Explorer headers, KOL Explorer "Total Weighted Score" badge, Sociometric Summary per-category headers) + sticky-Name on KOL Explorer.
- 4 new unit tests cover the new-formula behavior (top HCP = 100, excluded-only HCP = 0, mixed-bag HCPs, all-excluded → null).
- 1 new e2e file (`kol-analysis-survey-score.test.ts`) structurally asserts the formula against a live scored analysis.

The numerical shift is exactly what the customer asked for — they verified the new formula matches their file to the 2nd decimal across 2,301 HCPs.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **230/230** (+4 new scoreSurvey formula cases) |
| Migrations | n/a (none) |
| E2E will run post-deploy | new `kol-analysis-survey-score.test.ts` should be 2/2 once v1.17.40 lands |

## Rollback

Redeploy `prod-rel-4.1.19` (v1.17.39). Effects:

- `scoreSurvey` reverts to the per-type-normalized average formula on the **next Recalc** of an analysis.
- Stored scoreSurvey values from 4.1.20-era Recalc runs remain in the DB until those analyses are recalculated under 4.1.19 again.
- Frontend tooltips disappear; sticky-Name reverts.

Strictly an improvement over rolling further back; no data state to unwind.

## See also

- Soak checks: [`prod-rel-4.1.20-soak-checks.md`](prod-rel-4.1.20-soak-checks.md)
- Predecessor: [`prod-rel-4.1.19-handoff.md`](prod-rel-4.1.19-handoff.md)
- Ticket: [`docs/findings/score-survey-formula-match-customer-2026-06-14.md`](../docs/findings/score-survey-formula-match-customer-2026-06-14.md)
