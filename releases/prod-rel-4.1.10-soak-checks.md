# prod-rel-4.1.10 — Soak Checks (v1.17.16, bundles v1.17.12 + v1.17.13 + v1.17.14 + v1.17.15 + v1.17.16)

Tag at the v1.17.16 merge commit + this docs commit on `main`. Consolidated drop covering the entire 2026-06-02 customer bug bundle plus two follow-ups caught against the v1.17.15 deploy. Three themes: respondent-counting correctness (v1.17.12-14), a wave of customer-visible UX/data fixes (v1.17.15), and two fixes for bugs the customer hit on v1.17.15 itself (v1.17.16).

## What 4.1.10 changed (the universe of risk)

**v1.17.12-14 (respondent-counting):**
1. **`getSummary` and `getDemographics`** — both now use the same dedup-aware precompute (most-recent SurveyResponse per respondent, per-campaign `excludeInternalEmails` honored). `totalRespondents` value semantics shift.
2. **`byCoreFocus` SQL** — UNIONs single-choice + MULTI_CHOICE selected-array elements (was returning `[]` for MULTI_CHOICE-only DAs).
3. **`getFilterOptions`** — adds `coreFocuses` field (was missing; left filter dropdown empty).
4. **`/respondent-analytics` endpoint** — fully removed (orphan, no consumer). Anyone calling it directly (no one should be) gets 404.
5. **`cleanup-test-data.ts`** — internal e2e tooling, no prod impact.

