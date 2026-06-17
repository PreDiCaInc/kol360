# prod-rel-4.1.29 — Soak Checks (v1.17.49)

Tag at the merge commit on `main`. Two paired fixes for the lite-client TEAM_MEMBER / CLIENT_ADMIN journey: frontend role-based redirect + backend DA filter broadening. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.49", ... }
```

### A2. PLATFORM_ADMIN smoke (no behavior change)

1. Log in as a PLATFORM_ADMIN.
2. Lands on `/admin` → platform dashboard renders as before (stats, system health, quick actions).
3. Navigate to `/admin/dashboards` → DA picker lists every active DA (no regression).

### A3. Lite-client TEAM_MEMBER journey (the fix)

Set up (one-time, if not already in place from pteam test session):

1. As PLATFORM_ADMIN, ensure a lite client exists: `isLite=true`, with at least one `KolAnalysis` linked to a DA.
2. Ensure a TEAM_MEMBER user is assigned to that client (e.g. `sam@bio-exec.com` for `Bio-Exec` test setup).

Repro:

1. Log out, log in as the TEAM_MEMBER.
2. **Expected — Bug #1 fix**: URL settles at `/admin/dashboards` (NOT `/admin`). The platform-admin stats cards never appear; user sees the Insights landing.
3. **Expected — Bug #2 fix**: the DA picker on `/admin/dashboards` shows the DA(s) their `KolAnalysis` is linked to (e.g. "Dry Eye" for the Bio-Exec setup).
4. Click into the DA → Insights tabs (Sociometric Summary, KOL Explorer, Demographics, KOL Profile, Benchmarking) render normally. `campaignCount: 0` for the DA is OK — KOL data comes from the analysis, not campaigns.

### A4. CLIENT_ADMIN journey (same pattern, broader role)

1. Log in as a CLIENT_ADMIN whose client also has at least one KolAnalysis.
2. Same expected behavior as A3 — lands on `/admin/dashboards`, sees the DA, can drill into Insights.

### A5. PLATFORM_ADMIN impersonation (unchanged behavior)

1. As PLATFORM_ADMIN, click the impersonate-client switcher and impersonate a lite client.
2. **Expected**: URL stays on `/admin` (impersonating PLATFORM_ADMIN's actual role is still PLATFORM_ADMIN; the redirect only fires when `role !== 'PLATFORM_ADMIN'`). The impersonation banner shows; existing impersonation behavior unchanged from 4.1.28.
3. Navigate to `/admin/dashboards` manually → DA picker should now include the impersonated client's KolAnalysis-only DAs (this is the same OR clause kicking in via `clientFilter = { clientId: user.tenantId }` — note: impersonation rewrites `tenantId` for the client-side fetches, so the broadened filter helps here too).

## Phase B — Functional smoke (≤30 min after A passes)

### B1. Existing customer (Sun Pharma) Insights pages

1. Log in as a Sun Pharma CLIENT_ADMIN (or impersonate as PLATFORM_ADMIN).
2. `/admin/dashboards` → DA picker shows Dry Eye + any other DAs paired to Sun Pharma Campaigns (unchanged from 4.1.28 behavior).
3. Sociometric Summary, KOL Explorer, Demographics tabs render — no regression in count, layout, or data shape.

### B2. Non-lite client that has a KolAnalysis but no Campaign (edge case)

If no such customer exists today, skip. If one does:

- Their DA(s) tied via KolAnalysis only would now surface on `/admin/dashboards` (previously hidden). Confirm this is desired before signing off — it's likely the right behavior ("we have analysis data for this DA" is the meaningful signal) but worth a visual check.

## Phase C — 24h watch

### C1. App Runner deploy health

```bash
# api
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING

# web
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-web/9fe5595685ad4ab89cdb29333ab1f5f6" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### C2. No new error patterns

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?ERROR ?error ?Error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

Look for any new "disease-areas" / Prisma-related errors. The OR-clause is a benign expansion of the WHERE; no new error surface expected.

## Rollback gate

If A1–A3 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.28` (v1.17.48).

- Effect: lite-client users revert to landing on `/admin` (platform dashboard, confusing) and seeing `[]` on `/admin/dashboards`.
- No data loss, no migration to undo.
