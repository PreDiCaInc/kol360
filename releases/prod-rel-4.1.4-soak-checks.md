# prod-rel-4.1.4 — Soak Checks (v1.17.3)

Tag at the v1.17.3 merge commit on `main`. Scoped to what v1.17.3 changes vs `prod-rel-4.1.3` (v1.17.2) — **UI-only**, no backend changes, no migrations. Short soak window suffices.

## What v1.17.3 changed (the universe of risk)

1. **Insights "Clear filters" UX** — new shared `FilterClearControls` component applied to 5 surfaces (global filters, Demographics, Dynamic Benchmarking, Total Weighted Score / KOL Explorer, Sociometric Leaders). Two of those surfaces previously had no Clear button at all.
2. **Sidebar nav** — disabled "Insights" link enabled. "Insights" + "KOL Analyses" grouped under a new collapsible "KOL Insights" parent with View + Configure children. CLIENT_ADMIN sees View only.

No other change.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.3", ... }
```

Web — open `https://kol360.bio-exec.com`, check the footer / admin header version → should also read `1.17.3`.

### A2. Sidebar nav shape

Log in as platform admin. Sidebar should show:

- `Dashboard` (`/admin`) — unchanged at top
- ...
- `KOL Insights ▾` — **new collapsible** (chevron rotates on click)
  - `View` → `/admin/dashboards`
  - `Configure` → `/admin/kol-analysis`
- `Users`

The old top-level `Insights` (disabled grey item) and `KOL Analyses` should be **gone**. If either still shows: cache issue — hard refresh.

Log in as CLIENT_ADMIN (or impersonate one). `KOL Insights ▾` should show **only `View`** (Configure is platform-admin-only).

---

## Phase B — Functional smoke (~10 minutes)

### B1. Clear filters — visible on every insights surface

For each of the 5 tabs below, apply at least one filter and verify the Clear button is **clearly visible** (right-anchored, default-size, filled secondary background, with count badge like `Clear filters (3)`):

| # | Tab | Surface to test |
|---|---|---|
| 1 | (any) | Top-of-page **Global filters** bar above the tabs |
| 2 | Demographics | Filter bar at top of the tab |
| 3 | Dynamic Benchmarking | Filter bar at top of the tab |
| 4 | **Total Weighted Score** | Top right (next to Export Excel) — **new in 4.1.4** |
| 5 | **Sociometric Leaders** | Card header top right (next to Export Excel) — **new in 4.1.4** |

For each surface:
- Apply 2-3 filters → button appears with correct count (e.g. `Clear filters (3)`)
- Active filter chips appear below the filter inputs, each clickable with X
- Click one chip → that single filter clears, count decrements
- Click the Clear button → all filters reset, button + chip row disappear

### B2. Insights Dashboard data — unchanged regression check

Pick any (client, DA) pair with a configured KOL Analysis (e.g. Sun Pharma + Dry Eye). Walk through each tab:
- Numbers, charts, tables look identical to what was on 4.1.3 (we didn't touch the data pipeline — only filter chrome)
- No new 500s in browser console

### B3. KOL Analyses (Configure) — unchanged regression check

`KOL Insights ▾ → Configure` should open the existing KOL Analyses list at `/admin/kol-analysis`. Pick any analysis → detail view loads normally. The Configure tab is **the same page** as before; only the nav path to it changed.

### B4. HCP CSV import — still works (4.1.3 P1 didn't regress)

Quick spot-check: upload a small CSV with at least one existing-NPI row containing a role-form specialty (`Optometrist` / `OD` / `MD`). Should succeed with `updated >= 1`, no 503. (This was the 4.1.3 hotfix; smoke-checking that nothing in 4.1.4's UI work disturbed it.)

---

## Phase C — Background watch (24h)

Light watch — UI-only patch.

### C1. Web 500 rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-web/9fe5595685ad4ab89cdb29333ab1f5f6/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '" 500 "' \
  --query 'events[*].message' --output text | tail -20
```

Expected: zero or unchanged from the 4.1.3 baseline. Any new spike → something in the shared `FilterClearControls` or sidebar rewrite is throwing on render. Page me.

### C2. API error rate — unchanged

No backend changes; API error rate should be identical to the 4.1.3 baseline. If it changes, the cause is unrelated to this deploy.

---

## Rollback criteria

Roll back to `prod-rel-4.1.3` **only if**:

- A1 fails — wrong version reported
- A2 fails — sidebar rendering broken or missing items
- B1 fails on multiple surfaces — Clear filters component is throwing
- C1 shows a spike in web 500s tied to the deploy timestamp

**Rollback procedure:** redeploy v1.17.2 (4.1.3). No data-state divergence. Done in minutes.

---

## When to declare soak passed

Recommend **1-2 business days** with:
- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows no new web 500 spike
- At least one customer has used the Insights Dashboard since deploy without flagging a regression

After 4.1.4 soaks: nothing queued. The Insights surface arc is complete.
