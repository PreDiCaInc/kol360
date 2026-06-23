# prod-rel-4.1.42 — Soak Checks (v1.17.62)

Tag at the merge commit on `main`. Three pteam tickets (two P1). No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.62", ... }
```

### A2. CORP loosened on /images

```bash
curl -sI https://kol360.bio-exec.com/images/logo-white.png | grep -i cross-origin-resource
# Expected: cross-origin-resource-policy: cross-origin
```

Cross-check that HTML routes still get the strict default:

```bash
curl -sI https://kol360.bio-exec.com/login | grep -i cross-origin-resource
# Expected: cross-origin-resource-policy: same-origin
```

### A3. Webmail logo render — the customer-visible fix

1. Trigger a fresh welcome invite to an Outlook.com inbox (or use any existing webmail account).
2. Open the email **in the web client**, not desktop.
3. **Expected**: logo renders inside the green header band, no broken-image placeholder.
4. Repeat for Gmail web + Yahoo Mail web if practical.

If you want certainty without provisioning multiple inboxes, view-source the email and confirm the logo `<img src>` starts with `data:image/png;base64,iVBOR...`. That's the inlined data URI — if you see it, the logo will render in any client.

### A4. KOL Profile no longer leaks internal nominators

1. Sun Pharma → Dry Eye → Paul Karpecki KOL Profile.
2. Scroll to the Nominations table (newly relabeled — see A5).
3. **Expected**: no `@bio-exec.com` rows. Charisza Lastimosa specifically should NOT be in the list.
4. SQL spot-check via prod tunnel (verifying the data is still in the DB, just filtered at the API):

```sql
SELECT COUNT(n.id) FROM "Nomination" n
JOIN "SurveyResponse" sr ON sr.id = n."responseId"
JOIN "Hcp" h ON h.id = sr."respondentHcpId"
JOIN "Campaign" c ON c.id = sr."campaignId"
JOIN "Client" cl ON cl.id = c."clientId"
WHERE n."matchedHcpId" = 'cmmkwcrjf0v6laoyi4c1irk12'
  AND cl.name ILIKE 'Sun Pharma'
  AND h.email LIKE '%@bio-exec.com';
-- Expected: 4 (data unchanged; just filtered at the API layer)
```

5. Bio-Exec dashboard sanity: open Bio-Exec own analysis → any KOL Profile → confirm internal nominators STILL appear (since Bio-Exec's campaigns have `excludeInternalEmails=false`).

### A5. WTD table label change

1. KOL Explorer → click any KOL → drill-down opens.
2. Card title at the bottom reads **"Nominations"** (was "Nominators").
3. Description reads "Showing N of M nominations" / "All N nominations".
4. If filters are pending, the live count reads "N nominations match" (was "N nominators match").
5. Click Export Excel — filename ends `-nominations.xlsx`, sheet name "Nominations".

### A6. Other Insights surfaces unchanged

- Sociometric Summary, Demographics, Benchmarking, Leader Rankings — all numbers unchanged.
- Bio-Exec lite-client journey — full flow unchanged.

## Phase B — Functional smoke (≤30 min)

### B1. Customer dashboard cross-check

For Sun Pharma + B+L:
- KOL Explorer rankings + scores: should look like 4.1.41. No score recalculation happened.
- KOL Profile nomination counts may DROP slightly (the intended fix). If a customer pings about it, refer them to the release note item 2.

## Phase C — 24h watch

### C1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
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

Watch for `getKolProfile` errors — would indicate the new `campaigns.some` derivation tripped on an unexpected shape.

## Rollback gate

If A1–A4 don't pass within 30 min, redeploy `prod-rel-4.1.41` (v1.17.61). Webmail recipients see broken logos again; internal nominators reappear on Sun Pharma / B+L KOL Profiles.

No data destruction.