**v1.17.15 (UX + visible data):**
6. **`getKolNominationMetadata`** — `byCoreFocus` + `byPracticeSetting` now handle MULTI_CHOICE answers (same regression class as #2 above, different code path).
7. **Frontend `NOMINATION_TYPES` constants** in 2 files: added `BIASED_LEADER`, reordered per pteam's spec, renamed `'Social Media Influencers'` → `'Social Media Leaders'`.
8. **Insights dashboard tab label** — `'Dynamic Benchmarking'` → `'Benchmarking'` (route value unchanged; URL bookmarks still work).
9. **Sociometric Leaders `COLUMNS`** — `Count` moved from last to first data column.
10. **`MultiSelect` component** — popover now stays open across picks (Demographics state filter, etc.).
11. **`DemographicsTab`** — explicit "No respondents match these filters" state when `data.totalRespondents === 0`.
12. **`getDemographics` aggregations** — 3 new skeletons (`socialMediaRankings`, `valuableContent`, `objectivityRating`) that return `[]` until matching survey questions land. Frontend cards render conditionally.

**v1.17.16 (follow-ups against v1.17.15):**
13. **NUM extraction SQL in `getDemographics`** — the regex-strip-then-cast pattern (years / monthly-patients / DED-patients aggregations) used to 500 when a respondent typed a malformed numeric like `".."` into a free-text-but-expected-numeric field. The strip left `".."` unchanged, the cast crashed with `invalid input syntax for type numeric: ".."`. Now pre-validated with a `~ '^[0-9]+(\.[0-9]+)?$'` check; non-numeric strings → `NULL` (= ignored by downstream bucketing, same as a missing answer). Surfaced from AR+AZ+CA state filter combo on Sun Pharma + Dry Eye.
14. **`DemographicsTab` filter bar stays mounted** — v1.17.15's MultiSelect popover fix didn't actually work in practice (it was implemented in the wrong place, the `multi-select.tsx` component itself). Real cause: three early-returns at the top of `DemographicsTab` (`isLoading && !data`, `error`, `!data`) unmounted the entire filter bar on every refetch and on any 500 from the API. Open popover → click an option → setFilters → refetch → `isLoading && !data` → tab unmounts → popover disappears. Fix: no early returns, body region swaps between loading/error/no-data/0-result/charts. Same pattern as Benchmarking (leader-rankings) which never had this bug. Also fixes: a 500 from the API (like #13 above) no longer wipes the filter bar — the user sees the error message and can adjust filters to recover.

No DB migration.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.16", ... }
```

Web — open `https://kol360.bio-exec.com`, check footer / admin header → `1.17.16`.

### A2. Insights endpoints respond

```bash
TOKEN="<JWT>"
DA_ID="<dry-eye-da-id>"
CLIENT_ID="<sun-pharma-client-id>"

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/summary?clientId=$CLIENT_ID" \
  | python3 -m json.tool

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/demographics?clientId=$CLIENT_ID" \
  | python3 -m json.tool | head -20

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/filter-options" \
  | python3 -m json.tool
```

Expected: all three return 200, full JSON shape. The `/filter-options` response now includes a `coreFocuses` array.

### A3. /respondent-analytics returns 404 (intentional)

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/respondent-analytics"
# Expected: 404
```

The endpoint was removed in this release. If any downstream code somewhere is hitting it, surface in C2.

---

## Phase B — Functional smoke (the headline; ~10 minutes)

### B1. Sun Pharma + Dry Eye — the customer-reported case

Open `/admin/insights/<dry-eye-da-id>` for Sun Pharma. **All three of these numbers must now be the same:**

1. Top tile **Total Respondents** (3-card row above the tabs)
2. Demographics tab header **"Survey respondent demographics across N respondents"**
3. Any single-answer dimension's bucket sum on Demographics (e.g., `byRole`: Ophthalmology + Optometry counts) — must be **≤** the headline (respondents may skip a question), never equal-but-higher

Pre-fix on prod they were 778 / 567 / 583 respectively — the 4.1.10 number is the *correct* count per the dedup rule. **Confirm this number with the customer.** Their stated expectation was 778, which assumed raw response count; the new value will be lower because multi-campaign respondents collapse.

Verify against ground-truth SQL (run via prod tunnel):
```sql
SELECT COUNT(*) AS total
FROM (
  SELECT DISTINCT ON (sr."respondentHcpId") sr.id
  FROM "SurveyResponse" sr
  JOIN "Campaign" c ON c.id = sr."campaignId"
  LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
  WHERE c."diseaseAreaId" = '<dry-eye-da-id>'
    AND c."clientId" = '<sun-pharma-client-id>'
    AND sr.status = 'COMPLETED'
    AND (
      c."excludeInternalEmails" = false
      OR h.email IS NULL
      OR h.email NOT LIKE '%@bio-exec.com'
    )
  ORDER BY sr."respondentHcpId", sr."completedAt" DESC NULLS LAST
) latest_per_respondent;
-- The number this returns is what /summary and /demographics MUST agree on.
```

### B2. Core Focus filter dropdown populates

On the same Sun Pharma + Dry Eye page:

- Open Demographics tab → Core Focus filter dropdown → should show options (e.g. "Comprehensive Ophthalmology", "Dry Eye", "Cataract/Refractive Surgery"). Pre-fix: empty.
- Open Sociometric Leaders tab → same Core Focus filter → same options. Pre-fix: empty.

### B3. `byCoreFocus` bar/donut chart populates

On Demographics tab, scroll to the Core Focus chart (or section title containing it). Pre-fix: empty for any DA with MULTI_CHOICE Core Focus. Post-fix: populated. Sun Pharma + Dry Eye is the canonical case; should now show buckets like "Comprehensive Ophthalmology=47", "Dry Eye=43", etc.

### B4. Selecting a Core Focus filter actually filters

Pick one value from the Core Focus dropdown (B2) on Demographics tab → all the dimension charts re-render with narrower counts. Clear the filter → counts return.

### B5. Another customer's DA (cross-customer sanity)

Repeat B1 against any non-Sun-Pharma client + DA. The math invariant `summary == demographics` must hold for them too. The Core Focus chart should populate if their survey template has a Core Focus question.

### B6. (v1.17.15) Tab labels + nomination types

On `/admin/insights/<DA>` for any client:
- The 3rd tab is labeled **"Benchmarking"** (was: "Dynamic Benchmarking").
- The nomination-type dropdown on that tab and on Sociometric Leaders shows **7 entries in this order**: National Leaders → Discussion Leaders → Advice Leaders → Rising Stars → Referral Leaders → Social Media Leaders → Biased Leaders. (Pre-fix: 6 entries, no Biased Leaders, ordered differently, called "Social Media Influencers".)
- Pick "Biased Leaders" → table populates (DB has 214 biased-leader nominations for Sun Pharma + Dry Eye per the bundle spec).

### B7. (v1.17.15) Sociometric Leaders table column order

On Sociometric Leaders tab, expand any nomination type. The columns should be: **Leader → Count → Specialty → Influencer Type → State**. Pre-fix: Count was the LAST data column. Default sort is highest Count first (was already the case; verify still is).

### B8. (v1.17.15) KOL Profile byCoreFocus populates

Click any KOL on Sun Pharma + Dry Eye to open their profile. Scroll to nomination metadata. The **Core Focus** chart should be populated. Pre-fix: empty for any DA with MULTI_CHOICE Core Focus (same regression class as B3, different code path).

### B9. (v1.17.15) MultiSelect popover stays open

On Demographics tab, open the **State of Practice** filter. Click 2-3 states in succession **without closing the dropdown**. Pre-fix: dropdown closed after each pick, forcing the user to re-open to add another. Post-fix: dropdown stays open until clicked outside. Same behavior on Practice Setting + Core Focus + Respondent Role filters.

### B10. (v1.17.15) 0-result state shows guidance, not error

On Demographics tab, apply a filter combo that produces 0 results (e.g. State of Practice = AK + AL + AR + DE, none of which have lots of respondents). The page should show **"No respondents match these filters. Try clearing one or more filters above to see data."** in a card. Pre-fix: empty chart cards + the page rendered as if loaded but blank.

### B11. (v1.17.16) AR + AZ + CA state filter doesn't 500

The customer-reported regression that surfaced on v1.17.15. On Demographics tab for Sun Pharma + Dry Eye, open State of Practice → pick **AR + AZ + CA** (or any combo that previously hit `".."` in a numeric field). Page must render the charts (or "no respondents match" if the combo really has 0 matches). Pre-fix on v1.17.15: HTTP 500 with `invalid input syntax for type numeric: ".."` + the "Error loading demographics data" red text. Post-fix: numeric aggregations skip non-numeric strings; page renders.

Verify the underlying SQL is forgiving:
```bash
TOKEN="<JWT>"
DA_ID="<dry-eye-da-id>"
CLIENT_ID="<sun-pharma-client-id>"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/demographics?clientId=$CLIENT_ID&stateOfPractices=AR,AZ,CA"
# Expected: 200 (pre-fix was 500)
```

### B12. (v1.17.16) Demographics filter bar doesn't disappear on refetch

The other v1.17.15 regression — the v1.17.15 MultiSelect "stays open" fix didn't work because it was in the wrong place. Repeat **B9** on the Demographics tab: open State of Practice, pick 2-3 states in succession. The popover must stay open across picks. Pre-fix on v1.17.15: it still closed (the v1.17.15 fix in `multi-select.tsx` was a no-op — the real cause was the parent `DemographicsTab` unmounting the filter bar on every refetch). Post-fix: tab no longer unmounts; popover stays open.

Bonus check: trigger an error on the API (e.g. by hitting a malformed query in the URL bar), then look at the page. The error message should appear *below the filter bar* — the filter bar itself must still be visible and interactive. Pre-fix: an error wiped the filter bar entirely, leaving the user stuck on the error screen with no way to adjust filters.

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

Expected: zero or unchanged from baseline. Any spike with SQL-related stack traces → flag back; the dedup precompute query could hit an edge case we didn't see on test data.

### C2. Any caller still hitting /respondent-analytics

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"respondent-analytics" 404' \
  --query 'events[*].message' --output text | wc -l
```

Expected: 0. If non-zero, someone is calling the endpoint — figure out who and route them to `/demographics` or `/summary`.

---

## Rollback criteria

Roll back to `prod-rel-4.1.9` **only if**:

- A1 fails — wrong version reported
- B1 fails — `summary.totalRespondents != demographics.totalRespondents`. (Means the dedup precompute query isn't being shared correctly between the two endpoints; not a small fix.)
- B1 produces a value the customer flags as obviously wrong (e.g., far higher than the raw response count, or far lower than 567). Flag back to dev rather than rolling back blind — the math is testable.
- C1 — `/insights/` 5xx spike with SQL error messages
- C2 — non-zero hits on /respondent-analytics (somebody depends on the dropped endpoint)

**Rollback procedure:** redeploy v1.17.11. The Core Focus filter goes empty again. The 567/583/778 inconsistency returns. The deleted endpoint comes back. All known-broken behaviors restored.

---

## When to declare soak passed

Recommend **1 business day** with:

- Phase A passes immediately after deploy
- Phase B1 confirmed with customer (their expected number, or close enough that they accept the new math)
- Phase B2/B3/B4 visually confirmed
- Phase C shows no insights endpoint 5xx spike and zero `/respondent-analytics` hits

After 4.1.10 soaks: continue with the remaining bug-bundle items (Group C reorder + Biased Leaders, Group D table layout, Group E KOL Profile core focus noms, Group F filter UX). None block 4.1.10.
