# prod-rel-4.1.44 — Soak Checks (v1.17.64)

Tag at the merge commit on `main`. One-paragraph Intro tab follow-up to 4.1.43. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.64", ... }
```

### A2. Intro tab links to the Use Cases guide

1. Open Insights dashboard for any disease area.
2. Land on the Introduction tab (default).
3. Scroll to the bottom of the Methodology card.
4. **Expected**: paragraph reading roughly "For examples of how to apply these rankings to real business questions — organizing dinners, picking symposium speakers, building advisory boards — see the 📖 **Insights — Use Cases** guide."
5. Click the link. **Expected**: navigates to `/admin/dashboards/guide` — the standalone guide page from 4.1.43 loads.
6. Browser back. Confirm you land back on the Introduction tab.

### A3. Everything else in the Intro tab unchanged

Compare against 4.1.43 — Purpose card + Methodology card text bodies + hero header all identical. Only the new closing paragraph is new.

## Phase B — 24h watch

### B1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

## Rollback gate

If A1–A2 don't pass, redeploy `prod-rel-4.1.43` (v1.17.63). Intro tab reverts.

No data destruction.
