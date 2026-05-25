# Contributing to kol360

This doc captures team-visible engineering rules that have been hard-won
through production incidents. The full per-developer SOP lives in
`CLAUDE.md` (gitignored — it contains DB credentials and AWS ARNs).
This file is the subset that every contributor should know.

---

## When the migration adds a constraint (CHECK / UNIQUE / FK)

**A migration that adds a constraint is not done until two paired tests
exist alongside it.** Reviewers should reject a constraint migration
that doesn't ship with both.

### Why this rule exists

On 2026-05-25, every HCP CSV upload started crashing with HTTP 503,
blocking all admin users. Root cause:

- v1.15.31 added a fix that piped CSV specialty inputs through a
  canonical normalizer. The fix only patched the **CREATE** write path
  in `HcpService.importFromFile()`. The **UPDATE + MERGE** paths kept
  writing raw `'MD'` / `'OD'` / `'DO'` values to the column.
- The bug was harmless for ~2 months because the column had no
  whitelist constraint — non-canonical writes succeeded silently.
- v1.17.0 (2026-05-22) added the `Hcp_specialty_check` whitelist
  constraint. Every CSV row that matched an existing HCP (the common
  case) now violated the constraint, and Prisma's batched transaction
  semantics turned a single-row CHECK violation into a batch-wide 503
  with no per-row errors visible to the user.
- Three releases shipped (4.0, 4.1.1, 4.1.2) before users hit it.
  The E2E suite stayed green through all of them because **no test
  exercised the new constraint against the existing write paths.**

The cost of catching it 2 months late vs. at PR time: 3 days of
blocked admins + a P1 hotfix (v1.17.2 / prod-rel-4.1.3) under time
pressure.

### The two required tests

#### 1. Compatibility test — every existing write path still succeeds

Parameterize over the realistic input shapes the column accepts in
production and re-exercise every write path (CREATE, UPDATE, MERGE,
bulk-import, alias-import, nomination-create, etc.).

A single canonical input proves nothing — the bug class is "the
normalizer was applied to write path A but not write paths B and C."

```typescript
// Reference: e2e/api/hcp-import-update-specialty.test.ts
const RECOGNIZED_INPUTS: Array<{ input: string; canonical: string }> = [
  // ...full matrix of all forms the column accepts
];

it.each(RECOGNIZED_INPUTS)(
  'UPDATE path: CSV with "$input" lands canonical = "$canonical" (no 503)',
  async ({ input, canonical }) => {
    const csv = `NPI,...,Specialty\n${existingNpi},...,${input}`;
    const { status, data } = await client.importHcps(csv);

    expect(status).toBe(200);          // not 503
    expect(data.errors).toEqual([]);

    const { data: hcp } = await client.getHcp(existingHcpId);
    expect(hcp.specialty).toBe(canonical);
  }
);
```

#### 2. Rejection test — invalid inputs land as per-row errors, not 503

Intentionally violate the constraint and assert the API returns a
graceful per-row error, not an unhandled Prisma exception that turns
into 503. This catches the batch-rollback-as-503 behavior.

```typescript
const UNRECOGNIZED_INPUTS = ['Cardiology', 'Oncology', 'xyz123'];

it.each(UNRECOGNIZED_INPUTS)(
  'rejects "%s" as a per-row error (no 503)',
  async (input) => {
    const { status, data } = await client.importHcps(csvWith(input));

    expect(status).toBe(200);          // batch didn't crash
    expect(data.errors.length).toBeGreaterThanOrEqual(1);
  }
);
```

### Where the tests go

- Alongside the existing route's E2E file, **or**
- In a dedicated `e2e/api/{feature}-{constraint-name}.test.ts` file
  if the constraint cuts across several routes.

The new file lands in the same PR as the migration.

### Reference implementation

[`e2e/api/hcp-import-update-specialty.test.ts`](e2e/api/hcp-import-update-specialty.test.ts)
is the canonical example — 10 recognized input forms + 4 unrecognized
inputs, parameterized via `it.each`. Use it as a template.

---

## Migration SQL must be idempotent

The prod team sometimes applies migration `.sql` files with raw `psql`
rather than `prisma migrate deploy`. A re-applied non-idempotent
migration **hard-fails** (`CREATE TABLE` / `ADD CONSTRAINT` errors if
the object already exists). Every hand-written or Prisma-generated
migration MUST be edited to be safely re-runnable before commit.

- Use `IF NOT EXISTS` / `IF EXISTS` qualifiers:
  `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
  `CREATE UNIQUE INDEX IF NOT EXISTS`, `CREATE EXTENSION IF NOT EXISTS`,
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`.

- Postgres has **no** `ADD CONSTRAINT IF NOT EXISTS` — wrap each
  FK / CHECK / UNIQUE constraint in a `DO $$ ... EXCEPTION WHEN
  duplicate_object` block:

  ```sql
  DO $$ BEGIN
    ALTER TABLE "T" ADD CONSTRAINT "T_x_fkey"
      FOREIGN KEY ("x") REFERENCES "R"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  ```

- Verify by re-running the file against a DB that already has it:

  ```bash
  psql -v ON_ERROR_STOP=1 -f migration.sql   # must exit 0 (NOTICEs are fine)
  ```

- Prisma `migrate dev` generates non-idempotent SQL — always retrofit
  it before committing.

---

## Database schema changes require coordinated updates

Database changes touch multiple files. **NEVER** change just one
without the others:

1. `apps/api/prisma/schema.prisma` — the Prisma schema definition
2. `packages/shared/src/schemas/` — Zod schemas that mirror the model
3. `apps/api/src/services/` — services that use the changed model
4. `apps/api/src/routes/` — routes that use the changed data shape
5. Migration SQL file under `apps/api/prisma/migrations/` —
   created via `npx prisma migrate dev --name <descriptive_name>`
6. **If the migration adds a constraint** — paired E2E tests (see top)

Commit all related files together in one commit.

---

## E2E tests are mandatory for API changes

Every PR that changes API behavior — new endpoint, changed response
shape, new query param, modified validation rule, new constraint —
ships with paired E2E test updates. Lives in `e2e/api/`.

What does NOT need E2E tests (frontend-only):
- UI filter dropdowns, column additions, styling changes
- Frontend error display tweaks (toast messages, inline errors)
- Template text / font changes with no API impact

---

## Lessons from past incidents (for context, not enforcement)

These are the kinds of failures the rules above are designed to
prevent — referenced so the rules don't feel arbitrary.

- **2026-05-25 — HCP CSV import 503 (v1.17.0 → v1.17.2):** the
  motivating incident for the constraint-paired-tests rule.
- **2026-05-22 — Insights Dashboard silent-zero class (v1.15.0 →
  v1.17.2):** 5 prop-forwarding bugs latent for ~2 months because
  the backend silently returned `{0,0,0, notConfigured:true}` when
  required parameters were missing. Fix: route 400 on missing
  required params; add `enabled: !!param` gates in frontend hooks.
  The general lesson — **never return a "looks-real" success shape
  when a required input is missing.**
- **2026-05-21 — Specialty CHECK constraint v1.15.31:** the
  motivating incident for the migration-idempotency rule. Initial
  rollout hit a `duplicate_object` error on the second `psql` apply.
- **2026-02 — schema drift incident:** the motivating incident for
  the "schema change touches multiple files in one commit" rule.
  Direct SQL had renamed a column on prod but `schema.prisma`
  wasn't updated, causing Prisma to repeatedly try to recreate the
  old column on subsequent migrate operations.
