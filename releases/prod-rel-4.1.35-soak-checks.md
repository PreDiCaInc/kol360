# prod-rel-4.1.35 — Soak Checks (v1.17.55)

Tag at the merge commit on `main`. Three Insights polish items. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.55", ... }
```

### A2. Item 1 — `Source: <Campaign>` line privacy strip

Affects the `(i)` popover on Benchmarking + Demographics tabs.

1. Log in as **PLATFORM_ADMIN**. Open Benchmarking on a customer dashboard (Sun Pharma → Dry Eye). Click any panel's `(i)` icon.
2. **Expected**: popover shows the question text AND a "Source: <Campaign Name>" line at the bottom.
3. Log out, log in as a **CLIENT_ADMIN** or **TEAM_MEMBER** of any client (e.g. sam@bio-exec.com). Open Benchmarking. Click any `(i)`.
4. **Expected**: popover shows the question text BUT no "Source:" line.
5. Same check on Demographics for both roles.

Backend smoke (paste an auth token):

```bash
# As PLATFORM_ADMIN
TOKEN_PA="<platform-admin token>"
DA="<da id>"
CLIENT="<client id>"
curl -s -H "Authorization: Bearer $TOKEN_PA" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/nomination-questions?clientId=$CLIENT" \
  | python3 -m json.tool | head -10
# Each item should include campaignName: "<some campaign name>"

# As CLIENT_ADMIN / TEAM_MEMBER
TOKEN_CA="<client admin token>"
curl -s -H "Authorization: Bearer $TOKEN_CA" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/nomination-questions" \
  | python3 -m json.tool | head -10
# Each item should have campaignName: "" (empty string)
```

### A3. Item 2 — Benchmarking `(i)` in the colored title bar

1. Open the Benchmarking tab on a customer dashboard.
2. **Expected**: each of the 7 panels has its colored title bar (yellow = National Leaders, blue = Discussion Leaders, etc.) with the bold white panel name. Right of the name, you should see a small white info icon.
3. Click the icon. Popover renders the survey question text.
4. **NOT expected**: a separate gray "(i) Survey question" row above the per-panel search input (that placement was removed).

### A4. Item 3 — Realtime search

Affects Sociometric Summary + "Total Weighted Score" (KOL Explorer) tab.

**Sociometric Summary**:
1. Open the Sociometric Leaders tab. Find the search input ("Search by name…").
2. Type a partial name (e.g., "John"). **Expected**: ~250ms after the last keystroke, the matrix filters to KOLs matching that search.
3. **NOT expected**: Apply button lighting up because you typed. Search bypasses the Apply gate.
4. Now pick a Specialty in the dropdown. **Expected**: Apply button lights up (this is a non-search filter, still gated).
5. Click Apply. Specialty filter commits. Search stays in effect.

**KOL Explorer (Total Weighted Score)**:
- Same expected behavior. Search bypasses Apply; specialty / state / influencer type / score ranges still gate on Apply.

### A5. Reset still clears search

1. With both search AND a specialty filter active, click **Reset**.
2. **Expected**: search input clears, specialty clears, table refreshes to unfiltered baseline.

## Phase B — Functional smoke (≤30 min)

### B1. Existing Insights surfaces unchanged

Spot-check that all 4 converted tabs (Sociometric, KOL Explorer, Demographics, Benchmarking) still render the same data they did on 4.1.34 with no filters applied. Only the search and (i) UX changed; all aggregations are byte-identical.

### B2. Lite-client journey unchanged

sam@bio-exec.com / Bio-Exec: full journey (4.1.29 + 4.1.30 fixes) still works end-to-end. Confirm A2 specifically — sam should NOT see source campaigns on (i) popovers.

## Phase C — 24h watch

### C1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### C2. No new errors

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?ERROR ?error ?Error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

No new error patterns expected. The route-level campaignName strip is a small map operation; the FE changes are placement + state-machine tweaks.

## Rollback gate

If A1–A5 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.34` (v1.17.54). The 3 fixes revert; existing 4.1.34 behavior returns.
