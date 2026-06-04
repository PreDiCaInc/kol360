# prod-rel-4.1.12 — Soak Checks (v1.17.28, bundles v1.17.24 → v1.17.28)

Tag at the v1.17.28 merge commit on `main`. Five themes — Demographics filter fix, three missing graphs, Sociometric/Total-Weighted column reorder, Educational Resources chart layout, plus a sort-comparator sign fix. **No DB migration.**

## What 4.1.12 changed (the universe of risk)

1. **Demographics Practice Setting filter** — second unfiltered `useDemographics()` call provides dropdown options
2. **`getDemographics` SQL** — three of the B-remainder skeletons now actually return rows (educational, social media platforms, valuable content) by handling the real prod JSON shapes
3. **Insights table layouts** — Total column position + Sociometric Tables single-column grid
4. **`StackedBarChart`** — per-row height + Y-axis width + custom `WrappedTick` for long labels
5. **`getSociometricSummary` comparator** — sign fix, now matches `getKolExplorer` + `getLeaderRankings` shape

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.28", ... }
```

Web — open `https://kol360.bio-exec.com`, check footer / admin header → `1.17.28`.

### A2. Sociometric Summary Total sorts highest-first

Open `/admin/insights/<dry-eye-da>` for Sun Pharma → Sociometric Leaders tab → matrix table at the top.

- Default sort: Total column shows ▼ (desc arrow), and **top row's Total > bottom row's Total** within the page.
- Click Total header → flip to ▲ (asc). Top row's Total should now be the smallest.
- Click again → ▼. Highest at top again.

This is the v1.17.28 fix. Pre-fix, the desc arrow showed but the data sorted ascending.

---

## Phase B — Functional smoke (~10 minutes)

### B1. Demographics Practice Setting multi-select

Sun Pharma + Dry Eye → Demographics tab → Practice Setting filter:
1. Open the dropdown. All 9 distinct practice settings on prod should be visible (the v1.17.25 fix means the dropdown source is unfiltered).
2. Pick one option — chart re-renders narrowed.
3. **Open the dropdown again. All 9 options should still be there.** Pick a second. Chart re-renders to the union.
4. Pre-fix: after step 2 the dropdown showed only the one picked option, blocking step 3.

### B2. Demographics missing graphs now populated

Same DA. Scroll the Demographics tab past the categorical distributions:
- **Educational Resources (All)** card — should show ranked breakdown across 7 sources.
- **Educational Resources (Academic)** and **(Other)** cards — same shape, filtered by question text.
- **Top 5 Social Media Platforms** — populated with the per-rank stacked bars.
- **Valuable Social Media Content** — populated.
- **Objectivity Rating** — populated.

For Sun Pharma: 555 respondents on the educational question, 432 on social media + objectivity, 429 on valuable content. Expect non-empty charts on all five panels.

### B3. Educational Resources chart layout

In B2, the Educational Resources cards: each labeled bar's text should be readable on at most 2 word-wrapped lines (3 only for the longest ones), and the bars should align with the middle of each label block — no overlap between adjacent rows.

### B4. Total column positions

- **Sociometric Leaders matrix**: `# | Name | Specialty | Influencer Type | City | State | Total | Discussion | Referral | Advice | National | Rising Star | Social`
- **Sociometric Tables (per-nomination type)**: each card has `# | Name | Specialty | Influencer Type | State | Count` and grid is single-column (no horizontal scroll).
- **Benchmarking**: `# | Name | Specialty | City | State | Count`.
- **Total Weighted Score**: `# | Name | Specialty | Degree | City | State | Type | Total | (per-segment scores …)`.

### B5. Campaign Overview Exclude Internal Emails toggle is read-only for client roles

Log in as a CLIENT_ADMIN or TEAM_MEMBER. Open any campaign → Overview tab (the only tab they see).
- Toggle widget shows the current state.
- Toggle is **disabled** (cursor: not-allowed; reduced opacity). Clicking does nothing.
- Pre-fix: client roles could toggle this and trigger 403 from the API.

### B6. Re-soak prior bundles

- **prod-rel-4.1.11**: Demographics filter bar stays mounted across refetches (B12 from 4.1.11 soak). MultiSelects don't close after each pick.
- **prod-rel-4.1.10**: AR + AZ + CA state filter on Demographics doesn't 500.

---

## Phase C — Background watch (24h, light)

### C1. Insights endpoint error rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"/api/v1/insights/" 5' \
  --query 'events[*].message' --output text | tail -40
```

Expected: zero or unchanged from baseline. The B-remainder SQL changes are the largest surface in this drop; a 5xx spike with SQL stack traces means one of the JSON-shape branches hits an edge case we didn't see on prod data.

### C2. Sociometric Summary sort hits (informational)

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"sociometric-summary"' \
  --query 'events[*].message' --output text | wc -l
```

If users were silently working around the inverted-sort bug, expect usage to increase post-fix.

---

## Rollback criteria

Roll back to `prod-rel-4.1.11` (v1.17.23) **only if**:

- **A1** fails — wrong version reported
- **A2** fails — Sociometric Summary still sorts ascending when ▼ is shown (the v1.17.28 fix didn't take)
- **B1** fails — Demographics Practice Setting dropdown narrows after first pick
- **B5** fails — toggle still interactive for client roles (a UI regression in the role tightening from 4.1.11 — unlikely from this drop)
- **C1** — spike of /insights/ 5xx with SQL stack traces

**Rollback procedure:** redeploy `prod-rel-4.1.11` (v1.17.23). Sociometric Summary Total sort flips back to broken. Demographics filter narrows after first pick again. Educational + social media + valuable content + objectivity charts hide. Column positions revert. Educational chart labels overlap on long entries. The toggle becomes interactive for client roles again (visible regression of the role tightening soaked in 4.1.11). No data state to unwind.

---

## When to declare soak passed

Recommend **1 business day** with:
- Phase A passes immediately after deploy
- Phase B1–B5 visually confirmed on Sun Pharma + Dry Eye
- Phase B6 confirms no 4.1.10 or 4.1.11 regression
- Phase C1 within normal range

After 4.1.12 soaks: nothing currently queued for 4.1.13.
