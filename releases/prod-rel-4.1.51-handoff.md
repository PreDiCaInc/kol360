# prod-rel-4.1.51 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible.
**Tag:** `prod-rel-4.1.51` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.50` (v1.17.70).
**Bundles:** v1.17.71 — Curation-svc integration hardening. Closes the four sign-off conditions from the curation-svc team's review of [`curation-svc-canada-integration-spec-v1.md`](curation-svc-canada-integration-spec-v1.md).

Ticket: [`docs/findings/canada-hcp-support-lite-plan-2026-06-25.md`](../docs/findings/canada-hcp-support-lite-plan-2026-06-25.md).
Review: [`curation-svc-canada-integration-spec-v1-review.md`](curation-svc-canada-integration-spec-v1-review.md).
Revised spec: [`curation-svc-canada-integration-spec-v2.md`](curation-svc-canada-integration-spec-v2.md).

## TL;DR

Curation team ack'd the CA integration spec conditionally on four hard asks. All four are closed in this release:

1. **Server-side pairing enforcement** — `getBeIdRequestSchema.superRefine` now rejects unpaired `country`/`nationalIdType` combos with a 400 (`'US' + 'MINC'` and `'CA' + 'NPI'`). Was a documented invariant; now a schema invariant.
2. **Response echo** — `POST /api/v1/hcps/get-beid` returns `country` + `nationalIdType` in the response so the client can confirm what got stored without a follow-up `GET`. Additive; existing curation callers that ignore them keep working.
3. **Spec §5.3 rewritten** — "optional but recommended" → "curation-svc always sends both fields." Defaults preserved on the server only for pre-integration callers (of which there are zero in prod today).
4. **Spec §7 merge-tombstone pointer + example neutralized** — new Q5 pointing at `curation-kol360-sync-spec-v0.3.md §6` for MINC corrections after minting. "Sun Pharma US dashboard" placeholder swapped to "a US-region client" throughout.

Non-blocking review asks also addressed inline in spec v2: cross-licensing plan (Path B — mint under primary, capture alternate in `discoveredFrom.notes`), backfill identification (curation-svc supplies beId list), rate limits (no hard cap; App Runner and Cognito ceilings identified), state validation (freeform 2-letter with client-side responsibility).

## What changes for customers

**Nothing user-visible.** All changes are on the M2M curation surface + the schema/spec used only by the curation-svc integration.

## API changes

**Additive.**

- `POST /api/v1/hcps/get-beid` request — enforcement stricter: unpaired `country`/`nationalIdType` combos are now 400 (previously accepted with per-field independent defaults). Callers who send matched pairs or omit both are unaffected. **No prod caller sends unpaired combos today** (verified — curation-svc hasn't rolled out yet, and no other client uses this endpoint).
- `POST /api/v1/hcps/get-beid` response — now includes `country` + `nationalIdType`. Existing clients that ignore unknown fields keep working.
- No other endpoints touched.

New 400 error shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "nationalIdType: country and nationalIdType must be paired: 'CA' → 'MINC', 'US' → 'NPI'"
}
```

## Migrations

**None.** Schema unchanged from 4.1.50.

## Risk

**Very low.**
- Schema pairing rule can only 400 a caller that was already sending wrong data. No prod caller currently sends `country`/`nationalIdType` at all (curation-svc pre-integration), so the enforcement won't affect any live traffic.
- Response additive fields — Fastify serialization + `GetBeIdResponse` type both updated; a Zod-validated schema rejection on the response would fail the build, not runtime.
- Test coverage: 8 new unit tests on the schema, 3 new e2e tests hitting the curation route (CA happy path + both pairing rejections).

Rollback: redeploy 4.1.50 (v1.17.70). Curation-svc will (once integrated) fall back to sending without pairing enforcement — the invariant reverts to "documented but unenforced." No data-integrity loss.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.71 |
| Shared vitest | 198/198 pass (+ 8 new curation pairing tests) |
| API vitest | 231/231 pass |
| Web vitest | 91/91 pass |
| E2E `curation-get-beid` (post-deploy) | 3 new tests: CA happy path + 2 pairing rejections |
| E2E full workflow (post-deploy) | via `tdct` |

## What curation-svc team needs

- Point at [`curation-svc-canada-integration-spec-v2.md`](curation-svc-canada-integration-spec-v2.md) for their sprint planning.
- Once 4.1.51 is in test env, they can run their client-side integration against `https://mpcu4inmtj.us-east-2.awsapprunner.com` or `https://koltest.bio-exec.com` — same M2M client id + scope work.
- Smoke test window to coordinate before prod flip.

## See also

- Soak checks: [`prod-rel-4.1.51-soak-checks.md`](prod-rel-4.1.51-soak-checks.md)
- Curation spec v2 (revised): [`curation-svc-canada-integration-spec-v2.md`](curation-svc-canada-integration-spec-v2.md)
- Curation team review: [`curation-svc-canada-integration-spec-v1-review.md`](curation-svc-canada-integration-spec-v1-review.md)
- Curation spec v1 (superseded, kept as history): [`curation-svc-canada-integration-spec-v1.md`](curation-svc-canada-integration-spec-v1.md)
- Predecessor: [`prod-rel-4.1.50-handoff.md`](prod-rel-4.1.50-handoff.md)
- Source ticket: [`docs/findings/canada-hcp-support-lite-plan-2026-06-25.md`](../docs/findings/canada-hcp-support-lite-plan-2026-06-25.md)
