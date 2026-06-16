# prod-rel-4.1.28 — Soak Checks (v1.17.48)

Tag at the merge commit on `main`. Single backend change: branded SES invitation email replaces Cognito's default. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.48", ... }
```

### A2. End-to-end invitation flow

Admin → Users → Invite User. Use a fresh test address you can actually check (recommended: `kol360-invite-test+<YYYYMMDD>@bio-exec.com` — gets delivered to a real inbox you control).

Expected behavior:
1. Within ~30s, **the new branded SES email arrives** (sender: `research@bio-exec.com`).
2. The email contains:
   - Gradient header with the KOL360 white logo + "Key Opinion Leader Analytics" subtitle
   - "Welcome, {firstName} {lastName}" heading
   - Client-context line (if invited under a specific client) — e.g., "You've been invited to access Sun Pharma's analytics on KOL360." — or a generic line if PLATFORM_ADMIN with no clientId
   - Code-style credentials block: username + temp password in monospace, primary-color accent
   - **"Sign In to KOL360" CTA button** linking to the prod URL `/login`
   - Role label ("Platform Administrator" / "Client Administrator" / "Team Member")
   - Fallback "If the button doesn't work, copy this link" with the same URL
   - Security note ("don't share, one-time use, expires on first sign-in")
3. **No** Cognito default email arrives (the one with raw "Your username is X and your temporary password is Y").

### A3. Sign-in works with the temp password

1. Click the CTA button in the email → lands on `/login`.
2. Enter the username (= email) + the temp password from the email.
3. Cognito prompts for a new password (NEW_PASSWORD_REQUIRED challenge).
4. Set a permanent password → land on `/admin` (or the role-appropriate landing page).

### A4. SES delivery event tracking still works

```sql
SELECT "sesMessageId", "toEmail", status, "acceptedAt", "deliveredAt"
FROM "EmailDeliveryEvent"
WHERE "toEmail" = '<test-address>'
ORDER BY "acceptedAt" DESC
LIMIT 1;
```

The user-invite email is a one-off (not tied to a campaign), so the existing campaignId-keyed `EmailDeliveryEvent` rows may not capture it depending on how the v1.17.37 wiring is plumbed. Verify via SES console event-destination logs if needed.

### A5. Failure-mode sanity

If you want to stress the try/catch, you can temporarily set `SES_FROM_EMAIL` to a suppressed address and re-invite. Expected: Cognito user still created, DB User row still created, an `[ERROR]` line appears in CloudWatch with `Failed to send user invitation email`. Admin can still resend later.

---

## Rollback gate

If A1–A2 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.27` (v1.17.47). New invites revert to Cognito's default one-line email; existing users continue working unchanged.
