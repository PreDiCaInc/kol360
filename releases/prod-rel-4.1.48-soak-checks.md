# prod-rel-4.1.48 — Soak Checks (v1.17.68)

Tag at the merge commit on `main`. Includes DB migration. Phase 1 of Canada HCP support.

## Phase 0 — Migration (BEFORE deploy verify)

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/migrations/20260703_add_country_and_nationalidtype_to_hcp/migration.sql
```

Idempotent. Verify:

```sql
\d+ "Hcp"     -- expect country, nationalIdType, alternateIds columns; Hcp_country_idx
\d+ "Client"  -- expect defaultCountry column
```

## Phase A — Sanity (US regression check)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.68", ... }
```

### A2. Existing US flows unchanged

- Admin → HCPs → Import. Country toggle defaults to "United States (NPI)". Upload a normal US NPI roster. **Expected**: created rows have `country='US'` + `nationalIdType='NPI'` in the DB; visible in `/admin/hcps` list without any filter.
- `/admin/hcps` list without a country param returns all US HCPs (same as today).
- `/admin/hcps/[id]` detail page for a US HCP renders `NPI: 1234567890` at the top.

### A3. Existing clients still function

- Load any existing client's detail page. **Expected**: `defaultCountry='US'` populated (from migration default). Everything below Client Info card unchanged.

## Phase B — CA path (net-new)

### B1. Create a Canadian client

1. Admin → Clients → New.
2. Fill in "Sun Pharma Canada" or similar.
3. Set **HCP Country** to "Canada (MINC)".
4. Save.
5. **Expected**: `Client.defaultCountry='CA'` in DB.

### B2. Import a Canadian roster

Prepare a CSV:

```
NPI,First Name,Last Name,Email,Specialty,City,State
CA-MD-1234-567-8,Test,Physician,test.ca@e2etest.example.com,Ophthalmology,Toronto,ON
CAMD12345680,Test2,Physician2,test2.ca@e2etest.example.com,Optometry,Vancouver,BC
```

1. Admin → HCPs → Import.
2. Toggle **HCP Country** to "Canada (MINC)".
3. Upload the CSV.
4. **Expected**: 2 rows created, 0 errors. DB rows have `country='CA'`, `nationalIdType='MINC'`, `npi` stored as `CAMD12345678` / `CAMD12345680` (normalized).

### B3. Detail page renders MINC

Click into one of the newly-imported rows.

**Expected**: header reads `MINC: CA-MD-1234-567-8`. Info card labels the field as `MINC`.

### B4. Country filter on list

- `GET /api/v1/hcps?country=CA` — returns only the 2 CA rows just imported.
- `GET /api/v1/hcps?country=US` — returns all US HCPs, no CA leakage.
- `GET /api/v1/hcps` (no filter) — returns everything (backward compat).

### B5. Bad MINC rejected

Upload a CSV with `USMD12345678` (wrong country prefix) as the identifier.

**Expected**: row lands in `errors[]` with the MINC-format message. `created=0`. Batch didn't crash (status 200, not 503).

### B6. HcpAlias MERGE country isolation

- Create a US HCP with name "John Test-Canada-Alias".
- Upload a CA CSV with an HCP named exactly "John Test-Canada-Alias".
- **Expected**: CA row is CREATE (new HCP), NOT merged into the US HCP. Confirm by inspecting DB: two rows with same first/last name but different `country`.

## Phase C — 24h watch

### C1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### C2. No new error patterns

- Watch for any `PrismaClientKnownRequestError` on `Hcp.create` — could indicate the Zod schema is rejecting existing US callers that don't pass `country`.
- Watch for 500 on `/hcps/import` — indicates a code path missed the country wiring.

## Rollback gate

If A1–A3 don't pass, redeploy `prod-rel-4.1.47` (v1.17.67). **Leave schema widened.** Old code ignores the new columns. Do NOT try to `SET NOT NULL` back if any CA rows exist.

No data destruction.
