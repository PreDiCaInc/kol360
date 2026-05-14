-- Enable pg_trgm extension for trigram-based fuzzy matching of HCP names.
-- Used by the nomination matcher to surface typo'd names (e.g. Donnenfield -> Donnenfeld)
-- that exact/contains queries miss.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes with gin_trgm_ops accelerate similarity() and % operator queries.
CREATE INDEX IF NOT EXISTS "Hcp_lastName_trgm_idx"
  ON "Hcp" USING gin ("lastName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Hcp_firstName_trgm_idx"
  ON "Hcp" USING gin ("firstName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "HcpAlias_aliasName_trgm_idx"
  ON "HcpAlias" USING gin ("aliasName" gin_trgm_ops);
