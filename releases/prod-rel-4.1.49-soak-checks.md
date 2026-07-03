# prod-rel-4.1.49 — Soak Checks (v1.17.69)

Tag at the merge commit on `main`. Phase 2 of Canada HCP support. **No migration.**

## Phase A — Sanity (US regression check)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.69", ... }
```

### A2. US-only Insights unchanged

- Load Sun Pharma → Dry Eye Insights dashboard. Confirm KOL Explorer / Leader Rankings / Sociometric Summary / Demographics / KOL Profile drill-down all render the same names/counts as pre-4.1.49. Spot-check Karpecki + Donnenfeld.

### A3. US-only nomination matching unchanged

- Open a nomination pending manual match in any US campaign. Auto-suggestions should return the same candidate list as pre-4.1.49.

### A4. Curation get-beid backward-compat

- Trigger a curation-svc get-beid with no `country`/`nationalIdType` in the body. Should return the same 201 as before + create HCP with `country='US'` + `nationalIdType='NPI'`.

## Phase B — CA path (inserted fixture)

### B1. Insert CA test HCP

```sql
INSERT INTO "Hcp" (id, "beId", npi, "nationalIdType", country, "firstName", "lastName", email, specialty)
VALUES ('cm_ca_soak_test', 'BE-999999', 'CAMD99999999', 'MINC', 'CA', 'Soak', 'CATest', 'ca.soak@e2etest.example.com', 'Ophthalmology');
```

### B2. Country filter on HCP list

- `GET /api/v1/hcps?country=CA` — returns the fixture (may include other CA HCPs if any).
- `GET /api/v1/hcps?country=US` — does NOT include the fixture.
- `/admin/hcps?country=CA` — column header reads **MINC**.

### B3. Insights isolation

- Load any US-scoped Insights dashboard. Search for "Soak CATest" in KOL Explorer. **Expected**: no results.
- Load KOL Profile drill-down URL with `hcpId=cm_ca_soak_test` on a US dashboard. **Expected**: 404 or null profile (rejected as cross-country).

### B4. Curation get-beid with country=CA

```bash
curl -X POST https://kol360.bio-exec.com/api/v1/hcps/get-beid \
  -H "Authorization: Bearer $M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "CANoDedup",
    "country": "CA",
    "nationalIdType": "MINC",
    "npi": "CAMD12345678",
    "discoveredFrom": { "source_url": "https://example.ca", "scraper_run_id": "soak", "ai_verification_snapshot_url": "https://example.ca/snap", "captured_at": "2026-07-03T00:00:00Z" }
  }'
```

Expected: 201, wasExisting=false, HCP created with `country='CA'` + `nationalIdType='MINC'`.

### B5. Cleanup

```sql
DELETE FROM "Hcp" WHERE id = 'cm_ca_soak_test';
DELETE FROM "Hcp" WHERE "firstName" = 'Test' AND "lastName" = 'CANoDedup';
```

## Phase C — 24h watch

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for any spike in 5xx from `/api/v1/insights/*` or `/api/v1/hcps/get-beid` — would indicate the new country-filter path is choking.

## Rollback gate

If A1–A3 don't pass, redeploy `prod-rel-4.1.48` (v1.17.68). Country filtering reverts to the "safe because zero CA data" state. No data destruction.
