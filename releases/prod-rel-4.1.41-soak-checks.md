# prod-rel-4.1.41 — Soak Checks (v1.17.61)

Tag at the merge commit on `main`. Two cosmetic follow-ups from the 4.1.40 soak. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.61", ... }
```

### A2. Logo loads fast in emails

1. Trigger a welcome invite to a free Outlook.com inbox (or any Outlook web account).
2. Open the email. **Expected**: logo loads near-instantly inside the 144×36 box; no "Loading…" stall.
3. Inspect the served asset:
   ```
   curl -sI https://kol360.bio-exec.com/images/logo-white.png | grep -i content-length
   # Expected: Content-Length: ~5000 (down from 899105)
   ```
4. Re-test on a mobile data connection if available — logo should appear in the same render pass as the rest of the email.

### A3. Users page admin actions unchanged

Pure dead-code removal. Smoke that all paths still work:
- Invite a test user → email arrives.
- Approve a PENDING user → status flips to ACTIVE.
- Resend Invite on a PENDING user → second email arrives with a new temp password.
- Disable an ACTIVE user → status flips to DISABLED.
- Enable a DISABLED user → status flips back to ACTIVE.
- Delete a test user → row disappears + Cognito user gone.

Each is a one-click. If any throw 500 instead of the expected 200/204, something in the cleanup regressed — roll back to 4.1.40.

## Phase B — 24h watch

### B1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### B2. No new error patterns

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?ERROR ?error ?Error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

Watch for any `/api/v1/users/*` 500s — would indicate a missed code path in the cleanup.

## Rollback gate

If A1–A3 don't pass within 30 min, redeploy `prod-rel-4.1.40` (v1.17.60). Logo bloats back to 899 KB; 77 lines of dead code return. No data destruction.
