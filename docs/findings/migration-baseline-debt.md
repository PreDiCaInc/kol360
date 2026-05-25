# Migration Baseline Debt (tracked — NOT a prod-rel-3.0 blocker)

## Finding

The `apps/api/prisma/migrations/` folder is **not a faithful, replayable
history**. Evidence:

- `prisma migrate diff --from-migrations` fails: `20241219_add_email_templates`
  sorts before `20251212074948_init` and alters `Campaign` before any
  migration creates it. The folder cannot build a DB from scratch.
- `20251212074948_init` is an early `prisma db push` snapshot, not a true
  baseline. A static audit (schema.prisma vs the union of all migration SQL)
  shows ~3 tables, ~3 enum types, several enum values, and 35+ columns/indexes
  that **no migration file creates**.

## Why this is NOT a cutover blocker

Those objects **exist in the live databases** — verified on test
(`ClientHcpExclusion`, `CampaignHcpExclusion`, `DashboardComponent`,
`NominationType` type, `HcpCampaignScore` per-type columns, `Question.
nominationType`, `AuditLog.actorType`, `Client.isLite` all present). They were
applied historically via `db push` / direct psql in earlier eras, just never
captured as migration files.

The **authoritative** check for the prod cutover is the prod team's
`prisma migrate diff --from-url <PROD> --to-schema-datamodel schema.prisma`.
That compares the *real prod schema* to schema.prisma and reported only the
genuinely-recent gaps that received neither a migration nor a historical
db-push to prod:

- `OptOut.@@index([hcpId])` + `OptOut_hcpId_fkey` → fixed by
  `20260518_add_optout_hcpid_index_fk`
- `NominationType.REGIONAL_LEADER` → fixed by
  `20260518_add_regional_leader_nomination_type`

(+ the permanent benign `*_trgm_idx` GIN false-positive Prisma can't express.)

**Discriminator:** old db-push-era objects are present on prod (not drift);
only post-last-db-push schema additions lacking a migration are real prod
gaps. The prod-diff finds exactly those.

## Real consequences (separate, post-cutover)

The folder debt still matters for:
- Disaster recovery / new-environment bootstrap from migrations (would be
  broken today).
- Any future `prisma migrate diff --from-migrations` / shadow-DB workflow.
- The standing "every schema change needs a migration" convention has been
  violated en masse historically.

## Recommended remediation (own initiative, after prod-rel-3.0 soaks)

Do **NOT** author per-object migrations for the static-audit list — those
objects already exist on prod; non-idempotent `CREATE`/`ADD` would fail the
cutover, and even idempotent ones are noise/risk on the critical path.

Instead, a one-time **baseline reconciliation**:

1. From a known-good source DB (prod, post-cutover), generate the true
   corrective delta: `prisma migrate diff --from-migrations prisma/migrations
   --to-url <PROD> --script` (with a shadow DB) — or squash to a fresh
   baseline via `prisma migrate diff --from-empty --to-url <PROD> --script`
   into a new `00000000_baseline` and `migrate resolve --applied` it
   everywhere.
2. Validate the new baseline replays cleanly into an empty shadow DB.
3. Adopt going forward with the idempotency convention already in
   `apps/api/prisma/migrations/migration_notes.md`.

Scope/sequence: its own effort with its own runbook, **after** prod-rel-3.0
is cut over and soaked. Tracked here so the analysis isn't lost.
