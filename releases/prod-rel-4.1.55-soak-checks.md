# prod-rel-4.1.55 — Soak Checks (v1.17.75)

Tag at the merge commit on `main`. Phase 3 polish for the tours system. **No migration.**

## Phase A — Version + sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.75", ... }
```

### A2. Tours from 4.1.54 still work

- `/admin/dashboards/<disease-area-id>` → "How to…" dropdown.
- All 5 case studies listed as launchable tours (no "coming soon" tags).
- Case Study 1 tour launches, advances through target-click steps (Skip + Prev only), checkpoint appears, completes cleanly.

## Phase B — First-visit ring

### B1. Fresh device sees the ring

- Load `/admin/dashboards/<disease-area-id>` in an incognito window.
- The "How to…" button has a teal outline ring + ~3 pulses that expand-and-fade over 3 seconds.
- Inspect the button element — should carry class `kol360-how-to-cta-pulse` during the animation window.

### B2. Second visit suppresses the ring

- Reload the same URL in the same window.
- Ring does NOT appear.
- localStorage now has `kol360.how-to-cta-shown-at` with a timestamp value.

### B3. Prefers-reduced-motion respected

- Enable "Reduce Motion" in System Settings > Accessibility.
- Clear the localStorage flag + reload.
- The ring appears as a static outline (no animation). Not disruptive.

## Phase C — "Show me the summary"

### C1. Popover renders per case study

- Open the Insights Use Cases drawer via "Read the full documentation" (bottom of How to… menu).
- Each case study card has both a **▶ Take the tour** button and a **📄 Show me the summary** button.
- Click "Show me the summary" on Case Study 1. A popover with "Case takeaways" heading + bulleted list appears above the drawer.
- Verify all 5 case studies have summaries authored (bullets, not empty).

### C2. Popover doesn't interfere with tour engine

- With a summary popover open, click "Take the tour" on another case. Popover dismisses, tour launches cleanly.

## Phase D — Playwright E2E

### D1. Tour specs pass against test env

```bash
cd e2e
pnpm test:web:test
```

Expected: `tour.spec.ts` — 6 tests pass. `app.spec.ts` + `navigation.spec.ts` unchanged.

## Phase E — 24h watch

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for `tour.launched` telemetry — a spike would indicate the CTA ring successfully drove first-visit engagement. Absence of change means the ring didn't move behavior; consider revisiting placement.

## Rollback gate

If B1/B2 fail (ring never appears OR keeps re-firing), redeploy 4.1.54. All tour behaviors from 4.1.54 remain intact. The summary popover + Playwright specs are additive and can't break anything customer-visible.
