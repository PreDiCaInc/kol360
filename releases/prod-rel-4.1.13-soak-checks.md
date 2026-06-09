# prod-rel-4.1.13 — Soak Checks (v1.17.30)

Tag at the v1.17.30 merge commit on `main`. One P1 hotfix (Core Focus filter MULTI_CHOICE) + the first slice of client branding. **No DB migration.**

## What 4.1.13 changed (the universe of risk)

1. **`applyRespondentFilters.coreFocuses` branch** — adds MULTI_CHOICE handling that the existing `practiceSettings` branch already had.
2. **`GET /api/v1/clients/me`** — new endpoint scoped to `requireTenantUser`.
3. **Header brand badge** — new component in `apps/web/src/components/layout/`.
4. **Admin layout** — adds `<ClientThemeProvider>` wrapper + `<BrandStripe>` 4px component above the existing header.
5. **Client edit form** — adds a `logoUrl` text input.

Phase 2 theming (CSS vars) ships **visually no-op on prod** until an admin edits a client's `primaryColor` (all 3 prod clients are on default `#0066CC`).

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.30", ... }
```

Web — open `https://kol360.bio-exec.com`, footer / admin header should report `1.17.30`.

### A2. `/clients/me` endpoint mounted + gated

```bash
# Unauth — expect 401 (auth gate works)
curl -s -o /dev/null -w "%{http_code}\n" https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/clients/me
# → 401

# Auth as PLATFORM_ADMIN — expect 200 with body "null"
TOK=$(... ## mint via cognito)
curl -s -H "Authorization: Bearer $TOK" https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/clients/me
# → null
```

Pre-4.1.13 the route returned 404 — it didn't exist. A 401 or 200+null both confirm mount + correct auth gate.

### A3. Core Focus filter returns >0 on a real DA

Open `/admin/insights/<sun-pharma-dry-eye>` → Demographics tab → top filter bar.

- Baseline (no filter): note the total respondents (should be ~756).
- Pick **any** Core Focus value from the dropdown (e.g. "Glaucoma", "Dry Eye (including OSD, MGD, and NK)", "Cataract/Refractive Surgery").
- Total respondents updates to a non-zero value (Glaucoma → ~156, Dry Eye → ~288).
- Pre-fix: any selection here zeroed the dashboard.

### A4. Header brand badge visible (admin context)

Log in as PLATFORM_ADMIN. No impersonation → no badge (correct: admin has no tenant).

Pick a client from the "View as Client" dropdown in the user menu:
- Badge appears in the header to the left of the user menu.
- Format: `Viewing as <ClientName>` + small color dot.
- 4px stripe at the very top of the layout shows the brand color (default `#0066CC` for all 3 prod clients today).

Stop impersonating: badge + stripe both disappear.

---

## Phase B — Functional smoke (~10 minutes)

### B1. Core Focus filter across all three Insights endpoints

Same DA. Apply a Core Focus selection and verify each surface re-renders:

| Tab | Surface | Expected |
|---|---|---|
| Demographics | Total respondents header | Non-zero, matches Core Focus selection |
| Demographics | `byRole`, `byState`, `byPracticeSetting` distributions | All narrow proportionally |
| Sociometric Leaders | Matrix at the top | List narrows; non-empty |
| Benchmarking (per-nomination LeaderTable) | Each card | List narrows; non-empty |

Pre-fix: all four would zero out the moment you picked a Core Focus value.

### B2. Core Focus + Practice Setting filter combine (intersection)

Same DA. Pick a Core Focus value AND a Practice Setting value. Total should narrow further (intersection). Both branches need to handle MULTI_CHOICE — Practice Setting already did, Core Focus now does. If either branch is broken, the count zeros out.

### B3. Header brand badge as TEAM_MEMBER

Log in as a TEAM_MEMBER (e.g. a Sun Pharma team user, if one exists in prod — otherwise skip this check on prod; it was verified on test). Header shows:
- Brand badge with the client's name (no logo if `logoUrl` is empty, which it is for all 3 prod clients today).
- Initials fallback in a `primaryColor`-tinted circle.

### B4. Brand stripe color follows impersonation

As PLATFORM_ADMIN:
1. Open dev tools, inspect the 4px stripe at the top → `background-color: var(--brand-primary, #0066CC)`.
2. Pick a client from "View as Client" → confirm the inline style on `<html>` updated `--brand-primary` to that client's `primaryColor` (default `#0066CC` for all 3 prod clients, so visually unchanged).
3. Stop impersonating → `--brand-primary` should revert to `#0066CC` and the stripe component should unmount.

### B5. `logoUrl` input on the client form

Admin → Clients → pick any client → Edit. Verify:
- "Logo URL" text field present between Client Name and Brand Color.
- Field is editable; pastes a URL cleanly.
- Cancel doesn't persist. Saving an empty value persists `null`.
- Saving a non-URL string is rejected by the Zod schema (form shows validation error).

Optional: paste a real CDN URL for one prod client, save, reload, observe the badge logo image render in the header.

### B6. Re-soak prior bundles

- **prod-rel-4.1.12**: Demographics Practice Setting multi-select still works (B1 from 4.1.12 soak). Total column position on Sociometric matrix still correct.
- **prod-rel-4.1.11**: Demographics filter bar stays mounted across refetches.
- **prod-rel-4.1.10**: AR + AZ + CA state filter on Demographics doesn't 500.

---

## Phase C — 24h watch

### C1. CloudWatch — API error rate

Watch the `kol360-api` service for the 24h post-deploy window. Baseline error rate is <0.5%. Any spike — especially 5xx on `/insights/*/demographics`, `/insights/*/leader-rankings`, `/insights/*/sociometric-summary`, or `/clients/me` — should be investigated immediately.

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?error ?ERROR ?"5xx"' \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -50
```

### C2. Filter-application performance

The Core Focus fix adds a single conditional check (`questionType === 'MULTI_CHOICE'`) inside an existing loop. No new prisma queries, no new N+1 risk. Watch for any p95 latency regression on the three Insights endpoints — none expected.

### C3. `/clients/me` traffic profile

Brand-new endpoint. Expected pattern: 1 call per admin page load per non-PLATFORM_ADMIN user (cached for 5 min by React Query). Watch for:
- Abnormally high call rate (would indicate the React Query cache isn't taking).
- Any 500s (would indicate `request.user.tenantId` isn't set on a token shape we didn't anticipate).

### C4. Customer signal on Core Focus

Loop back with the customer who reported the original bug (2026-06-09) within 48h of deploy to confirm the filter is now usable for their workflow.

---

## Rollback gate

If A1-A4 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.12`. Effects per the [handoff](prod-rel-4.1.13-handoff.md#rollback).
