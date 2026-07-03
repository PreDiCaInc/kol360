# prod-rel-4.1.49 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible.
**Tag:** `prod-rel-4.1.49` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.48` (v1.17.68).
**Bundles:** v1.17.69 — Canada HCP support **Phase 2**: threads `country` through every Insights/KolAnalysis/Nomination read + Curation write, finishes the FE identifier sweep with dynamic column labels, adds US/CA template toggles to every HCP-related import dialog, extends every CSV parser to accept both NPI and MINC column headers, and makes the HCP single-create form country-aware.

Ticket: [`docs/findings/canada-hcp-support-lite-plan-2026-06-25.md`](../docs/findings/canada-hcp-support-lite-plan-2026-06-25.md).

## TL;DR

Phase 1 (4.1.48) laid the schema + validation groundwork. **Prod could safely deploy 4.1.48 because there were zero CA HCPs.** Phase 2 removes the gate that "no customer may create a CA client until Phase 2 ships" — Insights aggregations, nomination matching, and identifier displays are now country-aware.

- **Insights (`insights-report.service.ts`)** — 4 client-scoped HCP queries + 1 match-count `count` all filtered by `WHERE country = resolveClientCountry(clientId)`. Plus `getKolProfile` rejects cross-country deep-links as HCP-not-found.
- **KolAnalysis (`kol-analysis.service.ts`)** — `getDedupReport` + `explainHcp` pull `defaultCountry` from `analysis.client` and filter their HCP lookups. `explainHcp` also rejects cross-country HCP lookup with `reason: 'HCP is not in this analysis's country regime'`.
- **Nomination matching (`nomination.service.ts`)** — all 4 candidate-search tiers (exact/last-name-partial/trigram/broad-partial) now include `country` from `nomination.response.campaign.client.defaultCountry`. Cross-country name-collision candidates (a US "John Smith" nomination can't fuzzy-match a Canadian "John Smith" HCP) are structurally impossible.
- **Curation `get-beid` route** — accepts `country` + `nationalIdType` params in the request body. Both default `'US'`/`'NPI'` so existing curation-svc clients keep working unchanged. When `nationalIdType='MINC'`, `npi` is validated as a MINC (12-char CAMD########). Created HCPs get their `country` + `nationalIdType` persisted from the request.
- **FE identifier sweep** — HCP list column header, HCP list CSV export header, KOL Explorer CSV export + Nominators SortableHeader, Sociometric CSV export, Leader Table CSV export, Survey Status page (header + CSV export) all use the new `inferHcpIdLabel(items)` helper. It picks `'NPI'` or `'MINC'` per the first row's `nationalIdType` — since all rows in one client's dashboard share country, one scan is enough. Falls back to `'NPI'` on empty data (backward compat).
- **`packages/shared/src/format/hcp-identifier.ts`** — new `inferHcpIdLabel<T>(items)` helper. Sibling to the existing `formatHcpId` / `getHcpIdValue` / `formatMincForDisplay` / `hcpIdColumnHeader`.
- **HCP form dialog** (`hcp-form-dialog.tsx`) — country selector on create; label + placeholder + maxLength flip between NPI (10 digits) and MINC (12-char CAMD########). Edit mode preserves the row's existing `country`/`nationalIdType`.
- **Import dialog templates + column-name flexibility** — HCP Import Dialog, Segment Score Import Dialog, Influencer Type Import Dialog, Campaign HCP Import Dialog, and Alias Import Dialog all now expose a US/CA template toggle. Downloaded templates use the correct identifier column header ("NPI" vs "MINC"), sample value, and (where applicable) sample state. On the backend, the parsers behind these paths (`importFromFile` HCP, `importAliases`, `importSegmentScores`, campaign `importHcps`, `influencer-type-import.service`) all accept both "NPI"/"MINC" (and lowercase variants) as identifier column headers so a CA admin can use the right-shaped template end-to-end. Segment score + campaign HCP parsers now validate the identifier as either 10-digit NPI OR CAMD######## MINC.

## What's still deferred

- **Curation service on the kolcuration side** needs to start sending `country`/`nationalIdType`. Our route accepts both, defaulted 'US'/'NPI'. Curation team can flip incrementally without any coordination — no work required in this repo.

## What changes for customers

| Surface | Before (4.1.48) | After (4.1.49) |
|---|---|---|
| Sun Pharma US dashboard | Would leak CA HCPs into leader tables + KOL Explorer once a Sun Pharma CA client was created (the gap Phase 2 was called out to close) | Filtered to US HCPs only |
| Sun Pharma CA dashboard | Would leak US HCPs the same way | Filtered to CA HCPs only |
| Nomination auto-match candidates | Would surface cross-country matches (US nomination for "John Smith" matches a CA "John Smith") | Same-country only |
| Curation get-beid | US-only implicit | Multi-country explicit; defaults 'US'/'NPI' so existing clients need no change |
| Table + CSV column labels | Always "NPI" | "NPI" or "MINC" per the data |

## API changes

- `POST /api/v1/hcps/get-beid` — accepts optional `country` (default 'US') + `nationalIdType` (default 'NPI'). MINC values validated per the shared `mincSchema`. Created rows persist both fields.
- No other request/response contracts change. Every existing US-only caller keeps behaving identically.

## Migrations

**None.** Schema unchanged from 4.1.48.

## Risk

**Low.**
- Every service-layer filter is additive `WHERE country = X` — either the row matched already (correct) or it didn't belong in the query result (would have leaked).
- The FE label switch is driven by data (`nationalIdType` field on rows), so US-only clients see identical "NPI" everywhere.
- Curation extension is default-preserving — an unchanged curation-svc client keeps sending only `npi`; new fields default.
- Nomination matching gets stricter (candidates limited to same-country) — for the current data set (zero CA HCPs) the candidate pool is unchanged.

Rollback: redeploy 4.1.48 (v1.17.68). Country filtering reverts to the "safe because there's no CA data" state.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.69 |
| Shared hcp + client schema unit tests | 42/42 pass (20 + 22) |
| E2E full workflow | will run post-deploy via `tdct` |

## Manual soak

Post-deploy (test env has zero CA HCPs today so most CA-vs-US isolation is a no-op — worth validating the code paths anyway with an inserted CA fixture):

1. Insert a test CA HCP via direct SQL (or run the Phase 1 e2e's CA-import test):
   ```sql
   INSERT INTO "Hcp" (id, "beId", npi, "nationalIdType", country, "firstName", "lastName", email, specialty)
   VALUES ('cm_ca_soak_test', 'BE-999999', 'CAMD99999999', 'MINC', 'CA', 'Soak', 'CATest', 'ca.soak@e2etest.example.com', 'Ophthalmology');
   ```
2. `/admin/hcps?country=CA` shows the CA row; `?country=US` hides it.
3. Load an Insights dashboard for a US client — CA HCP does NOT appear in KOL Explorer / Leader Rankings / Sociometric Summary.
4. Attempt a KOL Profile drill-down to `cm_ca_soak_test` from a US dashboard URL — endpoint returns 404 (or null profile) rather than leaking.
5. Kolcuration `get-beid` with `nationalIdType: 'MINC'` + `country: 'CA'` + a valid MINC creates a CA HCP. With defaults omitted, behavior is identical to today.
6. Cleanup: `DELETE FROM "Hcp" WHERE id = 'cm_ca_soak_test';`

## See also

- Soak checks: [`prod-rel-4.1.49-soak-checks.md`](prod-rel-4.1.49-soak-checks.md)
- Predecessor: [`prod-rel-4.1.48-handoff.md`](prod-rel-4.1.48-handoff.md)
- Source ticket: [`docs/findings/canada-hcp-support-lite-plan-2026-06-25.md`](../docs/findings/canada-hcp-support-lite-plan-2026-06-25.md)
