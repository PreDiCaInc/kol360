# prod-rel-4.1.20 — Soak Checks (v1.17.40)

Tag at the merge commit on `main`. `scoreSurvey` formula rewrite + Insights methodology tooltips + sticky-Name on KOL Explorer. **No migrations.**

## What 4.1.20 changed

1. **`scoreSurvey` formula** (`apps/api/src/services/kol-analysis.service.ts`): switched from "avg of per-type-normalized scores across 7 types" to `(sum of nominations across 4 counted types) / max-such-sum × 100`.
2. **Counted (4):** NATIONAL_LEADER, DISCUSSION_LEADERS, ADVICE_LEADERS, RISING_STAR.
3. **Excluded (4):** REFERRAL_LEADERS, SOCIAL_LEADER, BIASED_LEADER, REGIONAL_LEADER.
4. **Per-type score columns** (`scoreNationalLeader`, etc.) stay max-normalized — Sociometric Summary matrix display unchanged.
5. **No auto-backfill.** The existing **Recalculate** button on the KOL Analysis admin page is the rollout trigger.
6. **Methodology tooltips** (new `<ScoreTooltip>` component) on Survey + Composite + per-category column headers across Insights surfaces, sourced from `packages/shared/src/score-methodology.ts`.
7. **Sticky Name column** on KOL Explorer ("Weighted-Score tab") so the HCP name stays visible during horizontal scroll.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.40", ... }
```

Web — open `https://kol360.bio-exec.com`, footer / admin header should report `1.17.40`.

### A2. Existing dashboards unchanged

Open the Insights dashboard for an already-scored analysis. **Numbers should look identical to pre-deploy.** This is the safety net — no automatic recalc means no scores moved. Confirm a Sun Pharma analysis still shows its 4.1.19 numbers.

### A3. Tooltip presence (in-product explainer)

1. Insights → Sociometric Summary tab → hover (i) next to one of the category column headers (e.g. National). Tooltip shows methodology text + names the counted/excluded types.
2. Insights → KOL Explorer tab → hover (i) next to **Total** column header → composite explainer. Hover (i) next to **Survey** column → survey-score explainer with the 4 counted + 4 excluded types listed.
3. Open any HCP's profile (KOL Explorer → click a name) → hover (i) on the **Total Weighted Score** card → composite explainer.

### A4. Sticky-Name column

KOL Explorer → resize browser narrow / scroll horizontally → both the `#` column and the **Name** column stay frozen on the left edge while score columns scroll under them.

---

## Phase B — Functional (after pteam Recalcs the first Sun Pharma analysis)

### B1. Recalc a Sun Pharma analysis

Admin → KOL Analysis → open the Sun Pharma dry-eye analysis → click **Recalculate**. Wait for `calcStatus = done`.

### B2. Verify Karpecki = 100 + Periman ≈ 86

Insights → KOL Explorer (sort by Survey desc) for the analysis's disease area + Sun Pharma client:

| HCP | Expected (within ±0.5) |
|---|---|
| Paul Karpecki | scoreSurvey ≈ **100.00** |
| Laura Periman | scoreSurvey ≈ **86.16** |
| Eric Donnenfeld | scoreSurvey ≈ **47.80** |
| Marguerite McDonald | scoreSurvey ≈ **30.50** |

If the top of the list doesn't anchor Karpecki at 100, something didn't land. Compare against `csv/Sun Pharma Sociometric Score Calculations.xlsx`.

### B3. Excluded-category HCPs drop to 0

Search KOL Explorer for **Flanary** (or any HCP whose nominations are entirely Social / Referral / Biased / Regional). scoreSurvey should be **0** post-Recalc (was 41.2 pre-deploy under the old per-type-average formula).

### B4. Composite shifts proportionally

Same Karpecki row: compositeScore should have risen (scoreSurvey rose, 25% weight applied). Flanary's composite should have dropped by ~25% × (his pre-deploy scoreSurvey).

### B5. Per-category columns unchanged on the matrix

Sociometric Summary tab → the **raw nomination counts** in each category column (National, Discussion, Advice, Rising Star, Referral, Social, Biased) match pre-deploy values. Only the aggregate Survey Score column on KOL Explorer (a different tab) changed.

### B6. E2E suite green

```bash
cd e2e && pnpm test:api:test:auth
# Expected: kol-analysis-survey-score.test.ts 2/2 passing
```

---

## Phase C — 24h watch

### C1. CloudWatch — API error rate

Standard post-deploy watch on `kol360-api`:

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?error ?ERROR ?"5xx"' \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -50
```

### C2. Customer signal

Loop back with Sun Pharma after their first review of the post-Recalc Insights numbers:
- Karpecki should anchor their leaderboard at 100.
- Their final-presentation deck numbers should now match the platform numbers exactly.

### C3. B+L coordination

Before pteam clicks Recalc on B+L's analyses, confirm B+L is ready for the rank shift. The new formula gives them the same methodology — but it WILL shift their numbers if some of their HCPs have nominations concentrated in the excluded categories. No data destruction, just a numerical update.

---

## Rollback gate

If A1-A4 don't all pass within 30 min of deploy, redeploy `prod-rel-4.1.19` (v1.17.39). Effects per the [handoff](prod-rel-4.1.20-handoff.md#rollback). Sun Pharma analyses recalculated under 4.1.20 stay at their 4.1.20 values in the DB until a subsequent Recalc click under 4.1.19 restores them.
