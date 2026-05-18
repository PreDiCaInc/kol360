# Migration Conventions — Idempotency (MANDATORY)

Production sometimes applies migration `.sql` files with raw **psql**, not
`prisma migrate deploy`. A re-applied non-idempotent migration **hard-fails**
(`CREATE TABLE` / `ADD CONSTRAINT` errors if the object already exists).

**Every migration `.sql` (hand-written OR Prisma-generated) must be edited to be
safely re-runnable before commit:**

- Use `IF NOT EXISTS` / `IF EXISTS`: `CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`,
  `CREATE EXTENSION IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
  `DROP TABLE/COLUMN IF EXISTS`.
- Postgres has **no** `ADD CONSTRAINT IF NOT EXISTS` — wrap each FK/constraint
  in a guarded `DO` block:
  ```sql
  DO $$ BEGIN
    ALTER TABLE "T" ADD CONSTRAINT "T_x_fkey"
      FOREIGN KEY ("x") REFERENCES "R"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  ```
- `prisma migrate dev` emits non-idempotent SQL — **always retrofit it.**
- Verify: re-run against a DB that already has it —
  `psql -v ON_ERROR_STOP=1 -f migration.sql` must exit 0 (NOTICEs are fine).

Reference idempotent migrations: `20260514_add_pg_trgm_for_fuzzy_match`,
`20260515_add_kol_analysis_scoring`.

---

# Migration Notes: Add isLite and HCP Exclusions

## Changes Made

### 1. Client Model
- Added `isLite` boolean field (default: false)
- Added index on `isLite` field
- Added relation to `ClientHcpExclusion` model

### 2. ClientHcpExclusion Model (New)
This model stores client-level HCP exclusions. HCPs excluded at the client level won't appear in any campaigns for that client.

Fields:
- `id`: Unique identifier
- `clientId`: Reference to Client
- `hcpId`: Reference to HCP
- `reason`: Optional reason for exclusion
- `createdBy`: User who created the exclusion
- `createdAt`, `updatedAt`: Timestamps

Indexes:
- Unique constraint on `[clientId, hcpId]`
- Index on `clientId`
- Index on `hcpId`

### 3. CampaignHcpExclusion Model (New)
This model stores campaign-level HCP exclusions. HCPs excluded at the campaign level won't appear in that specific campaign.

Fields:
- `id`: Unique identifier
- `campaignId`: Reference to Campaign
- `hcpId`: Reference to HCP
- `reason`: Optional reason for exclusion
- `createdBy`: User who created the exclusion
- `createdAt`, `updatedAt`: Timestamps

Indexes:
- Unique constraint on `[campaignId, hcpId]`
- Index on `campaignId`
- Index on `hcpId`

### 4. Campaign Model
- Added relation to `CampaignHcpExclusion` model

### 5. Hcp Model
- Added relation to `ClientHcpExclusion` model
- Added relation to `CampaignHcpExclusion` model

## Migration Command
To apply this migration:
```bash
cd apps/api
npx prisma migrate dev --name add_islite_and_hcp_exclusions
```

Or to generate the client only:
```bash
npx prisma generate
```
