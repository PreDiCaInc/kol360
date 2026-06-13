# prod-rel-4.1.17 — Soak Checks (v1.17.34)

Tag at the v1.17.34 merge commit on `main`. Three HCP admin-page polish items — full-name search fix, NPI editable for PLATFORM_ADMIN with audit, email-placeholder chip UI. **No DB migration.**

## What 4.1.17 changed (the universe of risk)

1. **`HcpService.search`** — adds pair-token AND clauses for 2+ token queries.
2. **`updateHcpSchema`** — no longer omits `npi`.
3. **PUT `/hcps/:id`** — catches Prisma `P2002` on `Hcp.npi` and returns 409; new `hcp.npi_changed` audit action.
4. **HCP form dialog** — NPI input gated on PLATFORM_ADMIN; email placeholder converted to chip button.
5. **`NominationService.rematchToHcp` + POST `/campaigns/:id/nominations/:nid/rematch`** — re-point an already-matched nomination; PLATFORM_ADMIN-only; emits `nomination.rematched` audit action with old + new HCP id.
6. **Nominations page (matched row)** — new "Change match" chip button + MatchNominationDialog `mode='rematch'` reuse.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.34", ... }
```

Web — open `https://kol360.bio-exec.com`, footer / admin header should report `1.17.34`.

### A2. Full-name search returns results

```bash
TOK=...                # mint via cognito
API=https://ik6dmnn2ra.us-east-2.awsapprunner.com

ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('Paul Karpecki'))")
curl -s -H "Authorization: Bearer $TOK" "$API/api/v1/hcps?query=$ENC&limit=5" \
  | jq '{ total, items: [.items[] | {firstName, lastName, npi}] }'
# Expected: total >= 1; the items list includes a Paul Karpecki row.
# Pre-fix:  total = 0, items = [].
```

Same check reversed:
```bash
ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('Karpecki Paul'))")
curl -s -H "Authorization: Bearer $TOK" "$API/api/v1/hcps?query=$ENC&limit=5" | jq .total
# Expected: >= 1
```

### A3. NPI editable + 409 on collision (PLATFORM_ADMIN)

Browser UI on `https://kol360.bio-exec.com`. Log in as PLATFORM_ADMIN → Admin → HCPs → pick a low-traffic test HCP → Edit:

- NPI field is **editable** (not greyed out). Below it: "Changing the NPI is logged to the audit trail. The new value must be unique across all HCPs."
- Change to a fresh 10-digit value → Save → returns to the list → re-open Edit → new value persists.
- Change to an NPI you know is already used by another HCP → Save → **409 toast/error** with message containing "Another HCP already exists with NPI". Form stays open with the bad input.

### A4. NPI NOT editable for non-platform-admin (regression check)

Log in as a CLIENT_ADMIN (any tenant with one). Admin → HCPs → Edit any HCP:
- NPI field is **disabled** (greyed out). No edit affordance shown.
- Per gateWritesToAdmins (v1.17.20), CLIENT_ADMIN can't write any HCP fields anyway; this is a defense-in-depth surface check.

### A5. Nomination rematch — Change Match flow lands on the new HCP

Log in as PLATFORM_ADMIN → Admin → Campaigns → pick an active campaign with MATCHED nominations → Nominations tab → filter to MATCHED:

- Each MATCHED row shows the matched HCP name + a chip button **"Change match"** next to it (chip is absent for CLIENT_ADMIN / TEAM_MEMBER).
- Click "Change match" → existing match dialog opens with title **"Change Match"** and a sub-line: *"Currently matched to {HCP name} ({NPI}). Pick a different HCP …"*. Exclude + Create-New-HCP buttons are hidden.
- Pick a different suggestion → click **"Save New Match"** → toast/success → dialog closes → row updates to show the new matched HCP.
- Picking the same HCP → save button is disabled.

