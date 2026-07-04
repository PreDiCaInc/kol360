# prod-rel-4.1.50 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible.
**Tag:** `prod-rel-4.1.50` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.49` (v1.17.69).
**Bundles:** v1.17.70 — Canada HCP support polish + integration spec. Closes the remaining FE tables, the dormant nomination-create landmine, and automates the CA-isolation soak check that was previously a manual `psql INSERT` step.

Ticket: [`docs/findings/canada-hcp-support-lite-plan-2026-06-25.md`](../docs/findings/canada-hcp-support-lite-plan-2026-06-25.md).

## TL;DR

Phase 2 (4.1.49) shipped the customer-critical CA path (Insights isolation, curation get-beid extension, import dialogs, form dialog). 4.1.50 closes the small residuals surfaced during the post-merge review:

- **FE tables — 2 remaining hardcoded "NPI" headers** — Lite HCP scores table and Campaign Payments table now use `inferHcpIdLabel(items)`. Backend `lite-client.service.ts` + `export.service.listPayments` include `nationalIdType` in their selects.
- **BE — nomination create-HCP path** — `matchToNewHcp` was persisting `country`/`nationalIdType` via schema defaults (US/NPI) regardless of the actual identifier shape. Dormant today because `createNominatedHcpSchema` doesn't accept MINC yet, but a real bug the moment CA nominations flip on. Now infers from identifier shape (same pattern as the `distribution.service.ts` fix in 4.1.49).
- **E2E — CA isolation soak automated** — new `canada-hcp-isolation.test.ts` seeds a CA fixture HCP + score row via Prisma, verifies `GET /hcps?country=CA` returns it, verifies US-scoped KOL Explorer / Leader Rankings / Sociometric Summary / KOL Profile all omit it, cleans up. Replaces the manual Phase B checklist steps (B1-B5) in the 4.1.49 soak doc.
- **Curation-svc integration spec** — [`releases/curation-svc-canada-integration-spec-v1.md`](curation-svc-canada-integration-spec-v1.md) documents the get-beid extension for the kolcuration team. Zero-coordination rollout on their side — kol360 already accepts both shapes.

## What changes for customers

Very small. All Phase 2 primary flows already work.

| Surface | Before (4.1.49) | After (4.1.50) |
|---|---|---|
| Lite HCP table header | Always "NPI" | "NPI" or "MINC" per data |
| Campaign Payments table header | Always "NPI" | "NPI" or "MINC" per data |
| Nomination → create new HCP with MINC identifier | Landed with `country='US'` (schema default) — landmine when CA nominations later enable | Now infers `country='CA'` + `nationalIdType='MINC'` from `/^CAMD\d{8}$/i.test(npi)` |

Nothing else customer-visible changes.

## API changes

None. Response shapes for `/api/v1/lite/disease-areas/:diseaseAreaId/scores` and `/api/v1/campaigns/:id/payments` now include `hcp.nationalIdType`, which is additive.

## Migrations

**None.** Schema unchanged from 4.1.49.

## Risk

**Low.**
- FE table label changes are data-driven via `inferHcpIdLabel` — US-only clients see identical "NPI" labels; only CA-country data flips the header.
- Nomination create-branch fix is behind a `.superRefine`-gated schema that doesn't accept MINC input today, so the code path is effectively dormant. Zero user-visible change for US customers.
- New e2e test is DB-gated (skips if Prisma probe fails); no impact on the main workflow test.

Rollback: redeploy 4.1.49 (v1.17.69). Everything Phase 2 continues to work.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.70 |
| Shared vitest | 190/190 pass |
| API vitest | 231/231 pass |
| Web vitest | 91/91 pass |
| E2E full workflow (post-deploy) | will run via `tdct` |
| New CA isolation e2e (post-deploy) | will run via `tdct` |

## Curation-svc coordination

The integration spec at [`releases/curation-svc-canada-integration-spec-v1.md`](curation-svc-canada-integration-spec-v1.md) is ready to share with the kolcuration team. They can start sending `country` + `nationalIdType` whenever ready; kol360 accepts both old and new shapes.

## See also

- Soak checks: [`prod-rel-4.1.50-soak-checks.md`](prod-rel-4.1.50-soak-checks.md)
- Curation integration spec: [`curation-svc-canada-integration-spec-v1.md`](curation-svc-canada-integration-spec-v1.md)
- Predecessor: [`prod-rel-4.1.49-handoff.md`](prod-rel-4.1.49-handoff.md)
- Source ticket: [`docs/findings/canada-hcp-support-lite-plan-2026-06-25.md`](../docs/findings/canada-hcp-support-lite-plan-2026-06-25.md)
