# prod-rel-4.1.45 — Soak Checks (v1.17.65)

Tag at the merge commit on `main`. Three UX polish items + one tooling fix. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.65", ... }
```

### A2. Intro tab link opens the drawer

1. Insights dashboard → Intro tab (default).
2. Scroll to bottom of Methodology card.
3. Click the "📖 Insights — Use Cases" link.
4. **Expected**: right-side drawer opens (same as clicking the "Use Cases" button in the header). No navigation away from the current page.
5. Close the drawer. URL is unchanged (`/admin/dashboards/[id]`).

### A3. Drawer is wider

1. Open the drawer (button or link).
2. **Expected**: drawer occupies ≈ 60–70% of viewport horizontally (varies by monitor size; capped at 1100px on ultra-wide displays).
3. Resize the browser window. Drawer should shrink/grow proportionally (65vw) down to the sm breakpoint, where it goes full-width.

### A4. Favicon on the standalone guide page

1. Click the "Open full page" link inside the drawer (top right). New tab opens at `/admin/dashboards/guide`.
2. **Expected**: browser tab shows the KOL360 favicon.

### A5. Existing surfaces unchanged

- Use Cases button in header still opens drawer (unchanged).
- Per-tab `?` popovers still work (unchanged).
- Standalone page render unchanged (only the favicon header tag added).

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

If A1–A4 don't pass, redeploy `prod-rel-4.1.44` (v1.17.64). Inline link reverts to navigation; drawer width back to 720px; favicon falls back to browser default. Tooling change (beid_seq advance in sync script) is dev-side only — no effect on rollback.

No data destruction.
