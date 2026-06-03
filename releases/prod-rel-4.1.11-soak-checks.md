# prod-rel-4.1.11 — Soak Checks (v1.17.23, bundles v1.17.17 → v1.17.23)

Tag at the v1.17.23 merge commit on `main`. Seven themes consolidated:

1. **emailDomains required** at create (v1.17.17 — Zod `min(1)`)
2. **Auto-approve** invitees on first `/users/me` (v1.17.17 — drops the manual admin Approve step)
3. **TEAM_MEMBER** read access across tenant data (v1.17.17 — `requireTenantUser` helper)
4. **ZodError → 400** in the global error handler (v1.17.18 — caught by v1.17.17 deploy E2E)
5. **emailDomains escape hatch removed** + **lint CI fix** (v1.17.19)
6. **CLIENT_ADMIN + TEAM_MEMBER are both view-only** across the app (v1.17.20) + **HCP `nomail` placeholder backfill** (v1.17.20 — data fix, no code)
7. **Hcp.email required** with placeholder default at the DB + form hint (v1.17.21) + **insights layout density** (v1.17.22) + **write-button hide sweep** on remaining admin pages (v1.17.23)

**One DB migration** in this bundle (v1.17.21 — `Hcp.email NOT NULL DEFAULT 'nomail@kol360research.com'`). Migration is idempotent and data-risk-free; the v1.17.20 backfill already cleared every prod NULL/`nomail@bio-exec.com` row. See the handoff doc for `prisma migrate deploy` instructions.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.23", ... }
```

Web — open `https://kol360.bio-exec.com`, check footer / admin header → `1.17.23`.

### A2. DB migration applied

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name='Hcp' AND column_name='email';
-- Expect: is_nullable='NO', column_default='nomail@kol360research.com'::text

SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name = '20260603_hcp_email_required_with_placeholder';
-- Expect: exactly one row, finished_at not NULL
```

If migration is missing, run `prisma migrate deploy` per the handoff doc.

### A3. ZodError → 400 (the simplest smoke for the global handler change)

```bash
TOKEN="<JWT for a platform-admin>"
curl -s -o /tmp/resp.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/clients \
  -d '{"name":"X"}'
# Expected: 400 (was 500 pre-fix)
cat /tmp/resp.json
# Expected: message mentions "emailDomains" + "At least one email domain is required"
```

If you get 500: rollback. The global handler regression would affect every Zod-validated POST across every route.

---

## Phase B — Functional smoke (~15 minutes)

### B1. Create-client form enforces emailDomains

In `/admin/clients` → New Client:
1. Type a name. Leave "Allowed Email Domains" empty. Click Create. Expected: form rejects inline with **"At least one email domain is required"**; no API call fires.
2. Type a domain (`example.com`). Click Create. Expected: 201, client appears in list.
3. Edit an existing prod client (Sun Pharma / Bausch & Lomb / Sample Pharma Corp). The domains are pre-populated (v1.17.19 backfill); save without other changes. Expected: works.

### B2. Auto-approve flow

1. As platform admin in `/admin/users` → Invite User. Use a fresh email at an allowed domain (e.g. `qa-soak-{ts}@bio-exec.com`).
2. Receive the temp-password email. Open an incognito window.
3. Log in as that invited user with the temp password. Cognito forces password change. Set a new password.
4. Expected: **lands directly on the dashboard.** Pre-v1.17.17: bounced back to login.
5. As platform admin, check `/admin/users` — the new user is **status = ACTIVE**, not PENDING_VERIFICATION. Audit log shows `user.auto_approved` with old/new status.

Clean up: disable or delete the test user.

### B3. Client roles are view-only (the big v1.17.20 change)

Find or create both a **CLIENT_ADMIN** and a **TEAM_MEMBER** user for an existing prod client. Log in as each:

**Read access works:**
- Sidebar shows the client-admin nav. No "Insufficient permissions" toast on page load.
- `/admin/hcps` — list renders (scoped to tenant's CampaignHcp join).
- `/admin/campaigns` — list renders. **No "New Campaign" button visible.**
- Click into a campaign → **only the Overview tab is visible**. No setup tabs (HCPs / Templates / Initiate), no Survey Status (which would expose the per-HCP survey link), no action buttons (Activate / Close / Publish / Send Invitations).
- `/admin/insights/<DA>` — renders.
- `/admin/dashboards` — renders.
- `/admin/hcps/<id>` — renders. **No Edit / Add Alias / Add Specialty / Opt-out buttons.**
- `/admin/users` — renders. **No "Invite User" button. No row-action dropdown (Edit / Approve / Disable / Enable).**
- `/admin/survey-templates`, `/admin/sections`, `/admin/questions` — render. **No "New …" buttons. No row-level Edit/Delete/Clone actions.**
- `/admin/hcps/scores` — renders. **No "Import Scores" button.**

**Write attempts are blocked:**
- Direct-URL-poke a write endpoint (e.g. `POST /api/v1/hcps` with a JWT for the client role). Expected: 403 ("Insufficient permissions for write operation").
- This applies to CLIENT_ADMIN now too — pre-v1.17.20, CLIENT_ADMIN could still write.

### B4. Admin-only routes still admin-only

- TEAM_MEMBER and CLIENT_ADMIN navigating to `/admin/clients` → redirect / 403.
- Same for `/admin/lite-clients`, `/admin/kol-analysis`, `/admin/campaigns/<id>/payments`.

### B5. HCP form: email required + placeholder hint

In `/admin/hcps` (as PLATFORM_ADMIN) → New HCP:
1. Fill name + NPI; leave email blank. Click Create. Expected: form rejects inline (Zod `email().email()` requires a valid address).
2. Click the **"nomail@kol360research.com"** link in the helper text below the email input. The field fills with the placeholder. Click Create. Expected: 201, HCP created with the placeholder email.

### B6. nomail filter no longer drops legit HCPs

Open Demographics for Sun Pharma + Dry Eye (or any DA where `excludeInternalEmails=true`). Compare `totalRespondents` between v1.17.16 and v1.17.20:
- Pre-fix on v1.17.16: HCPs with `nomail@bio-exec.com` or NULL email were silently excluded.
- Post-fix on v1.17.20+: those 4,009 prod HCPs (re-domained to `nomail@kol360research.com`) are now included. Headline should be higher than the v1.17.16 figure if any of those HCPs had completed responses.

Verify the 5 actual @bio-exec.com staff HCPs (`jpikor`, `charisza`, `haranath`, `Jboyd` variants) are still excluded — those are intentional internal-team test entries.

### B7. Insights layout density (v1.17.22)

Open `/admin/insights/<any-DA>` on a laptop-class screen (≤ 1366×768). Expected:
- Sidebar **auto-collapses** with a smooth 300ms animation.
- 3 summary tiles are single-row horizontal (icon + label + number all on one line), not the tall stacked cards from v1.17.21.
- Filters + the first row of chart tiles visible without scrolling.
- Navigate away → sidebar **restores to its previous state**.

### B8. Re-soak the prior bundle (cross-verify 4.1.10 didn't regress)

- Open Demographics for Sun Pharma + Dry Eye. Filter State of Practice = AR + AZ + CA. Expected: renders, no 500 (the v1.17.16 ".." numeric-cast bug).
- MultiSelect popover stays open across picks on Demographics.
- KOL Profile Core Focus chart populates for a MULTI_CHOICE survey.

---

## Phase C — Background watch (24h, light)

### C1. Auth flow error rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"users/me" "403"' \
  --query 'events[*].message' --output text | wc -l
```

