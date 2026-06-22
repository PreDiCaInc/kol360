# prod-rel-4.1.40 — Soak Checks (v1.17.60)

Tag at the merge commit on `main`. Three pteam tickets bundled + one held-back e2e fixup. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.60", ... }
```

### A2. Outlook gradient + logo fallback

1. Provision a free Outlook.com inbox (or use one you already have).
2. From admin, invite a test user with that email address.
3. Open the welcome email in Outlook web. **Expected**:
   - Header strip is solid green (`#147a6d`), tagline "Key Opinion Leader Analytics" is visible.
   - CTA "Sign In to KOL360" is a solid green rounded pill with visible white text.
   - Logo area shows either the actual logo (if "Download pictures" clicked) or an alt-text-sized placeholder sized to 144×36.
4. Repeat for a survey-invitation email and a survey-reminder email. Same visual contract.
5. Cross-check on Gmail web — header/CTA look identical to 4.1.39 (gradient + white text).

### A3. Logo upload + 20 KB cap

1. Admin → Clients → pick a test client → Edit.
2. Logo field — Upload tab. Pick a PNG > 20 KB. **Expected**: inline error "Logo must be ≤ 20 KB (got N KB). Compress at tinypng.com or export a smaller PNG/SVG." No upload.
3. Pick a PNG ≤ 20 KB. **Expected**: live preview renders immediately (above the tabs).
4. Save. Re-open Edit → Logo preview still shows. Close.
5. View `/admin/clients/[id]` → Logo row shows the preview inline.

### A4. Allowed Email Domains inline display

1. View a client with non-empty `emailDomains`. **Expected**: Badge chips, one per domain.
2. (If you can) edit a test client and clear the domains. View detail page. **Expected**: destructive italic "None — only @bio-exec.com staff can be invited" line. Restore.

### A5. Resend invite

1. Invite a brand new test user (e.g. `soak-{date}@bio-exec.com`). Wait for the welcome email.
2. Users page → dropdown → Resend Invite. **Expected**: "Invitation resent to ..." alert.
3. New welcome email arrives within 60s with a NEW temp password.
4. Sign in with the OLD temp password. **Expected**: rejected (Cognito reset).
5. Sign in with the NEW temp password. **Expected**: prompted to set a permanent password.
6. Approve + activate the user. Try Resend Invite. **Expected**: inline error "Resend invite only valid for users in PENDING_VERIFICATION state".

### A6. Delete user + self-delete guard

1. Take the test user from A5 → dropdown → Delete. Two confirms. **Expected**: row disappears.
2. Try to sign in with that user. **Expected**: Cognito returns user-not-found.
3. From Users page, on YOUR OWN row, dropdown → Delete. Two confirms. **Expected**: inline error "Cannot delete your own account". Row still present.

### A7. Existing user flows unchanged

Smoke check: Edit, Approve (on a fresh PENDING user), Disable (on an ACTIVE), Enable (on a DISABLED) still all work.

## Phase B — Functional smoke (≤30 min)

### B1. Lite-client journey unchanged

sam@bio-exec.com / Bio-Exec full journey — email, sign-in, dashboard, analyses, KOL profile drill-down — all unchanged.

### B2. Survey email rendering on prod templates

If you can access the campaign survey-invitation send flow, send one test invite to a real Outlook inbox and verify A2 contract holds end-to-end (not just for the welcome path).

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

Specific patterns to watch for:
- `AdminSetUserPasswordCommand` failures — would indicate Cognito IAM perms missing for the resend path.
- `AdminDeleteUserCommand` failures — same.
- `Cognito delete failed; proceeding with DB delete` — the logged graceful-fallback. Once is fine (user already gone from pool); a pattern is a problem.

## Rollback gate

If A1–A2 don't pass within 30 min, redeploy `prod-rel-4.1.39` (v1.17.59). Outlook recipients see broken emails again; client edit dialog loses the upload tab; Resend Invite + Delete disappear.

No data destruction.
