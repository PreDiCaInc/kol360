# prod-rel-4.1.11 — Soak Checks (v1.17.18, bundles v1.17.17 + v1.17.18)

Tag at the v1.17.18 merge commit + this docs commit on `main`. Four themes: emailDomains-required, auto-approve invitees, TEAM_MEMBER read perms, and a global error-handler fix.

## What 4.1.11 changed (the universe of risk)

1. **`createClientSchema.emailDomains`** — `.default([])` → `.min(1, 'At least one email domain is required')`. Frontend form helper text updated, label marked `*`. **Legacy clients are grandfathered** via the userService runtime escape hatch (`length === 0 → return`).
2. **`/users/me`** — auto-flips `PENDING_VERIFICATION → ACTIVE` on first hit. `/users/:id/approve` route kept for admin overrides.
3. **`requireTenantUser()` + `gateWritesToAdmins()`** new helpers in rbac.ts; applied as paired global hooks on 8 route files. Frontend `RequireAuth allowedRoles` lists across 9 page files bulk-added `TEAM_MEMBER`.
4. **`error-handler.ts`** — ZodError → 400 (was 500). First issue's message surfaced in response.

No DB migration.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.18", ... }
```

Web — open `https://kol360.bio-exec.com`, check footer / admin header → `1.17.18`.

### A2. ZodError → 400 (the simplest smoke for the global handler change)

Pick any admin-callable endpoint that uses Zod body validation; POST garbage. Example:

```bash
TOKEN="<JWT for a platform-admin>"
curl -s -o /tmp/resp.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/clients \
  -d '{"name":"X"}'
# Expected: 400 (was 500 pre-fix)
cat /tmp/resp.json
# Expected: message contains "emailDomains" + "At least one email domain is required"
```

If you get 500: rollback. The global handler regression would affect every Zod-validated POST.

---

## Phase B — Functional smoke (~10 minutes)

### B1. Create-client form enforces emailDomains

In `/admin/clients` → New Client:
1. Type a name. Leave "Allowed Email Domains" empty. Click Create. Expected: form rejects with **"At least one email domain is required"** inline below the field; no API call fires.
2. Type a domain (`example.com`). Click Create. Expected: 201, client appears in list.
3. Edit an existing legacy client (one with empty emailDomains — every pre-v1.17.17 client). Try to save without filling in domains. Expected: same inline error blocking the save. **Confirm** an admin sees this clearly enough to know what to do (the placeholder `sunpharma.com, na.sunpharma.com` is there as a hint).

### B2. Auto-approve flow (the customer-reported UX bug)

Easiest run-through:
1. As platform admin in `/admin/users` → Invite User. Use a fresh email at an allowed domain (e.g. `qa-soak-{ts}@bio-exec.com`).
2. Receive the temp-password email. Open an incognito window.
3. Log in as that invited user with the temp password. Cognito forces a password change. Set a new password.
4. Expected: **lands directly on the dashboard.** Pre-fix: bounced back to login.
5. In a separate session, as platform admin, check `/admin/users` — the new user is **status = ACTIVE**, not PENDING_VERIFICATION. The audit log shows `user.auto_approved` with old/new status.

Clean up: disable or delete the test user.

### B3. TEAM_MEMBER read access

Find or create a TEAM_MEMBER user (role = TEAM_MEMBER, clientId = some real prod client). Log in as them.
- Sidebar shows the client-admin nav (HCPs, Campaigns, Insights, Dashboards, etc.). No "Insufficient permissions" toast on page load.
- Open `/admin/hcps` — list renders (scoped to their tenant's CampaignHcp join).
- Open `/admin/campaigns` — list renders (their tenant's campaigns).
- Open `/admin/insights/<any-DA-they-have-campaigns-in>` — renders.
- Open `/admin/dashboards` — renders.

### B4. TEAM_MEMBER write attempts are blocked

As the same TEAM_MEMBER from B3:
- On `/admin/hcps`, click "Add HCP" or "Import HCP" → submit. Expected: API returns 403 ("Insufficient permissions for write operation"); UI shows the error toast.
- On `/admin/campaigns/<existing>` → try to edit (status change, name, etc.). Expected: 403 same.
- Spot-check 2 or 3 routes; the gate is bulk-applied across all the write methods on the 8 route files.

Pre-fix: TEAM_MEMBER couldn't even reach the page (403 on GET); post-fix, the page renders but writes are still gated.

### B5. Admin-only routes still admin-only

Verify the kept-admin areas:
- TEAM_MEMBER trying to navigate to `/admin/clients` → 403 / redirect (PLATFORM_ADMIN only).
- TEAM_MEMBER trying `/admin/users` → behavior depends on RequireAuth on that page; should be CLIENT_ADMIN+ only.
- TEAM_MEMBER trying `/admin/lite-clients` → PLATFORM_ADMIN only.
- TEAM_MEMBER trying any kol-analysis route → 403.
- TEAM_MEMBER trying any opt-outs route → 403.

### B6. Re-soak the prior bundle (cross-verify 4.1.10 didn't regress)

Spot-check the AR + AZ + CA filter on Sun Pharma + Dry Eye (the v1.17.16 bug):
- Open Demographics for Sun Pharma + Dry Eye.
- Filter State of Practice = AR + AZ + CA.
- Expected: page renders, no 500, MultiSelect popover stays open across picks.

Anything regressing here means a Theme 3 (RBAC refactor) change accidentally broke the insights routes. They shouldn't have — insights-report.ts has no role-based hook and we didn't touch it — but verify.

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

If non-zero, admins are hitting the new requirement. Expected occasional hits as users adjust to the new policy; sustained high rate could indicate a UX problem with how the helper text reads.

### C3. ZodError 400 rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"ZodError"' \
  --query 'events[*].message' --output text | wc -l
```

Pre-fix these all returned 500. The number of ZodErrors per day didn't change; only the status code. If we see a sudden 5xx drop in API metrics matched by a 400 rise, that's the global handler change working.

### C4. TEAM_MEMBER write attempts (audit)

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"Insufficient permissions for write operation"' \
  --query 'events[*].message' --output text | wc -l
```

If non-zero, TEAM_MEMBER users are trying to write somewhere they can't. Low rate is fine. Sustained high rate could indicate a UI bug (showing a write button to TEAM_MEMBER when it shouldn't).

---

## Rollback criteria

Roll back to `prod-rel-4.1.10` **only if**:

- A1 fails — wrong version reported
- A2 fails — POST with bad body returns 500 instead of 400 (the global handler regression)
- B1 fails — form lets you create a client with empty emailDomains (Zod regression)
- B2 fails — invited user still gets bounced to login after password change (auto-approve regression)
- B6 fails — AR+AZ+CA filter on Sun Pharma + Dry Eye returns 500 again (v1.17.16 regression — would mean the RBAC refactor broke insights, which shouldn't be possible since we didn't touch insights routes)
- C1 shows a sustained 403 rate on `/users/me` (auto-approve isn't firing on existing PENDING_VERIFICATION users)

**Rollback procedure:** redeploy `prod-rel-4.1.10` (v1.17.16). emailDomains becomes optional again; auto-approve gone; TEAM_MEMBER perms reverted to nothing; ZodError → 500 returns. Customer-visible changes for B1-B3 disappear; all four are non-destructive (no DB state to unwind).

---

## When to declare soak passed

Recommend **1 business day** with:
- Phase A passes immediately after deploy
- Phase B1-B4 visually confirmed
- Phase C1 shows the expected /users/me 403 drop
- Phase C2/C3/C4 within normal range

After 4.1.11 soaks: nothing currently queued for 4.1.12. Continue normal sprint work.
