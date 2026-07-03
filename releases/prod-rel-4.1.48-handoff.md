# prod-rel-4.1.48 — Handoff to Prod Team

**Status:** Ready for prod deploy. **Migration included.** Reversible.
**Tag:** `prod-rel-4.1.48` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.47` (v1.17.67).
**Bundles:** v1.17.68 — **Canada HCP support (Phase 1 of the ticket).** Ticket: [`docs/findings/canada-hcp-support-lite-plan-2026-06-25.md`](../docs/findings/canada-hcp-support-lite-plan-2026-06-25.md).

## TL;DR

Adds multi-country HCP support so a customer running Canadian programs (e.g. "Sun Pharma Canada") can spin up a new Client, import CA HCPs via CSV, and see them in the admin list — all separated from the US universe by the row-level `country` field.

- **Schema:** `Hcp.country` + `Hcp.nationalIdType` + `Hcp.alternateIds` added. `Client.defaultCountry` added. All default `'US'`/`'NPI'` so every existing row remains identical to today.
- **Validation:** MINC (`CAMD########`) regex added to `packages/shared`. Import service picks the regex per-import via the `country` query param on `POST /hcps/import`. Cross-country name-collision MERGE is now blocked (HcpAlias fetch is country-scoped).
- **Display:** `formatHcpId(hcp)` / `getHcpIdValue(hcp)` helpers in `packages/shared`. Applied to `/admin/hcps` list + detail page.
- **UI:** Client form adds an **HCP Country** selector (US / CA). HCP Import Dialog adds an **HCP Country** toggle that scopes the validator per import.
- **List filtering:** `GET /hcps` accepts `country=US|CA` query param — the FE can pass the currently-scoped client's `defaultCountry` to hide cross-country HCPs.

## What is NOT in this PR (deferred as Phase 2)

Per the ticket's "single shippable release" plan I was aggressive on scope; some of what the ticket describes is Phase 2, explicitly deferred:

- **Insights `WHERE country` threading.** ~40 `prisma.hcp.*` queries live across `insights-report.service.ts`, `kol-analysis.service.ts`, and `nomination.service.ts`. Threading each is mechanical but voluminous. **This is safe today** because prod has zero CA HCPs; Insights will only ever return US data no matter what any dashboard query looks like. The moment "Sun Pharma Canada" (or any client with `defaultCountry='CA'`) is created AND CA HCPs are imported, Insights will start mixing countries in aggregations for whoever opens that dashboard. That's why the ticket says "Phase 2 — before CA Insights go live." Follow-up PR track.
- **Curation `get-beid` extension.** The curation service dedup-by-NPI path assumes US. Extending to accept `nationalIdType` + `country` on that endpoint is the same shape as the import extension — small work; deferred here.
- **CSV export column-header country awareness.** Today's exports read `NPI` as the header regardless. When CA HCPs export, that header should read `MINC`. FE-only change; deferred.
- **Bulk-migrate the ~30 remaining `.npi` label sites in the FE.** Only the /admin/hcps list + detail page picked up `formatHcpId` in this PR. Campaign nominations, survey-status, insights tables still render raw `.npi`. Safe today (US-only data), needs a sweep before CA rollout.

## Design risks I noted in review + how they were addressed

From my review of the ticket before writing code:

1. **`npi @unique` cross-country collision.** Ticket didn't call it out. Turned out to be moot because MINC always has letters (`CAMD########`) and NPI never does — the value spaces don't overlap by format. Kept single-column `@unique` — safe.
2. **HcpAlias MERGE country-blindness.** Ticket said existing HcpAlias matching "handles this in both directions." That would silently merge a Canadian "John Smith" into a US "John Smith" HCP. **Fixed here:** the bulk HcpAlias fetch is now scoped to `hcp.country = <import country>` so cross-country name collisions can't MERGE.
3. **`Client.defaultCountry` isn't a hard tenant boundary.** Ticket implied it "just works" as a filter. Confirmed: it's a filter default, not enforcement. **Partial fix:** import dialog + HCP list route both accept an explicit `country` param so admin can't cross wires. Full enforcement (write-side guard checking `hcp.country === client.defaultCountry`) deferred to Phase 2.

