# prod-rel-4.1.23 — Soak Checks (v1.17.43)

Tag at the merge commit on `main`. **No migrations.** P1 customer-blocking auth hotfix on the v1.17.42 Influencer Type import + 2 UI polish improvements.

## Phase A — Sanity (within minutes of deploy)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.43", ... }
```

### A2. Influencer Type upload works end-to-end

Admin → HCPs → Import Influencer Types:
1. Select a disease area (e.g. Sun Pharma Dry Eye)
2. Verify the file picker accepts `.xlsx`, `.xls`, `.csv` (drop a `.xlsx` to test)
3. Verify the "Download Template" button generates `influencer-types-template.csv` with the 3 canonical types as sample rows
4. Upload the data team's actual CSV
5. Preview dialog renders: "Based on this file, X HCPs will be classified for [DA Name]" with countsByType breakdown
6. Confirm import → result toast shows X classified

**Pre-fix repro:** every upload returned 401 "Missing or invalid authorization header". Post-fix should succeed.

### A3. DB sanity post-import

```sql
SELECT da.name, COUNT(*) FILTER (WHERE hda."influencerType" IS NOT NULL) AS classified
FROM "HcpDiseaseArea" hda
JOIN "DiseaseArea" da ON da.id = hda."diseaseAreaId"
GROUP BY da.id, da.name
ORDER BY classified DESC;
-- Expected: at least 1 row with classified > 0 after data team upload.
```

### A4. Audit row

```sql
SELECT action, "entityId", "newValues", "createdAt"
FROM "AuditLog"
WHERE action = 'hcp.influencer_types_imported'
ORDER BY "createdAt" DESC LIMIT 5;
-- Expected: 1 row per successful import with the file's counts.
```

---

## Phase B — Functional (UI polish)

### B1. Insights → KOL Explorer column tightening

1. Open Insights → pick disease area / client → KOL Explorer (Weighted Score tab)
2. Click "Columns" → uncheck Degree + City (defaults)
3. The table should now FIT on a standard 13" laptop (1280px+) without horizontal scroll
4. Score cells are tighter (centered, less padding)
5. Sticky # + Name remain anchored during horizontal scroll on smaller viewports

### B2. Sociometric Summary

1. Insights → Sociometric Summary
2. Per-category heatmap cells tighter (`px-2` not `px-3`)
3. Sticky # + Name remain anchored on horizontal scroll

### B3. E2E full suite

```bash
cd e2e && pnpm test:api:test:auth
# Expected: 224 passed / 7 skipped / 0 failed (same as 4.1.22 baseline).
```

---

## Rollback gate

If A1-A2 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.22` (v1.17.42). Influencer Type upload returns to 401-on-upload state; data team mitigation = direct psql write to `HcpDiseaseArea.influencerType` until 4.1.23 redeploys.
