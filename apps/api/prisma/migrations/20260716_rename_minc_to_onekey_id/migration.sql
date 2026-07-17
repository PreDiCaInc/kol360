-- v1.19.0 — Rename Canada national-ID type: 'MINC' → 'ONEKEY_ID'.
-- Ticket: docs/findings/canada-minc-checks-reference-2026-07-15.md (updated).
-- Pteam ask 2026-07-16: align internal vocabulary with IQVIA OneKey
-- Reference (which the Canada team will provide).
--
-- Hcp.nationalIdType is a TEXT column with a default of 'NPI' (not a
-- Prisma enum type), so this migration is a plain UPDATE of the two
-- discrete values that occur in the wild:
--   - 'NPI'  → unchanged
--   - 'MINC' → 'ONEKEY_ID'
--
-- Idempotent: re-running the UPDATE against a DB that has already been
-- migrated (no 'MINC' rows remain) is a no-op — the WHERE clause
-- matches zero rows on second run.
--
-- Rollback: `UPDATE "Hcp" SET "nationalIdType" = 'MINC' WHERE
-- "nationalIdType" = 'ONEKEY_ID'` — but code that reads the column
-- also needs the reverted enum. Prefer a code-side revert first.

UPDATE "Hcp" SET "nationalIdType" = 'ONEKEY_ID' WHERE "nationalIdType" = 'MINC';