Pre-fix this was the auto-approve gap firing on every invited user's first login. Post-fix: should approach zero (only DISABLED users + the unused PENDING_APPROVAL state can still 403 here).

### C2. emailDomains rejection rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"At least one email domain"' \
  --query 'events[*].message' --output text | wc -l
```

Occasional hits are fine as admins adjust to the new policy. Sustained high rate → UX problem with helper text.

### C3. ZodError 400 rate (sanity)

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"ZodError"' \
  --query 'events[*].message' --output text | wc -l
```

Pre-fix these all returned 500. The ZodError count per day didn't change; only the status code. A 5xx drop matched by a 400 rise in API metrics is the global handler change working.

### C4. Client-role write attempts (audit)

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"Insufficient permissions for write operation"' \
  --query 'events[*].message' --output text | wc -l
```

If non-zero, client-role users are hitting a write somewhere they can't. Low rate is fine. Sustained high rate could indicate a UI bug (a write button still leaking through to client roles, or a deep-link in user habits).

### C5. New-HCP placeholder usage

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"nomail@kol360research.com"' \
  --query 'events[*].message' --output text | wc -l
```

Tracks how often operators click the placeholder hint vs. type a real email. Mostly informational — high count just means lots of placeholders in the day's CSV imports.

---

## Rollback criteria

Roll back to `prod-rel-4.1.10` **only if**:

- **A1** fails — wrong version reported
- **A2** fails — migration didn't apply (then just run `prisma migrate deploy` and re-check; not a rollback trigger by itself)
- **A3** fails — POST with bad body returns 500 instead of 400 (the global handler regression)
- **B1** fails — form lets you create a client with empty emailDomains (Zod regression)
- **B2** fails — invited user still gets bounced to login after password change (auto-approve regression)
- **B3** fails materially — client-role user sees writes they shouldn't, OR can't perform any reads (RBAC misconfiguration)
- **B6** the nomail backfill didn't take effect (prod HCP rows still have `nomail@bio-exec.com` — would mean the v1.17.19 backfill didn't run, fix that rather than roll back)
- **B8** the v1.17.16 AR+AZ+CA path returns 500 again
- **C1** sustained 403 rate on `/users/me` (auto-approve isn't firing on existing PENDING_VERIFICATION users)
- **C4** large spike of `"Insufficient permissions for write operation"` events (suggests UI has write buttons leaking through to client roles after all)

**Rollback procedure:** redeploy `prod-rel-4.1.10` (v1.17.16). emailDomains becomes optional again; auto-approve gone; client roles regain write access; ZodError → 500 returns; insights layout snaps back to pre-v1.17.22; nomail filter starts dropping the re-domained HCPs again (because the prod data is now `nomail@kol360research.com`, which the old filter doesn't catch — actually this means the 4,009 HCPs stay included even on rollback, which is a desirable state. The DB doesn't need to roll back).

The Hcp.email migration is forward-compatible (a column that's NOT NULL with a default works fine for the old code that thought email was nullable — the old client just won't see the NOT NULL constraint). Don't drop the constraint.

---

## When to declare soak passed

Recommend **1 business day** with:
- Phase A passes immediately after deploy
- Phase B1–B5 visually confirmed (B6 by SQL check)
- Phase B7 visually confirmed on a laptop screen
- Phase B8 confirms no 4.1.10 regression
- Phase C1 shows the expected `/users/me` 403 drop
- Phase C2/C3/C4/C5 within normal ranges

After 4.1.11 soaks: nothing currently queued for 4.1.12. Parked future work (per-client `Client.region`, global nomination blocklist, HCP `isInternal` flag, normalized nomination-type scores) is documented in the dev memory; pull when ready.
