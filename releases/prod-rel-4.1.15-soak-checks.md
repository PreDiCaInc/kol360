# prod-rel-4.1.15 — Soak Checks (v1.17.32)

Tag at the v1.17.32 merge commit on `main`. Three Insights polish items — Sociometric matrix column reorder + Biased column + full-list exports with NPI across all four export buttons. **No DB migration.**

## What 4.1.15 changed (the universe of risk)

1. **Sociometric Summary matrix** — score column order + new Biased column.
2. **Sociometric Summary export** — refetches with `limit=5000`; column order matches the visible matrix; NPI added.
3. **KOL Explorer export** — refetches with `limit=5000`; NPI added.
4. **LeaderTable** (Benchmarking + Sociometric Tables per-card exports) — new `getAllItemsForExport` callback; NPI column.
5. **Backend** — `Hcp.npi` surfaced on three Item responses (`sociometric-summary`, `leader-rankings`, `kol-explorer`).

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.32", ... }
```

Web — open `https://kol360.bio-exec.com`, footer / admin header should report `1.17.32`.

### A2. Sociometric Summary matrix column order

Open `/admin/insights/<sun-pharma-dry-eye>` → Sociometric Leaders tab → matrix table:

Header row should read: `# | Name | Specialty | Influencer Type | City | State | Total | National | Discussion | Advice | Rising Star | Referral | Social | Biased`

Pre-4.1.15: `Total | Discussion | Referral | Advice | National | Rising Star | Social` (no Biased).

### A3. Backend `npi` surfaced

```bash
TOK=...                # mint via cognito
DA=cml92bqnh00012msmjdr62saq; CL=cmmjq5hbl00jevqf87olee6yb
API=https://ik6dmnn2ra.us-east-2.awsapprunner.com

curl -s -H "Authorization: Bearer $TOK" \
  "$API/api/v1/insights/$DA/sociometric-summary?clientId=$CL&limit=1" | jq '.items[0] | {hcpId, npi, biasedLeaders}'
# Expected: { "hcpId": "...", "npi": "1234567890", "biasedLeaders": ... }
```

Pre-4.1.15: response lacked `npi`. `biasedLeaders` was already present.

---

## Phase B — Functional smoke (~10 minutes)

### B1. Sociometric Summary export → full filtered list with NPI

Sun Pharma + Dry Eye DA → Sociometric Leaders tab. With no filters applied, click Export.

- xlsx download begins.
- Open the file: row count should equal the Sun Pharma analysis's scored-KOL count (test env: 76; prod will be the Sun Pharma analysis size).
- Column order: `Rank | NPI | Name | Specialty | Influencer Type | City | State | Total | National | Discussion | Advice | Rising Star | Referral | Social | Biased`.
- NPI column populated for HCPs that have an NPI (`nomail@…` placeholder Hcps won't).

### B2. Sociometric export with active filters

Apply a Core Focus filter ("Dry Eye (...)"). Total in the table updates. Click Export.

- xlsx row count = the filtered total (the on-screen pagination total), NOT just the visible page.

### B3. KOL Explorer export → full filtered list with NPI

Same DA → KOL Explorer tab. Click Export.

- xlsx row count = the KOL Explorer total for the DA (test env: 76 for Sun Pharma).
- Column 2 is NPI; populated for HCPs that have one.

### B4. Benchmarking (Leader Rankings) per-card export

Same DA → Benchmarking tab → any nomination type card (e.g. National Leaders). Click the Export button on that card.

- xlsx row count = the total for that nomination type (not the 15-row visible page).
- Column 2 is NPI.

### B5. Sociometric Tables per-card export

Same DA → Sociometric Tables tab → any nomination type card. Click Export.

- Same expectation as B4.

### B6. Re-soak prior bundles

- **prod-rel-4.1.14**: Dry Eye filter still returns ~288 on Sun Pharma DA (not 0). Repeated query params on the wire (not CSV).
- **prod-rel-4.1.13**: Header brand badge still visible for TEAM_MEMBER; `/clients/me` returns shape.
- **prod-rel-4.1.12**: Demographics Practice Setting multi-select still works.

---

## Phase C — 24h watch

### C1. CloudWatch — API error rate

Standard 24h post-deploy watch. Baseline error rate is <0.5%.

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?error ?ERROR ?"5xx"' \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -50
```

### C2. Export endpoint load

The full-list exports issue a one-off `limit=5000` request per click. Watch for any abnormal spike in p95 latency on `/sociometric-summary`, `/leader-rankings`, `/kol-explorer` — none expected; the underlying queries are already capped at this limit in the schema.

### C3. Customer signal

If the original customer flagged the matrix column order / Biased column visibility / export truncation, loop back to confirm the fix lands as they expected.

---

## Rollback gate

If A1-A3 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.14`. Effects per the [handoff](prod-rel-4.1.15-handoff.md#rollback).