API check:
```bash
TOK=...
CAMP=<active-campaign-id>; NOM=<matched-nomination-id>; HCP=<target-hcp-id>
curl -s -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/campaigns/$CAMP/nominations/$NOM/rematch" \
  -d "{\"newHcpId\":\"$HCP\"}" | jq '{ matchStatus, matchedHcpId }'
# Expected: { "matchStatus": "MATCHED", "matchedHcpId": "<HCP>" }
```

Same-HCP collision: re-run the same curl → 409.

### A6. Email "Use placeholder" chip

Log in as PLATFORM_ADMIN → Admin → HCPs → Add HCP → focus the Email field:
- Below the input, visible: `Required. No email yet?` followed by a chip button **"Use nomail@kol360research.com"**.
- Click the chip → email field populates with `nomail@kol360research.com` instantly. No copy/paste required.

---

## Phase B — Functional smoke (~10 minutes)

### B1. Full-name search across surfaces

Repeat A2 for two different full-name pairs (pick HCPs you can verify in the DB). Both should narrow correctly. Then test single-token regression:
- `query=Paul` → multiple Pauls in results (unchanged).
- `query=Karpecki` → at least Paul Karpecki in results (unchanged).
- `query=12345` → matches NPI substring (unchanged).
- `query=BE-` → matches beId substring (unchanged).

### B2. NPI change persists + audit log row

After A3:
- DB-query the audit log (or `Hcp` audit table) for the HCP you just edited.
- Expected: a row with `action = 'hcp.npi_changed'`, `oldValues.npi` = original, `newValues.npi` = new value, `actorId` = your user id.

If you have psql via the SSH or SSM tunnel:
```sql
SELECT "createdAt", action, "entityType", "entityId",
       "oldValues"->>'npi' AS old_npi,
       "newValues"->>'npi' AS new_npi,
       "userId"
FROM "AuditLog"
WHERE "entityType" = 'Hcp'
  AND action = 'hcp.npi_changed'
ORDER BY "createdAt" DESC
LIMIT 5;
```

### B3. NPI change unique-collision returns 409 cleanly

Browser UI, repeat the collision case from A3. Network panel:
- Request: `PUT /api/v1/hcps/{id}` with body `{ npi: "<already-taken-value>", ... }`
- Response: `409 Conflict`, body `{ error: "Conflict", message: "Another HCP already exists with NPI ...", statusCode: 409 }`.
- Pre-fix: would have been a 503 / generic 5xx.

### B4. No-op same-NPI submit

In the edit dialog, click Save without changing the NPI:
- Returns 200 OK.
- No `hcp.npi_changed` audit row is created (only the standard `hcp.updated` if other fields changed; if nothing changed, no audit at all).

### B5. Email chip UI on small viewports

A6 with a narrowed browser window (~768px). Chip should:
- Wrap below the "No email yet?" text if needed.
- Remain clickable / readable.
- Not overflow the dialog.

### B6. Re-soak prior bundles

- **prod-rel-4.1.16**: KOL State filter on Sociometric Summary still narrows correctly (e.g. `?states=CA` returns CA-only rows).
- **prod-rel-4.1.15**: Sociometric matrix column order still Total → National → … → Biased; full-list export still emits with NPI.
- **prod-rel-4.1.14**: "Dry Eye (including OSD, MGD, and NK)" filter still narrows.

---

## Phase C — 24h watch

### C1. CloudWatch — API error rate

Standard 24h post-deploy watch on `kol360-api`:

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?error ?ERROR ?"5xx"' \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -50
```

### C2. NPI-change audit log

Sanity-check the audit log accumulates `hcp.npi_changed` rows when PLATFORM_ADMIN actually edits NPIs in the 24h window. Zero rows is fine; non-zero rows should look reasonable (actor, before/after, no duplicates).

### C3. Customer signal

Customer flagged the full-name-search regression. Loop back within 48h of deploy to confirm searching their typical workflow ("Paul Karpecki", "Jane Smith", etc.) now returns the expected HCP.

---

## Rollback gate

If A1-A3 don't all pass within 30 min of deploy, redeploy `prod-rel-4.1.16`. Effects per the [handoff](prod-rel-4.1.17-handoff.md#rollback).
