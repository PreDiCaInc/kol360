# prod-rel-4.1.25 — Soak Checks (v1.17.45)

Tag at the merge commit on `main`. UX bundle on top of `prod-rel-4.1.24`. No migrations.

## Phase A — Sanity (within minutes of deploy)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.45", ... }
```

### A2. Layout shuffle visible

Open the admin app as ANY logged-in user:
- Header at the top now shows: **Breadcrumb (left)** + **ClientBadge (right)**. The user dropdown is GONE from the header.
- Sidebar bottom now shows: **User avatar** (with name + role if expanded, or just avatar if collapsed) ABOVE the collapse toggle.
- Click the avatar → dropdown appears (collapsed: opens to the right; expanded: opens upward). Dropdown content unchanged from before: user info, "View as Client" (PLATFORM_ADMIN only), Sign Out.

### A3. CLIENT_ADMIN nav simplification

Log in (or impersonate) as CLIENT_ADMIN:
- Left nav shows only one item: **KOL Insights** (direct link to `/admin/dashboards`).
- Sidebar default-collapses on mount.
- Direct URL nav to `/admin/hcps/scores` → bounces back to `/admin/hcps` (and `/admin/hcps` itself doesn't show "View Scores" button anymore).

### A4. PLATFORM_ADMIN unchanged on the View Scores side

PLATFORM_ADMIN still sees:
- HCP admin page → "View Scores" button visible.
- `/admin/hcps/scores` → loads. Columns: NPI / Name (both sticky-left) / Specialty / Location / score columns.
- Column Selector button next to Import Scores → toggle columns + selection persists in localStorage.
- Click NPI / Name / State / Specialty header → sort flips between asc / desc.

### A5. KOL Explorer + Sociometric Column Selector inline

Insights → KOL Explorer (Weighted Score tab) → action row shows: **Clear Filters · Columns · Export Excel** all inline (no separate row above the table). Same on Sociometric Summary.

### A6. HCP admin Import buttons consistent

Admin → HCPs:
- 4 import buttons all use the same Upload icon: Import HCPs, Import Aliases (was Users icon), Import Influencer Types, Import Segment Scores.
- "Import Segment Scores" button is new on this page — clicking it opens the SegmentScoreImportDialog (defaults to scoreType='segment').

### A7. Nominators table NPI + role-gated Campaign

Insights → KOL Explorer → click any HCP → scroll to the Nominators table near the bottom:

| Role | What you should see |
|---|---|
| PLATFORM_ADMIN (not impersonating) | 6 columns: Name / NPI / Specialty / State / Nomination Type / **Campaign** |
| PLATFORM_ADMIN (impersonating) | 5 columns — Campaign HIDDEN |
| CLIENT_ADMIN | 5 columns — Campaign HIDDEN |

NPI is sortable + renders as monospace tabular-nums.

---

## Phase B — Functional

### B1. `/hcps` sort API

```bash
TOK=...
curl -s "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/hcps?sortBy=name&sortOrder=asc&limit=10" \
  -H "Authorization: Bearer $TOK" | jq '.items | map(.lastName) | .[0:5]'
# Expected: ascending lastName list (or 200 OK with items array)
```

Repeat with `sortBy=npi`, `state`, `specialty`, and `sortOrder=desc`.

### B2. Unknown sortBy falls back gracefully

```bash
curl -s "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/hcps?sortBy=totallyBogus&limit=5" \
  -H "Authorization: Bearer $TOK" -o /dev/null -w "%{http_code}\n"
# Expected: 200 (caller sees default lastName-asc order; no error)
```

### B3. Nominator API includes npi

```bash
curl -s "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/<DA-id>/kol-profile/<HCP-id>" \
  -H "Authorization: Bearer $TOK" | jq '.nominators[0]'
# Expected: object includes `npi` (string or null) alongside the existing fields
```

### B4. E2E sort test

```bash
cd e2e && pnpm test:api:test:auth
# Expected: hcps-sort.test.ts — 4/4 passing
```

---

## Rollback gate

If A1-A2 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.24` (v1.17.44). Effects per the handoff "Rollback" section.
