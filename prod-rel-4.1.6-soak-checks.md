# prod-rel-4.1.6 — Soak Checks (v1.17.6)

Tag at the v1.17.6 merge commit + docs commit on `main`. Scoped to what v1.17.6 changes vs `prod-rel-4.1.5` — single small UX feature, no backend contract breaks, no migrations. Short soak suffices.

## What v1.17.6 changed (the universe of risk)

1. **`/suggestions` endpoint** accepts a new optional `previewRawName` query param. Backwards compatible — clients that don't send it get the existing behavior.
2. **EditNominationDialog** previews suggestions as the user types (debounced 300ms) and renders an inline blue callout + Match button when an exact name match is found.

No other change.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.6", ... }
```

Web — open `https://kol360.bio-exec.com`, check the footer / admin header → `1.17.6`.

### A2. Existing suggestions endpoint unchanged

Spot-check the existing per-nomination suggestions flow still works (i.e. the previewRawName addition didn't regress the normal call):

- Open `/admin/campaigns/<any>/nominations` for a campaign with some UNMATCHED rows
- Click a row's match action → MatchDialog opens with suggestions
- Suggestions list populates same as on 4.1.5

---

## Phase B — Functional smoke (the headline; ~5 minutes)

### B1. Rename dialog — inline match when name exists

1. Open `/admin/campaigns/<some-campaign>/nominations`
2. Find an UNMATCHED nomination (or any nomination with the edit pencil)
3. Click the **Edit nomination name** (pencil) icon
4. In the input, type the name of an HCP you know exists in the system (e.g. an admin HCP). Wait ~300ms.
5. **Expected:** an inline blue callout appears below the input:
   > **Existing HCP with this name found**
   > FirstName LastName · NPI XXXXXXXXXX · Specialty
   > [Match to this HCP instead]
6. Click **Match to this HCP instead**
7. **Expected:** dialog closes, the nomination's matchStatus becomes `MATCHED`, matchedHcp is set to the suggested HCP

Verify in DB:
```sql
SELECT "matchStatus", "matchedHcpId", "matchType", "matchConfidence"
FROM "Nomination"
WHERE id = '<nomination-id>';
-- Expected: MATCHED, <hcp-id>, exact, 100
```

### B2. Rename dialog — no callout when name doesn't match

1. Open Edit nomination name dialog
2. Type a gibberish name (e.g. `Xyzqq Aaabbb`)
3. **Expected:** no callout appears. Save & Re-match button still works as before.

### B3. Rename dialog — ignore callout + Save & Re-match still works (regression check)

1. Open Edit nomination name dialog
2. Type a name that matches an existing HCP (callout appears)
3. **Ignore** the callout and click **Save & Re-match**
4. **Expected:** existing flow runs — nomination resets to UNMATCHED, MatchDialog opens with the same suggestion as the top result. (User can still choose to match from there, or pick something else.)

### B4. Audit log entry written on inline match (regression check)

After B1 fires, the inline match should write an audit log entry (it calls `matchNomination`, same as the existing flow). Verify:

```sql
SELECT "action", "newValues", "createdAt"
FROM "AuditLog"
WHERE "entityId" = '<nomination-id>'
ORDER BY "createdAt" DESC LIMIT 1;
-- Expected: action='nomination.matched', newValues containing the hcpId
```

---

## Phase C — Background watch (24h, light)

### C1. Suggestions endpoint error rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"/suggestions" 500' \
  --query 'events[*].message' --output text | tail -20
```

Expected: zero or unchanged from baseline. The previewRawName path uses the same internal flow as the existing search — a spike here would indicate the previewRawName branch is hitting an unhandled edge case.

### C2. Inline-match rate

Optional — useful for measuring whether customers actually use the new path:

```sql
SELECT COUNT(*) AS inline_matches
FROM "AuditLog"
WHERE "action" = 'nomination.matched'
  AND "newValues"::jsonb->>'matchType' = 'exact'
  AND "newValues"::jsonb->>'matchConfidence' = '100'
  AND "createdAt" > NOW() - INTERVAL '24 hours';
```

This isn't a soak signal (no rollback criteria); just a measure of fix adoption. The inline-match callout uses `matchType='exact'` + `confidence=100` which are distinguishable from the typical post-rename MatchDialog path that uses the suggestion's score.

---

## Rollback criteria

Roll back to `prod-rel-4.1.5` **only if**:

- A1 fails — wrong version reported
- A2 fails — existing MatchDialog suggestions broken
- B3 fails — Save & Re-match path regressed
- C1 shows a new spike in `/suggestions` 500s tied to the deploy timestamp

**Rollback procedure:** redeploy v1.17.5. No data-state divergence — code-only patch.

---

## When to declare soak passed

Recommend **1 business day** with:
- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows no `/suggestions` 500 spike

After 4.1.6 soaks: no further bugs queued. Per-client `Client.region` setting is the next-queued infrastructure improvement (replaces hardcoded US state whitelist).
