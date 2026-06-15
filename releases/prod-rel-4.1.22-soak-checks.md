# prod-rel-4.1.22 — Soak Checks (v1.17.42)

Tag at the merge commit on `main`. **1 idempotent migration.** Data-team-managed `influencerType` replaces algorithmic determination — coordinate the deploy window with the data team (see handoff "Rollout — CRITICAL").

## What 4.1.22 changed

1. **`HcpDiseaseArea.influencerType` column** — populated by the data team via CSV upload (`/api/v1/hcps/influencer-types/import`).
2. **Read path** in `insights-report.service.ts` switched from `determineInfluencerType()` (computed) to `loadManualInfluencerTypes()` (manual). NULL when not classified, no fallback.
3. **HCP admin UI** has a new "Import Influencer Types" button: select disease area, upload CSV, preview ("Based on this file, X HCPs will be classified for Y"), confirm.
4. Plus bundled UI polish (sticky cols, column-visibility selector, sidebar collapse-click fix, PLATFORM_ADMIN view-as branding).

---

## Phase A — Sanity (within minutes of deploy)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.42", ... }
```

### A2. Migration applied + column present

```bash
PGPASSWORD=... psql -h <prod-tunnel> -p 5433 -U kol360admin -d kol360 -c "
SELECT column_name FROM information_schema.columns
WHERE table_name = 'HcpDiseaseArea' AND column_name = 'influencerType';
"
# Expected: one row returned.
```

If absent, run:
```bash
psql ... -v ON_ERROR_STOP=1 -f apps/api/prisma/migrations/20260614_hcp_disease_area_influencer_type/migration.sql
```
Idempotent — safe to re-run.

### A3. Pre-flight check: how many HCPs already classified per disease area?

```sql
SELECT da.name, da.id,
       COUNT(*) FILTER (WHERE hda."influencerType" IS NOT NULL) AS classified,
       COUNT(*) AS total_linked
FROM "HcpDiseaseArea" hda
JOIN "DiseaseArea" da ON da.id = hda."diseaseAreaId"
GROUP BY da.id, da.name
ORDER BY classified DESC;
```

Until the data team uploads, all disease areas read 0 classified → all Insights influencer-type columns will read NULL for that DA. Confirm this is expected.

### A4. Insights filter dropdown behavior

Insights → KOL Explorer → Influencer Type filter dropdown. After deploy + before classifications uploaded, applying any influencer-type filter returns zero rows (HCPs without a value drop out). This is expected; coordinate with the data team to upload first.

---

## Phase B — Functional (after data team uploads the first CSV)

### B1. Upload a small test CSV via admin UI

Admin → HCPs → Import Influencer Types:
- Select Sun Pharma's Dry Eye (or whichever disease area is being seeded).
- Upload a 5-row test CSV:
  ```
  NPI,InfluencerType
  9990000001,National Leaders
  9990000002,Rising Stars
  9990000003,Regional Influencers
  ```
- Preview dialog should show: "Based on this file, 3 HCPs will be classified for [DA Name]" with a breakdown by type.
- Confirm.

### B2. DB sanity

```sql
SELECT hcp.id, hcp.npi, hcp."firstName", hcp."lastName", hda."influencerType"
FROM "Hcp" hcp
JOIN "HcpDiseaseArea" hda ON hda."hcpId" = hcp.id
WHERE hda."diseaseAreaId" = '<DA-id>'
  AND hda."influencerType" IS NOT NULL
ORDER BY hcp."lastName";
```

### B3. Audit trail

```sql
SELECT action, "entityId", "newValues", "createdAt"
FROM "AuditLog"
WHERE action = 'hcp.influencer_types_imported'
ORDER BY "createdAt" DESC LIMIT 5;
-- Expected: one row per import call with totalRows / matched / countsByType / errors.
```

### B4. Insights reads it back

Insights → KOL Explorer for the same disease area (PLATFORM_ADMIN with that client selected) → the 3 test HCPs show their classification in the "Type" column. Filter dropdown narrows correctly.

### B5. UI polish (bundled)

- Insights → KOL Explorer → click "Columns" → toggle a few columns off → reload → selection persisted.
- Insights → Sociometric Summary → sticky # + Name visible during horizontal scroll. Same Columns selector works.
- Collapse the sidebar via the toggle → click "KOL Insights" — sidebar expands AND opens the section.
- PLATFORM_ADMIN: in Insights pick a client → sidebar logo + brand stripe update to client branding. Navigate away from Insights → reverts to BioExec.

### B6. E2E green

```bash
cd e2e && pnpm test:api:test:auth
# Expected: influencer-type-import.test.ts — 4/4 passing
```

---

## Phase C — 24h watch

### C1. CloudWatch — error rate

Standard 24h post-deploy watch on `kol360-api`:
```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?error ?ERROR ?"5xx"' \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -50
```

### C2. Data team coverage check

After 24h, run A3 again. If some disease areas are still at 0 classified, follow up with the data team — those clients see empty influencer-type columns until classifications arrive.

---

## Rollback gate

If A1-A2 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.21` (v1.17.41). The new column stays in the DB (harmless). Any classifications uploaded stay in the DB and become live again on next forward roll.
