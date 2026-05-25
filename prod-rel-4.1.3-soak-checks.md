# prod-rel-4.1.3 — Soak Checks (v1.17.2)

Tag at [`3516fe7`](https://github.com/PreDiCaInc/kol360/commit/3516fe7). Scoped to what v1.17.2 changes vs `prod-rel-4.1.2` (v1.17.1). Code-only patch, no migrations. **P1 hotfix at the top — priority signal.**

## What v1.17.2 changed (the universe of risk)

1. **HCP CSV importer (`HcpService.importFromFile`)** — local credential-form normalizer deleted; all 3 write paths (CREATE/UPDATE/MERGE) now normalize via canonical `normalizeHcpSpecialty` at validation; out-of-domain inputs land as per-row errors.
2. **5 analysis-backed insights endpoints** — return 400 on missing `clientId` (was: silent `{0,0,0, notConfigured:true}` shape).
3. **Frontend insights hooks** — gated on `clientId`; `useKolExplorer` signature standardized.
4. **Frontend insights surfaces** — IntroductionTab duplicate tiles removed; KOL Explorer + ProfileView forward `clientId` end-to-end; Demographics + Leader Rankings filter bars match the v1.17.1 "Clear filters" visibility fix.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.2", ... }
```

Web — open `https://kol360.bio-exec.com`, check the footer / admin header version → should also read `1.17.2`.

### A2. P1 priority signal — HCP CSV import works again

This is the headline fix. Test with a real CSV that includes at least one NPI matching an existing prod HCP **and** uses any non-canonical specialty form (`'Optometrist'`, `'OD'`, `'MD'`, etc.) — that's the exact shape that was 503-ing.

Two ways to verify:

**Option 1 — via admin UI (recommended):**
1. Log in as platform admin → `/admin/hcps` → "Import HCPs"
2. Upload a CSV with 5-10 rows where at least one NPI matches an existing HCP and at least one specialty is `Optometrist` / `OD` / `MD` (real NPI export shape).
3. **Expected:** success toast with non-zero `updated` count, zero unexpected errors. (Out-of-domain rows like `Cardiology` should appear as per-row errors in the response, not crash the upload.)
4. **Pre-fix behavior was:** generic HTTP 503 error toast, zero rows imported.

**Option 2 — via SQL spot-check:**
```sql
-- All specialty values written in the last hour should be canonical or NULL.
SELECT specialty, COUNT(*) FROM "Hcp" WHERE "updatedAt" > NOW() - INTERVAL '1 hour' GROUP BY specialty;
-- Expected: only Optometry / Ophthalmology / NULL — nothing else.
```

### A3. Insights Dashboard — backend 400 contract

Direct API spot-check:
```bash
# Missing clientId → 400 with error envelope (was: 200 + silent-zero shape pre-fix)
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/<dryEyeDaId>/summary"
# Expected: HTTP 400

# Same with clientId → 200
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/<dryEyeDaId>/summary?clientId=<sunPharmaClientId>"
# Expected: HTTP 200
```

---

## Phase B — Functional smoke (~10 minutes)

### B1. Insights Dashboard surfaces — real data populates

Open `/admin/insights/<dryEyeDA>` as platform admin:

1. Select **Sun Pharma** (or any client with a configured analysis) from the client picker.
2. Dashboard header tiles (Total KOLs / Respondents / Nominations) — populate with non-zero numbers (was: also 0/0/0 pre-fix if the wrong code path fired; now load the same numbers as the underlying analysis).
3. **Introduction tab** — should show the Purpose + Methodology cards only (the duplicate tiles section is now removed; this is intentional).
4. **Total Weighted Score tab** — KOL list table populates with rows (was: empty pre-fix).
5. Click any KOL name → profile view opens, KOL combobox at top shows real names (was: empty pre-fix).
6. **Demographics** + **Sociometric Leaders** tabs — when any filter is active, a clearly visible outline **"Clear filters"** button appears (was: muted ghost "Clear All" that customers couldn't find).

### B2. Insights — "No analysis configured" path still works

Pick a (client, DA) pair that doesn't have a configured KolAnalysis. Open the dashboard. Expected: "No analysis configured" prompt with the link to KOL Analyses (the existing `notConfigured: true` UI path — verifies the contract distinguishes "missing clientId → 400" from "configured but no analysis → 200 + notConfigured: true").

### B3. KOL Analysis dashboard — unchanged (regression check)

Pick one customer's KOL Analysis. Verify tiles + top KOLs list look identical to 4.1.2. No code in 4.1.3 touches this path.

### B4. Lite client portal — unchanged (regression check)

Pick one lite-client account that's been actively viewed. Verify portal loads, scores look the same as 4.1.2. No code in 4.1.3 touches this path.

---

## Phase C — Background watch (24-48h)

### C1. HCP CSV import 503 rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"/api/v1/hcps/import" 503' \
  --query 'events[*].message' --output text | tail -20
```

Expected: **zero 503s** on `/api/v1/hcps/import`. Pre-fix, this was firing on every upload. If you see any → page me; the fix didn't take or a new write path is bypassing.

### C2. Specialty CHECK constraint hits

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"Hcp_specialty_check"' \
  --query 'events[*].message' --output text | tail -20
```

Expected: zero (or one or two stale-tab tail-offs immediately after deploy). After 30 min: **zero persistent hits**. Persistent hits = there's still a write path bypassing normalization. Page me.

### C3. Insights endpoint 400 rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"/api/v1/insights" 400 "clientId"' \
  --query 'events[*].message' --output text | tail -20
```

Expected: a small trickle as stale browser tabs / bookmarks hit the endpoints without clientId. Should be **bounded** (not growing over the 24h window). If it grows: a frontend caller is missing the `enabled: !!clientId` gate.

---

## Rollback criteria

Roll back to `prod-rel-4.1.2` **only if**:

- A1 fails — wrong version reported by `/health`
- A2 fails — CSV import still 503s (the fix didn't take)
- B1 fails — insights surfaces empty when they should have data (regression in the prop-forward fix)
- C1 shows persistent 503s on the import endpoint

**Rollback procedure:** redeploy v1.17.1 (4.1.2). No data-state divergence — code-only patch.

**Note: rolling back returns the P1.** If 4.1.3 itself introduces a new regression that's worse than the 503, rollback wins. Otherwise prefer a hotfix-forward (small fix on top of 4.1.3, cut as 4.1.4).

---

## When to declare soak passed

Recommend **2-3 business days** with all of these holding:

- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows zero CSV import 503s + zero persistent CHECK hits + bounded insights 400 rate
- One affected admin user (Jen Pikor, etc.) confirms they can upload a CSV successfully

After 4.1.3 soaks: nothing else queued. Phase 3 arc + all 4.1.x follow-ups done.
