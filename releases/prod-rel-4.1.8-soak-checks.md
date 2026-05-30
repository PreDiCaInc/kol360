# prod-rel-4.1.8 — Soak Checks (v1.17.9, bundles v1.17.8)

Tag at the v1.17.9 merge commit + this docs commit on `main`. Scoped to what v1.17.8 + v1.17.9 change vs `prod-rel-4.1.7`. One new additive column, one behavior fix on a write path, opt-in enforcement that's permissive at deploy.

## What 4.1.8 changed (the universe of risk)

1. **`Client.emailDomains` column** (new, default `'{}'`). Empty = permissive — every existing client lands here at deploy moment.
2. **`userService.invite()`** queries the client's `emailDomains`; if non-empty, the user's email domain must be in the list OR `'bio-exec.com'`. Otherwise rejects with `EMAIL_DOMAIN_NOT_ALLOWED` (400).
3. **`userService.update()`** does the same validation if `clientId` is being changed.
4. **Route layer** maps the error code to HTTP 400 (not 500).
5. **`campaign.service.create`** now honors `excludeInternalEmails` from the request body (previously silently dropped).
6. **Admin UI** — new field on Client form; helper text + inline warning on User invite form.

No other change.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.9", ... }
```

Web — open `https://kol360.bio-exec.com`, check the footer / admin header → `1.17.9`.

### A2. Column present + all clients default to empty allowlist

```sql
\d "Client"
-- Expected: emailDomains TEXT[] NOT NULL DEFAULT '{}'

SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE cardinality("emailDomains") = 0) AS empty,
       COUNT(*) FILTER (WHERE cardinality("emailDomains") > 0) AS set
FROM "Client";
-- Expected: total > 0; empty = total; set = 0 (deploy day)
```

If the column is missing → **stop, apply the migration immediately**. Invite endpoints will 503 (P2021) until it exists.

### A3. Existing invite endpoint unchanged (regression)

Test that an invite to a client with an EMPTY allowlist (which is every client at deploy) still works:

- Admin UI → Users → Invite → fill any email + role + select any client → Send.
- Expected: 201 / success toast / new user appears in the list as `PENDING_VERIFICATION`. Same as on 4.1.7.

---

## Phase B — Functional smoke (the headline; ~10 minutes)

### B1. Set a domain allowlist on one client

1. Admin UI → Clients → pick a low-traffic client (or create a throwaway test client) → Edit.
2. New field **Allowed Email Domains** at the bottom of the form.
3. Enter `acme.com, bio-exec.com`. Save.
4. Reload the dialog → field shows the saved domains.
5. Verify in DB:
   ```sql
   SELECT id, name, "emailDomains" FROM "Client" WHERE id = '<client-id>';
   -- Expected: emailDomains = {acme.com,bio-exec.com}
   ```

### B2. Invite with matching domain — accepted

Open Invite User → select that client.

- Email field shows helper text: **Allowed domains for this client: acme.com, bio-exec.com**.
- Type `alice@acme.com` → no warning.
- Send → 201 / success.

### B3. Invite with bio-exec.com — accepted (always-allowed)

Same flow with `staff@bio-exec.com`. Expected: no warning, 201.

### B4. Invite with mismatched domain — rejected with 400, no DB orphan

Type `bob@othercorp.com` → **inline amber warning**: "⚠️ Email domain `othercorp.com` isn't in this client's allowlist..."

Click Send anyway.

- API response: **400** with `code: "EMAIL_DOMAIN_NOT_ALLOWED"` and a message naming the rejected domain.
- Admin UI shows error banner with that message.
- Verify NO orphan in DB:
  ```sql
  SELECT COUNT(*) FROM "User" WHERE email = 'bob@othercorp.com';
  -- Expected: 0 (validation fires before Cognito + DB writes)
  ```

### B5. Reset the allowlist — invite resumes accepting anything (regression)

Edit the same client → clear the Allowed Email Domains field → save.

Invite `bob@othercorp.com` again → 201 / success. Confirms empty list = no restriction.

### B6. Campaign create round-trips `excludeInternalEmails` (v1.17.8 fix)

Quick API check (any client):

```bash
TOKEN="<JWT>"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/campaigns \
  -d '{"name":"4.1.8 smoke","clientId":"<id>","diseaseAreaId":"<id>","surveyTemplateId":"<id>","excludeInternalEmails":true}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('excludeInternalEmails'))"
# Expected: True (was False on 4.1.7 — the silent drop)
```

Delete the smoke campaign after via admin UI.

---

## Phase C — Background watch (24h, light)

### C1. Invite endpoint error rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"POST /api/v1/users/invite" 5' \
  --query 'events[*].message' --output text | tail -40
```

Expected: zero or unchanged from baseline. A 503 spike with `P2021` / `emailDomains` in the message → column missing on prod; apply the migration.

A 400 spike with `EMAIL_DOMAIN_NOT_ALLOWED` → admins are exercising the new gate; not an error, just adoption.

### C2. Adoption (informational, no rollback signal)

```sql
SELECT id, name, "emailDomains"
FROM "Client"
WHERE cardinality("emailDomains") > 0
ORDER BY name;
```

Lists which clients have opted in to the gate. Likely empty for the first few days post-deploy.

---

## Rollback criteria

Roll back to `prod-rel-4.1.7` **only if**:

- A1 fails — wrong version reported
- A2 fails — column missing and migration can't be applied immediately
- A3 / B5 fails — empty allowlist is rejecting invites (would be a regression that breaks every customer)
- B6 fails — campaign-create still drops excludeInternalEmails (would mean the v1.17.8 fix didn't deploy)
- C1 shows a new spike of `/invite` 5xx tied to the deploy timestamp that's not the P2021 case (which has a known fix — apply migration)

**Rollback procedure (Case A — code only, recommended):** redeploy v1.17.7. The `emailDomains` column sits unused. No data-state divergence.

**Rollback procedure (Case B — drop the column too):** rare. Only if you suspect the column itself.
```sql
ALTER TABLE "Client" DROP COLUMN IF EXISTS "emailDomains";
```
Then redeploy v1.17.7. Any per-client domains set during the 4.1.8 deploy window are lost.

---

## When to declare soak passed

Recommend **1 business day** with:

- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows no `/invite` or `/campaigns` 5xx spike

After 4.1.8 soaks: Phase 3 of the email-domain feature (adoption audit script) is a one-off helper, no deploy needed — run it on request before flipping the gate on any specific client. Per-client `Client.region` setting remains the next-queued infrastructure improvement.
