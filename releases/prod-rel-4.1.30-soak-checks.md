# prod-rel-4.1.30 — Soak Checks (v1.17.50)

Tag at the merge commit on `main`. P1 hotfix on 4.1.29: completes the lite-client journey end-to-end by broadening the access gate + 3 campaign-scoping service methods to the same OR / UNION pattern 4.1.29 used for `/disease-areas`. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.50", ... }
```

### A2. Lite-client TEAM_MEMBER journey (the fix)

Set up (already in place from 4.1.29 testing on prod):
- Bio-Exec lite client (`isLite=true`, 0 owned campaigns)
- KolAnalysis on Dry Eye, 6 included campaigns from other clients
- sam@bio-exec.com as TEAM_MEMBER assigned to Bio-Exec

Repro:
1. Log out, log in as sam@bio-exec.com.
2. **Expected (unchanged from 4.1.29)**: lands on `/admin/dashboards`, Dry Eye tile visible.
3. Click Dry Eye tile → `/admin/dashboards/insights/...`.
4. **Expected (the fix)**:
   - No "error loading data" toast/banner anywhere.
   - Summary tiles: totalCampaigns = 6, totalRespondents > 0 (if any of the 6 campaigns has completed survey responses), totalNominations > 0, totalKols = number of HCPs in the analysis (could be 0 if analysis hasn't been scored yet — that's a separate score-pipeline step, not a regression).
   - Sociometric Summary, KOL Explorer, Demographics, KOL Profile, Benchmarking tabs all render with real data (no "no data available" empty states caused by the access bug).

### A3. PLATFORM_ADMIN smoke (no behavior change)

1. Log in as PLATFORM_ADMIN.
2. Navigate to a regular client's DA (Sun Pharma → Dry Eye) via the impersonate-client switcher OR by passing `?clientId=...` on the Insights URL.
3. **Expected**: all Insights tabs render with the same numbers as 4.1.29. No regression.

### A4. Regular client smoke (Sun Pharma, B+L)

The semantic change for regular clients is: campaign-scoped aggregations now use `owned UNION analysis-included` instead of `owned only`.

For a client whose analysis-included set is a subset of their owned set (the common case), behavior is unchanged.

Repro:
1. Log in as a Sun Pharma CLIENT_ADMIN (or impersonate).
2. Open the Dry Eye dashboard.
3. **Expected**: totalCampaigns, totalNominations, totalRespondents read the same as they did on 4.1.29.
4. Same for B+L if they have an analysis on a DA you can verify.

If totalCampaigns DROPS for a regular client (analysis excluded some campaigns they own), that's still consistent with the analysis semantic — but flag if it's a surprise to anyone.

If totalCampaigns INCREASES (analysis includes campaigns from OTHER clients), the cross-tenant inclusion is now reflected. Flag for confirmation that this is desired.

## Phase B — Functional smoke (≤30 min)

### B1. Insights tabs each render for sam@bio-exec.com

- Sociometric Summary: list of KOLs (from the analysis's scored set) + filterable.
- KOL Explorer: same KOL list with score column + sortable.
- Demographics: charts populated (Practice Setting, Core Focus, Years In Practice, Patient Volume, Decile, etc.).
- Benchmarking (Leader Rankings): per-nomination-type cards each show a ranked KOL list.
- KOL Profile (click into any KOL): hero + nominators + nomination metadata sections all render.

### B2. Pre-existing customer dashboards unchanged

Quick visual on Sun Pharma + B+L: dashboard headers + filter dropdowns + tables look identical to 4.1.29.

## Phase C — 24h watch

### C1. App Runner deploy health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### C2. No 403/500 surge from Insights endpoints

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?Forbidden ?"500 " ?error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

Look for any sustained 403 or 500 patterns on `/api/v1/insights/...`. The 4.1.30 fix should REDUCE 403s (lite clients no longer hit them); no new 5xx class is expected.

## Rollback gate

If A1–A2 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.29` (v1.17.49). Effects:
- Lite-client Insights revert to 403 / empty.
- Regular clients unchanged.

No data destruction, no migrations to undo.
