# prod-rel-4.1.51 — Soak Checks (v1.17.71)

Tag at the merge commit on `main`. Curation-svc integration hardening. **No migration.**

## Phase A — Sanity (backward compat + regression)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.71", ... }
```

### A2. curation get-beid backward compat (pre-v1.17.69 shape)

A caller that omits both `country` + `nationalIdType` still works. Both fields default to `'US'`/`'NPI'` (paired defaults, so the new superRefine passes).

```bash
curl -X POST https://kol360.bio-exec.com/api/v1/hcps/get-beid \
  -H "Authorization: Bearer $M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Backward",
    "lastName": "Compat",
    "specialty": "Ophthalmology",
    "npi": "9999998001",
    "discoveredFrom": { "source_url": "https://example.com/bc", "scraper_run_id": "soak-bc", "ai_verification_snapshot_url": "https://example.com/bc.json", "captured_at": "2026-07-04T00:00:00Z" }
  }'
```

Expected: 201 with `country: "US"`, `nationalIdType: "NPI"` in the response body.

### A3. US regression — CSV imports / Insights unchanged

Same US-only sanity as 4.1.49 Phase A. No changes to those code paths in this release; run one dashboard load + one HCP import to confirm no serialization regression from the response-shape widening.

## Phase B — Curation pairing enforcement (new v1.17.71 surface)

### B1. Paired CA + MINC accepted

```bash
curl -X POST https://kol360.bio-exec.com/api/v1/hcps/get-beid \
  -H "Authorization: Bearer $M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Soak",
    "lastName": "CAPaired",
    "specialty": "Ophthalmology",
    "state": "QC",
    "npi": "CAMD99000101",
    "country": "CA",
    "nationalIdType": "MINC",
    "discoveredFrom": { "source_url": "https://example.ca/soak", "scraper_run_id": "soak-ca", "ai_verification_snapshot_url": "https://example.ca/soak.json", "captured_at": "2026-07-04T00:00:00Z" }
  }'
```

Expected: 201 with `"country": "CA"`, `"nationalIdType": "MINC"` in the response body.

### B2. Unpaired US + MINC rejected

```bash
curl -X POST https://kol360.bio-exec.com/api/v1/hcps/get-beid \
  -H "Authorization: Bearer $M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Bad",
    "lastName": "Pair1",
    "npi": "CAMD99000201",
    "country": "US",
    "nationalIdType": "MINC",
    "discoveredFrom": { "source_url": "https://example.com/bp1", "scraper_run_id": "soak-bp1", "ai_verification_snapshot_url": "https://example.com/bp1.json", "captured_at": "2026-07-04T00:00:00Z" }
  }'
```

Expected: 400 with message `"nationalIdType: country and nationalIdType must be paired: 'CA' → 'MINC', 'US' → 'NPI'"`.

### B3. Unpaired CA + NPI rejected

```bash
curl -X POST https://kol360.bio-exec.com/api/v1/hcps/get-beid \
  -H "Authorization: Bearer $M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Bad",
    "lastName": "Pair2",
    "npi": "9999998002",
    "country": "CA",
    "nationalIdType": "NPI",
    "discoveredFrom": { "source_url": "https://example.com/bp2", "scraper_run_id": "soak-bp2", "ai_verification_snapshot_url": "https://example.com/bp2.json", "captured_at": "2026-07-04T00:00:00Z" }
  }'
```

Expected: 400 with the same pairing message.

### B4. Response echo on dedup path

Re-post the payload from B1 (same MINC). Response should now have `"wasExisting": true` AND `"country": "CA"`, `"nationalIdType": "MINC"` reflecting the **stored** row, not the request.

### B5. Cleanup

```sql
DELETE FROM "Hcp" WHERE "firstName" = 'Soak' AND "lastName" = 'CAPaired';
DELETE FROM "Hcp" WHERE "firstName" = 'Backward' AND "lastName" = 'Compat';
-- B2 + B3 never persisted (400 rejections), no cleanup needed.
```

## Phase C — 24h watch

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

CloudWatch — watch for any spike in 4xx from `/api/v1/hcps/get-beid`. Zero prod curation traffic today (curation-svc not integrated yet), so any 4xx would indicate an internal test or an unexpected caller. Zero 5xx expected.

## Rollback gate

If A1/A2 don't pass, redeploy `prod-rel-4.1.50` (v1.17.70). Curation integration reverts to "pairing documented but unenforced." No data destruction; the response echo fields simply vanish, and callers that ignored them (all of them today) are unaffected.
