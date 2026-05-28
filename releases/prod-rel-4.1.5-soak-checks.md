# prod-rel-4.1.5 — Soak Checks (v1.17.4 + v1.17.5 bundled)

Tag at the bundled merge commit on `main`. Scoped to what v1.17.4 + v1.17.5 change vs `prod-rel-4.1.4` (v1.17.3). Bundle is code-only — no migrations.

## What changed (the universe of risk)

**v1.17.4:**
1. `nomination.service.ts:getStats` now applies `excludeInternalEmails` (was missing — tiles disagreed with list).
2. `nomination.service.ts:updateRawName` now writes audit log + accepts `actor` parameter.
3. Demographics + Dynamic Benchmarking single-selects → multi-select. Backend `RespondentFilters` shape changed: `string` fields → `string[]` (route accepts both names for transition).
4. `getFilterOptions` filters state options to US 50+DC.
5. `toTitleCase()` applied to city displays in insights.
6. KOL Explorer "All Types" placeholder → "Influencer Type".

**v1.17.5:**
1. Shared respondent-filter helpers extracted in `insights-report.service.ts`.
2. `getLeaderRankings` + `getSociometricSummary` accept optional `respondentFilters`; when active, counts are recomputed on the fly from filtered nominations (bypasses pre-aggregated `HcpAnalysisScore`).
3. Frontend: new "Respondent Filters" bar on Sociometric Leaders + Dynamic Benchmarking tabs.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.5", ... }
```

Web — check footer / admin header → `1.17.5`.

### A2. Bundle is reversible — quick sanity

```bash
# Confirm the migration list hasn't grown (we shipped no migrations)
psql -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3"
# Should be unchanged from prod-rel-4.1.4 baseline.
```

---

## Phase B — Functional smoke (~15 minutes)

### B1. Nominations tile / list agreement (v1.17.4 #1)

Pick a campaign with `excludeInternalEmails = true`. Open the Nominations page.
- Verify the **tile counts** (Matched / Excluded / Unresolved) **agree with the table row count** at the bottom.
- Pre-fix, tiles would include internal-respondent nominations while the table filtered them out → disagreement.

If your prod doesn't have a campaign with the flag on, you can toggle it on via the campaign detail page (Campaign > Settings > Exclude internal emails) and refresh.

### B2. updateRawName audit (v1.17.4 #2)

Rename any nomination via the "Edit nomination name" dialog. Then check the AuditLog table:

```sql
SELECT "userId", "action", "oldValues", "newValues", "createdAt"
FROM "AuditLog"
WHERE "action" = 'nomination.raw_name_updated'
ORDER BY "createdAt" DESC LIMIT 3;
```

Expected: a row with the renaming user's id, oldValues with the prior name, newValues with the new name.

### B3. Multi-select + US whitelist + city case (v1.17.4 #3-#5)

Open `/admin/insights/<dryEyeDA>` for Sun Pharma:
- **Demographics tab:** State / Role / Focus / Setting dropdowns are all multi-select. Pick 2 states → both apply.
- **State dropdown options:** scroll through — no non-US codes (no `AB`, `AU`, etc.).
- **Cities** in any table: rendered as `"Boston"` not `"BOSTON"` or `"boston"`.

### B4. "Influencer Type" placeholder (v1.17.4 #6)

KOL Explorer (Total Weighted Score tab): the influencer-type filter shows placeholder `"Influencer Type"` (was `"All Types"`).

### B5. Respondent filters on Sociometric + Dynamic Benchmarking (v1.17.5 — the headline)

Open `/admin/insights/<dryEyeDA>` for Sun Pharma:
- **Sociometric Leaders tab:** verify two stacked filter bars — "KOL Filters" + "Respondent Filters".
- Apply a respondent filter (e.g. **Role = Optometry**). The per-type counts in the table should **drop or stay equal** (filtered nominations are a subset). Total/regional columns drop accordingly.
- Add a second filter (e.g. **Practice Setting = Private Practice**). Counts drop further (or stay equal).
- Click **Clear filters**: both KOL-side and respondent-side filters clear, counts return to baseline.

- **Dynamic Benchmarking tab:** same shape. Pick a respondent filter; each of the 6 leader panels updates with filtered counts.

### B6. Respondent filter doesn't break the unfiltered path

Open Sociometric Leaders with NO respondent filters → counts should be IDENTICAL to what they were on prod-rel-4.1.4 (we didn't change the unfiltered path; only added an alternate path).

---

## Phase C — Background watch (24-48h)

### C1. Insights endpoint latency

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"/api/v1/insights/" "leader-rankings" reqTime' \
  --query 'events[*].message' --output text | tail -30
```

Expected baseline: a few hundred ms. With respondent filters active: small additional latency (~tens of ms for the extra `Nomination` query). If you see consistent >2s latencies on filter-active calls, flag — could indicate the filtered nomination set is much larger than expected.

### C2. Insights 500 rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"/api/v1/insights/" 500' \
  --query 'events[*].message' --output text | tail -20
```

Expected: zero or unchanged from baseline. Any new spike → the recompute path is throwing on a data shape we didn't anticipate.

### C3. Audit log writes

```sql
SELECT DATE_TRUNC('hour', "createdAt") AS hr, COUNT(*)
FROM "AuditLog"
WHERE "action" = 'nomination.raw_name_updated'
  AND "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hr ORDER BY hr DESC;
```

Expected: a few entries per hour during business hours, matching admin renaming activity. Zero = the audit write isn't firing.

---

## Rollback criteria

Roll back to `prod-rel-4.1.4` **only if**:

- A1 fails — wrong version reported
- B1 fails — tiles still disagree with list
- B5 fails on multiple analyses — respondent filter doesn't apply
- C1 shows consistent >2s latencies tied to filter-active calls
- C2 shows a new spike in insights 500s

**Rollback procedure:** redeploy v1.17.3. No data-state divergence. Done in minutes.

---

## When to declare soak passed

Recommend **2 business days** with:
- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows no latency or 500 spikes; audit log entries present from actual usage
- At least one admin user has used the Respondent Filters feature without reporting an issue

After 4.1.5 soaks: PR C (Bug 3 — rename dead-end UX) is the next queued item. Per-client `Client.region` setting in a small focused PR after that.
