# prod-rel-4.1.50 — Soak Checks (v1.17.70)

Tag at the merge commit on `main`. Follow-up to Phase 2 CA HCP support. **No migration.**

## Phase A — Sanity (US regression check)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.70", ... }
```

### A2. Lite HCP table unchanged for US clients

- Log into a Lite client dashboard. HCP scores table column 2 header reads **"NPI"** (US client → US HCPs → data-driven label falls to NPI).

### A3. Campaign Payments table unchanged for US campaigns

- Open any US campaign's Payments tab. Column 2 header reads **"NPI"**.
- Existing payment rows show correct NPI values (no display regression).

### A4. Nominations still create HCPs correctly

- Approve a nomination that mints a new HCP from a nominator's suggestion.
- Verify the new HCP row lands with `country='US'` + `nationalIdType='NPI'` in DB — same behavior as pre-4.1.50 for any US nomination (which is all of them today).

## Phase B — CA path (automated via e2e)

The manual CA-fixture SQL insertion + Insights isolation checks from 4.1.49's soak doc are now covered by `e2e/api/canada-hcp-isolation.test.ts`. Run via `tdct` after deploy verifies at 1.17.70:

```bash
cd e2e && pnpm test:workflow:test
```

Expected: 0 failures. The CA isolation test seeds `cme2e0ca0isolation001` with `country='CA'`, verifies:
- `GET /hcps?country=CA` returns it
- `GET /hcps?country=US` omits it
- US-client KOL Explorer omits it
- US-client Leader Rankings omits it
- US-client Sociometric Summary omits it
- US-client KOL Profile drill-down rejects it (404 or null)

...then cleans up. If the test skips (Prisma probe failed), the tunnel or DATABASE_URL is misconfigured — check the local env before proceeding.

## Phase C — 24h watch

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for any spike in 5xx from `/api/v1/lite/disease-areas/:id/scores` or `/api/v1/campaigns/:id/payments` — those two endpoints picked up an additive `hcp.nationalIdType` field in their responses; a spike would indicate a Prisma schema mismatch.

## Rollback gate

If A1–A4 don't pass, redeploy `prod-rel-4.1.49` (v1.17.69). Everything Phase 2 continues to work; you only lose the 3 small polish items.
