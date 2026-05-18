-- Drift fix: schema.prisma's NominationType enum has declared REGIONAL_LEADER
-- since 322050e, but no migration ever added it (mirrors the OptOut gap
-- class). Prod's enum lacks the value while Zod + the nomination-type UI
-- dropdown accept it → an enum-cast failure on prod writes post-deploy.
--
-- Mirrors the proven 20260306_add_biased_leader pattern; IF NOT EXISTS per
-- the idempotency convention (PG12+; prod is PG16.6). A lone ADD VALUE is
-- transaction-safe (the value is not used in this migration).
ALTER TYPE "NominationType" ADD VALUE IF NOT EXISTS 'REGIONAL_LEADER';