## Schema change (⚠ migration required)

- `Hcp.country TEXT NOT NULL DEFAULT 'US'`
- `Hcp.nationalIdType TEXT NOT NULL DEFAULT 'NPI'`
- `Hcp.alternateIds JSONB` (nullable)
- `Client.defaultCountry TEXT NOT NULL DEFAULT 'US'`
- New index `Hcp_country_idx` on `Hcp(country)` for list-scoping perf

Existing 13,138 test-DB HCPs backfill to `country='US'` / `nationalIdType='NPI'` via the defaults — no explicit writes.

**Prod ops step**: apply via psql before promoting the deploy.

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/migrations/20260703_add_country_and_nationalidtype_to_hcp/migration.sql
```

Idempotent (`IF NOT EXISTS` on every DDL).

## API changes

**Extended:**
- `POST /api/v1/hcps/import?country=US|CA` — new optional query param picks the validator regime. Default 'US'. Column header may be `NPI` or `MINC`; both accepted per row.
- `GET /api/v1/hcps?country=US|CA` — new optional query param filters by country. Absence returns all countries (backward compat).
- `createHcpSchema` / `updateHcpSchema` — accept `country`, `nationalIdType`, `alternateIds`. Cross-validate the identifier value against the type regex via `superRefine`.

**Behavior unchanged:**
- Every existing US-only import / list / create flow keeps working with zero client-side changes (defaults handle it).

## Risk

**Low.**
- Schema: purely additive; defaults populate every existing row with US semantics.
- Import path: `country=US` (default) is byte-identical to pre-v1.17.68 behavior.
- List path: `country` unset returns all rows (unchanged from today).
- FE: adds a Country toggle to import + a Country dropdown to client form. Existing US flows just leave those on default.
- HcpAlias MERGE: only tightens — CA imports can no longer merge into US HCPs by name. US imports are unaffected.

Rollback: redeploy prior code. Schema stays widened (safe — old code ignores the new columns). If the schema tightening is ever needed, first `DELETE FROM "Hcp" WHERE "country" = 'CA'` then `SET NOT NULL`. Not recommended.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.68 |
| Migration applied to test DB | ✓ 3 columns on Hcp, 1 on Client, index created |
| Migration idempotency | ✓ re-run against migrated DB produces NOTICEs, exit 0 |
| Shared MINC helpers unit checks | 11/11 pass (`normalizeMinc`, `mincSchema`, `formatMincForDisplay`, `formatHcpId`, `validateNationalIdValue`) |
| Client schema unit tests | 20/20 pass (`packages/shared`) |
| E2E: 4 valid MINC input shapes accept + 6 invalid MINC reject | added — will run post-deploy via tdct |

## Manual soak

1. **Create a CA client.** Admin → Clients → New. Set HCP Country = "Canada (MINC)". Save. Confirm the detail page shows the country in the settings inline card.
2. **Import a CA HCP roster.** Admin → HCPs → Import. Toggle to Canada. Upload a CSV with the identifier column carrying `CA-MD-####-###-#` MINCs. Confirm created rows land with `country='CA'` in the DB.
3. **List filter.** Load `/admin/hcps?country=CA` — should show only Canadian HCPs. Same for `country=US`.
4. **Detail page.** Open a CA HCP. Confirm the header renders `MINC: CA-MD-####-###-#` and the info card label reads `MINC`.
5. **Reject a bad MINC.** Import a CSV with `USMD12345678` (wrong country prefix). Confirm the row lands in `errors[]`, not silently created.
6. **US-side smoke.** Import a normal US HCP roster (no country toggle). Confirm byte-identical behavior — created rows have `country='US'`.

## See also

- Soak checks: [`prod-rel-4.1.48-soak-checks.md`](prod-rel-4.1.48-soak-checks.md)
- Predecessor: [`prod-rel-4.1.47-handoff.md`](prod-rel-4.1.47-handoff.md)
- Source ticket: [`docs/findings/canada-hcp-support-lite-plan-2026-06-25.md`](../docs/findings/canada-hcp-support-lite-plan-2026-06-25.md)
