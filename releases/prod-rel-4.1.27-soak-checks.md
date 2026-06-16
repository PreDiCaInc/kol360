# prod-rel-4.1.27 — Soak Checks (v1.17.47)

Tag at the merge commit on `main`. 6 small UX wins. No migrations.

## Phase A — Sanity (within minutes of deploy)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.47", ... }
```

### A2. View Scores scoped to active DA (the Karpecki bug)

Admin → HCPs → "View Scores" → pick `Medical Oncology` → search for `Paul Karpecki`.
- **Pre-fix:** he appeared with all `—` cells.
- **Post-fix:** he's not in the result set (he's linked to Optometry / dry-eye DAs only).

Switch DA to a dry-eye / optometry analysis → he appears again with populated scores.

### A3. Decile chart sorts 1→10

Insights → Demographics → Treatment Decile bar chart. Bars walk left-to-right as `Decile 1`, `Decile 2`, …, `Decile 10` regardless of population per bucket. Same on KOL Profile → "Nominations by Treatment Decile" chart.

API-level sanity:
```bash
TOK=...
curl -s "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/<DA>/demographics" \
  -H "Authorization: Bearer $TOK" | jq '.byDecile | map(.name)'
# Expected: ["Decile 1","Decile 2",…,"Decile 10"]
```

### A4. Client domain input accepts commas + spaces

Admin → Clients → Create / Edit → Allowed Email Domains.
- Type `sunpharma.com, na.sunpharma.com` (commas + spaces) → both stay visible while typing.
- Tab out → field shows `sunpharma.com, na.sunpharma.com` (normalized).
- Submit → list saved.

### A5. Nominators Export Excel

Insights → KOL Explorer → pick any HCP → scroll to Nominators table.
- "Export Excel" button visible next to "Show All".
- Click → downloads `<kol-slug>-nominators.xlsx` with one row per nominator. Includes the new columns: Name, NPI, Specialty, State, Nomination Type, [Campaign — PLATFORM_ADMIN only], Responded At.

### A6. NPI inline next to name

Same KOL Profile header. Verify:
- Name (`text-4xl extra-bold`) and "NPI 1619910569" sit on the same baseline.
- Long names + credentials wrap gracefully on narrow viewports.

### A7. Nominator names hyperlink when scored

In the same Nominators table:
- Nominators with scores in this analysis: name renders as a primary-color hyperlink. Click → ProfileView switches to that nominator's KOL Profile. Back button works.
- Nominators without scores: name renders as plain text (no link).

API-level sanity:
```bash
curl -s "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/<DA>/kol-profile/<HCP>" \
  -H "Authorization: Bearer $TOK" | jq '.nominators[0] | {name, hasScores}'
# Expected: { "name": "...", "hasScores": true|false }
```

### A8. E2E green

```bash
cd e2e && pnpm test:api:test:auth
# Expected: insights-report.test.ts new assertions pass
# (byDecile ordering + nominator.hasScores shape)
```

---

## Rollback gate

If A1–A4 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.26` (v1.17.46). Effects per the handoff "Rollback" section.
