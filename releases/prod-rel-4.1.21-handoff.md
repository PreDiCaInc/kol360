# prod-rel-4.1.21 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible (code-only).
**Tag:** `prod-rel-4.1.21` → commit on `main` (cut immediately after this PR merges per combined-PR workflow).
**Supersedes:** `prod-rel-4.1.20` (v1.17.40) only for the tooltip wording; the 4.1.20 formula is unchanged.
**Bundles:** v1.17.41 — single-line clarity fix to the Survey Score methodology tooltip.

## TL;DR

The Survey Score (i) tooltip introduced in 4.1.20 listed **Regional Leader** in the "Not counted" categories. `REGIONAL_LEADER` is a reserved Prisma enum value (added in v1.17.34) but **no customer survey uses it** today — listing it in the explainer is confusing for a customer who's never seen such a question.

This release drops `REGIONAL_LEADER` from the customer-facing excluded list. **Backend formula behavior is unchanged.**

## What changes for customers

| Surface | Before (4.1.20) | After (4.1.21) |
|---|---|---|
| Survey Score (i) tooltip wording | "Not counted: Referral Leaders, Social Leader, Biased Leader, **Regional Leader**." | "Not counted: Referral Leaders, Social Leader, Biased Leader." |
| `scoreSurvey` formula | sum-of-4-counted ÷ max-such-sum × 100 | **unchanged** (the formula gates on inclusion in the 4 counted types, not exclusion — so `REGIONAL_LEADER` was never going to feed scoreSurvey regardless) |
| Per-type display columns | Per-type max-normalized | **unchanged** |

The only behavioral change is what the tooltip says. If a survey ever activates `REGIONAL_LEADER` questions later, the formula would still skip those nominations (they're not in the counted set), but pteam should re-evaluate the tooltip text at that point.

## Migrations

**None.** Code-only change.

## Risk

**Very low.** Diff is a single array literal in `packages/shared/src/score-methodology.ts` (drop one entry) + an updated comment in the unit-test file. No production code path reads `SURVEY_EXCLUDED_NOMINATION_TYPES` for behavior — only the tooltip text generator reads it.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **230/230** |
| Shared unit tests | **190/190** |
| Migrations | n/a (none) |

## Rollback

Redeploy `prod-rel-4.1.20` (v1.17.40). Tooltip wording reverts to listing Regional Leader. Backend formula behavior unchanged either way.

## See also

- Soak checks: [`prod-rel-4.1.21-soak-checks.md`](prod-rel-4.1.21-soak-checks.md)
- Predecessor: [`prod-rel-4.1.20-handoff.md`](prod-rel-4.1.20-handoff.md) — formula handoff
