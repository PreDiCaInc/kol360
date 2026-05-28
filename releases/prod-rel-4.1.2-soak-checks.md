# prod-rel-4.1.2 — Soak Checks (v1.17.1)

Tag at [`f2922d8`](https://github.com/PreDiCaInc/kol360/commit/f2922d8). Scoped to what v1.17.1 changes vs `prod-rel-4.1.1` (v1.17.0). Small surface area — no migrations.

## What v1.17.1 changed (the universe of risk)

1. **Segment-score importer** — within-file dedup added. Last row wins. Response now has `deduped` count.
2. **Backend `/health/full` gate** — strict-equality `NODE_ENV==='production'` flipped to dev-allowlist (`!['development','test'].includes(NODE_ENV)`). Staging now enforces token check.
3. **Web `/health/status` proxy** — forwards `HEALTH_CHECK_TOKEN` as `Authorization: Bearer` to backend.
4. **Insights "Clear filters" button** — outline variant + full label.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health  # prod API
# Expected: { "status": "ok", "version": "1.17.1", ... }
```

Web version — open `https://kol360.bio-exec.com` and check the footer (or `/admin` header) for the build version. Should also read `1.17.1`.

### A2. AWS env var change applied

Before opening `/admin/health/status`, confirm `HEALTH_CHECK_TOKEN` is set on the **test** App Runner service (`kol360-api-test`) — the proxy will go red on staging otherwise. Prod's already had it; this just brings test into parity.

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api-test/bcc7d66db0844252adfc0284464719ea" \
  --region us-east-2 --profile koluser \
  --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables.HEALTH_CHECK_TOKEN' \
  --output text
# Expected: a non-empty value (not None)
```

If None: rotate or copy from prod, then `start-deployment` on `kol360-api-test`.

### A3. Admin health-status widget green

Log in as platform admin → `/admin/health/status` (or whatever the widget surfaces in your shell). Should show **green** on both prod and test now. If staging is red after A2 → the env var didn't propagate; restart the service.

---

## Phase B — Functional smoke (~10 minutes)

### B1. Segment-score import — dedup actually works

Take any disease area you've been importing for (Dry Eye is a good one). Build a tiny test CSV with one NPI listed twice with different score values:

```csv
NPI,Publications,Clinical Trials,Trade Pubs,Org Leadership,Org Awards,Conference,Social Media,Media Podcasts
1234567890,10,20,30,40,50,60,70,80
1234567890,99,99,99,99,99,99,99,99
9876543210,5,5,5,5,5,5,5,5
```

(use real NPIs from your prod data — pick 2 HCPs that already exist for the DA)

Import via `/admin/hcps` → "Import Segment Scores":

- **Expected:** import succeeds (no Prisma unique-constraint error)
- **Expected:** result toast / response shows `deduped: 1` (or similar wording — the duplicate row collapsed)
- **Expected:** the surviving row for the duplicated NPI uses the **second** set of values (99s, not 10/20/30...)
- **Verify in DB:**
  ```sql
  SELECT "hcpId", "diseaseAreaId", "scorePublications", "scoreClinicalTrials"
    FROM "HcpDiseaseAreaScore"
   WHERE "hcpId" = (SELECT id FROM "Hcp" WHERE npi = '1234567890')
     AND "diseaseAreaId" = '<your-da-id>';
  -- Expected: scorePublications=99, scoreClinicalTrials=99 (the SECOND row's values)
  ```

**Pre-fix behavior would have been:** import errors out with a Prisma unique-constraint exception on the second row. Post-fix: clean dedup, last-row-wins.

### B2. Insights "Clear filters" button visible

Open `/admin/insights` for any disease area:

1. Apply any filter (state, specialty, score range — whatever's available)
2. Look at the filters bar — **"Clear filters"** button should be visible (outline border, not muted)
3. Click it — all filters reset, button disappears (it only shows when filters are active)

### B3. KOL Analysis / lite-client — unchanged (regression check)

Same as 4.1.1 soak: pick one customer's lite portal + one KOL Analysis dashboard. They should look identical to 4.1.1. No code in 4.1.2 touches those paths.

---

## Phase C — Background watch (24-48h)

### C1. Segment-import errors

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"import-segment-scores" ERROR' \
  --query 'events[*].message' --output text | tail -20
```

Expected: zero or only legitimate errors (malformed CSV, missing NPI column). If you see Prisma unique-constraint errors → dedup didn't apply somewhere; page me with the import payload.

### C2. Backend `/health/full` 401 rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"/health/full" 401' \
  --query 'events[*].message' --output text | tail -20
```

Expected: occasional 401s only from external scanners / unauthed probes. Should NOT see 401s from `kol360-web` user-agent — that would mean the web proxy isn't forwarding the token (fix-1 regressed somehow).

### C3. Admin status-widget stability

Spot-check `/admin/health/status` 2-3 times over 24h. Should stay green on both prod and test. Going red intermittently = backend `/health/full` is timing out or the token mismatch is back.

---

## Rollback criteria

Roll back to `prod-rel-4.1.1` **only if**:

- A1 fails — wrong version reported by `/health`
- B1 fails — segment import errors on a deduped CSV (the core fix didn't work)
- C2 shows persistent `kol360-web → /health/full` 401s (proxy regression)

**Rollback procedure:** redeploy v1.17.0 (4.1.1). No data-state divergence — code-only patch. Done in minutes.

**Note on rolling back fix-2 (backend gate):** if you roll back the backend, the staging `HEALTH_CHECK_TOKEN` env var stays set but harmless — old code still uses strict-equality which skips the check for staging. Nothing breaks.

---

## When to declare soak passed

Recommend **2-3 business days** with all of these holding:

- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows no segment-import errors + no proxy 401s + widget stays green

After 4.1.2 soaks: **Phase 3 arc + 4.1.1 follow-ups all done.** Nothing queued behind it.
