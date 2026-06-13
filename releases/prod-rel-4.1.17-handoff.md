# prod-rel-4.1.17 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible (code-only).
**Tag:** `prod-rel-4.1.17` → commit on `main` (cut immediately after this PR merges per the combined-PR workflow).
**Supersedes:** `prod-rel-4.1.16` (v1.17.33).
**Bundles:** v1.17.34 — three HCP admin-page polish items + nomination rematch (re-point a wrongly-matched nomination from the UI).

## TL;DR

Four items bundled in one release. Three HCP admin-page polish + one nomination admin feature (rematch).

1. **Full-name search returned 0 rows.** Searching for "Paul Karpecki" (full name) returned nothing, even though "Paul" or "Karpecki" alone returned that HCP. The search builder ran the entire query against `firstName` and `lastName` separately — neither field contains the multi-word string, so neither matched. Fix splits multi-token queries on whitespace and pairs the tokens across `firstName` + `lastName` in both orderings.

2. **NPI was not editable.** Even PLATFORM_ADMIN couldn't update an HCP's NPI — the input was hard-disabled, the submit stripped it from the payload, and the backend Zod schema explicitly omitted it. When a misimported or wrong NPI needed correction, the team had to do it via psql. Now editable for **PLATFORM_ADMIN only**, with a dedicated `hcp.npi_changed` audit row that captures both old and new value. Unique-constraint collisions surface as a clean 409 instead of a 503.

3. **Email "use nomail placeholder" affordance was easy to miss.** The placeholder address was already a clickable link inside the help text, but it was styled as inline underlined text and users were copy/pasting it out of habit. Converted to a visible chip-style button ("Use nomail@kol360research.com") so the click affordance reads.

4. **Nomination rematch — re-point a wrongly-matched nomination from the UI.** When a user incorrectly matched a nomination to an HCP, the team had to run psql to fix it. PLATFORM_ADMIN can now click "Change match" on any MATCHED row → pick a different HCP from the same suggestion UI → save. Audit row `nomination.rematched` captures the old HCP + new HCP + reason. The frontend reuses the existing match dialog with a `mode='rematch'` prop so the suggestion / picker UX is identical.

## What changes for customers (the visible bit)

| Surface | Before (4.1.16) | After (4.1.17) |
|---|---|---|
| HCP admin → search box → "Paul Karpecki" | **0 rows** ❌ | Returns Paul Karpecki ✓ |
| HCP admin → search box → "Karpecki Paul" (reversed) | 0 rows | Returns Paul Karpecki ✓ |
| HCP admin → search by single token, NPI, beId, alias, email | unchanged | unchanged |
| HCP edit dialog (PLATFORM_ADMIN) → NPI field | Disabled, value cannot be changed | Editable with a clear note: *"Changing the NPI is logged to the audit trail. The new value must be unique across all HCPs."* |
| HCP edit dialog (CLIENT_ADMIN / TEAM_MEMBER) → NPI field | (unchanged — they can't write anyway via gateWritesToAdmins) | Disabled (matches their write gate) |
| HCP edit (PLATFORM_ADMIN) → submit NPI already taken by another HCP | 503/generic error | Clean 409 with a user-readable message: *"Another HCP already exists with NPI 1234567890"* |
| HCP edit (PLATFORM_ADMIN) → audit log on NPI change | Generic `hcp.updated` row, only firstName/lastName in oldValues | New `hcp.npi_changed` row with both old and new NPI captured in `oldValues` / `newValues` |
| HCP create dialog → email "no email yet?" affordance | Inline underlined link in help text (easy to miss) | Chip-style button: **"Use nomail@kol360research.com"** |
| Campaign → Nominations tab → MATCHED row (PLATFORM_ADMIN) | View only; psql required to re-point | **"Change match"** chip button next to the matched HCP name. Click → suggestion dialog → pick different HCP → save → `nomination.rematched` audit row. |
| Same view as CLIENT_ADMIN / TEAM_MEMBER | View only | View only (chip hidden — gated on `user.role === 'PLATFORM_ADMIN'`) |

## Per-PR detail

Single PR per the combined-PR workflow (v1.17.34 code + e2e + release docs in one merge).

### Backend

[`apps/api/src/services/hcp.service.ts:42`](../apps/api/src/services/hcp.service.ts#L42) — `HcpService.search`:

Existing OR-clauses kept verbatim (`npi`, `beId`, `firstName`, `lastName`, `email`, `aliases`). When the query splits into 2+ whitespace-separated tokens, two new AND-pair clauses are pushed:

```ts
const tokens = query.trim().split(/\s+/).filter(Boolean);
if (tokens.length >= 2) {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  orClauses.push({ AND: [
    { firstName: { contains: first, mode: 'insensitive' } },
    { lastName:  { contains: last,  mode: 'insensitive' } },
  ]});
  orClauses.push({ AND: [
    { firstName: { contains: last,  mode: 'insensitive' } },
    { lastName:  { contains: first, mode: 'insensitive' } },
  ]});
}
```

Single-token queries keep the original behavior exactly.

[`packages/shared/src/schemas/hcp.ts:70`](../packages/shared/src/schemas/hcp.ts#L70) — `updateHcpSchema`:

`updateHcpSchema = createHcpSchema.partial().omit({ npi: true })` → `updateHcpSchema = createHcpSchema.partial()`. NPI now passes through to the route, where the `gateWritesToAdmins` preHandler (PLATFORM_ADMIN-only since v1.17.20) enforces the write authorization.

[`apps/api/src/routes/hcps.ts:125-185`](../apps/api/src/routes/hcps.ts#L125-L185) — PUT `/:id`:

- Tracks `isNpiChange = data.npi !== undefined && data.npi !== existing.npi` upfront so the audit log captures the canonical-identifier change clearly.
- Wraps `hcpService.update` in a try/catch. Prisma `P2002` unique-violation on `Hcp.npi` is caught and returned as **409 Conflict** with a readable message. Other errors re-throw to the generic handler.
- Audit log: `action: isNpiChange ? 'hcp.npi_changed' : 'hcp.updated'`. `oldValues` always includes firstName/lastName; on NPI change it also includes the old NPI.

### Frontend

[`apps/web/src/components/hcps/hcp-form-dialog.tsx`](../apps/web/src/components/hcps/hcp-form-dialog.tsx):

- Added `useAuth` import; computed `canEditNpi = user?.role === 'PLATFORM_ADMIN'`.
- NPI input `disabled={isEdit && !canEditNpi}` (pre-fix: `disabled={isEdit}`).
- Edit-mode help text below NPI input when canEditNpi: *"Changing the NPI is logged to the audit trail. The new value must be unique across all HCPs."*
- Submit path: PLATFORM_ADMIN keeps `npi` in the update payload unless the value is unchanged from the original; everyone else still strips it.
- Email "Use placeholder" affordance: converted from inline underlined link in the help paragraph to a chip-style button with title hover for screen readers.

### Nomination rematch — backend

[`packages/shared/src/schemas/nomination.ts`](../packages/shared/src/schemas/nomination.ts) — new `rematchNominationSchema`:
```ts
{ newHcpId: cuid, addAlias: boolean (default false), reason?: string }
```

[`apps/api/src/services/nomination.service.ts`](../apps/api/src/services/nomination.service.ts) — new `rematchToHcp(nominationId, newHcpId, addAlias, rematchedBy, reason?)`:
- Verifies the nomination exists + has a current match.
- 404 if nomination or new HCP doesn't exist; 409 if nomination is UNMATCHED, or if newHcpId == current matchedHcpId.
- Sets `matchStatus=MATCHED, matchType='exact', matchConfidence=100, matchedBy, matchedAt=now()` on the row.
- Sets `isNominated=true` on the new HCP.
- Emits `auditNomination(actor, 'nomination.rematched', nominationId, oldValues, newValues)` — oldValues includes the previous `matchedHcpId`, newValues includes both the new id and the optional reason.

[`apps/api/src/routes/nominations.ts`](../apps/api/src/routes/nominations.ts) — new POST `/:id/nominations/:nid/rematch`:
- PLATFORM_ADMIN gate (mirrors the existing `/match` route).
- Verifies tenant access to the campaign.
- Surfaces 404 / 409 / 400 with clean error bodies.

### Nomination rematch — frontend

[`apps/web/src/hooks/use-nominations.ts`](../apps/web/src/hooks/use-nominations.ts) — new `useRematchNomination()` mutation.

[`apps/web/src/app/admin/campaigns/[id]/nominations/page.tsx`](../apps/web/src/app/admin/campaigns/[id]/nominations/page.tsx):
- Imports `useAuth`; `canRematch = user?.role === 'PLATFORM_ADMIN'`.
- Adds a "Change match" chip button next to each MATCHED row's matched-HCP name, visible only when `canRematch`.
- New state slot `rematchNominationId`; click → mounts MatchNominationDialog with `mode='rematch'`.
- MatchNominationDialog: new optional `mode?: 'match' | 'rematch'` prop. When `mode='rematch'`:
  - Title is "Change Match" + a sub-line reminding the user of the current match.
  - Submit button is "Save New Match" (vs "Match" / "Confirm Match" in other modes).
  - Disabled when the user picks the same HCP as the current match.
  - Exclude + Create-New-HCP buttons hidden (those are first-match actions, not rematch).
  - Submit calls `useRematchNomination` → POST `/rematch` (not `/match`).

### E2E

[`e2e/api/campaigns-workflow.test.ts`](../e2e/api/campaigns-workflow.test.ts) — extended existing `HCP Search E2E` block with two new describe groups:

- `Full-name search (v1.17.34 fix)` — 4 cases (first-last, last-first reversed, single-token first, single-token last).
- `NPI editable for PLATFORM_ADMIN (v1.17.34)` — 3 cases:
  - PLATFORM_ADMIN can update NPI to a fresh unique value; persistence verified via getHcp.
  - Updating to a NPI already taken by another HCP returns 409.
  - Updating to the SAME NPI is a no-op (no audit noise).

**Confirmed catching pre-fix.** Run against api-test v1.17.33 (full-name fix only): full-name 2/4 fail (the multi-token cases — bug reproduced); NPI-editable cases all fail (schema rejected the update). Post-deploy: all 7 should pass.

[`e2e/api/nomination-matching.test.ts`](../e2e/api/nomination-matching.test.ts) — new `Rematch (v1.17.34)` describe block with 4 cases:

- Re-point a MATCHED nomination to a different HCP, assert `matchStatus=MATCHED` + new `matchedHcpId`; restores in `finally` so subsequent runs are deterministic.
- Same HCP → 409 (no-op guard).
- Non-existent HCP id → 404.
- Rematch on UNMATCHED nomination → 409 (caller should use `/match`).

## Migrations

**None.** All code-only.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **226/226** |
| Shared unit tests | **165/165** |
| Bug 1 confirmed on deployed pre-fix | `?query=Paul%20Karpecki` returns 0 items on api-test ✓ — bug reproduced |
| New full-name e2e suite (pre-fix) | 2 of 4 fail (multi-token cases) — bug caught |
| NPI-editable e2e suite (pre-fix) | Will fail (schema rejects npi on update) until v1.17.34 deploys |
| Email chip UI | Operator-verifiable in the browser after deploy |
| Test env deploy + post-deploy verification | To be reported in soak-checks after deploy lands |

## Risk

**Low.**

- **Full-name search**: purely additive OR-clauses. A query that found N rows pre-fix finds ≥N post-fix; no removal of matches.
- **NPI editable**: gated three ways:
  - Frontend: input disabled unless `user.role === 'PLATFORM_ADMIN'`.
  - Backend: `gateWritesToAdmins` preHandler already rejects writes from non-admins (existing v1.17.20 enforcement).
  - DB: `Hcp.npi @unique` enforces uniqueness; we surface that as 409 instead of 503.
  - Audit log captures every change; nothing happens silently.
- **Email chip**: pure CSS/markup change. Identical onClick handler.

No DB / migration / schema columns added.

## Rollback

Redeploy `prod-rel-4.1.16` (v1.17.33). Effects:
- Full-name search regresses to 0 rows for multi-token queries.
- NPI becomes non-editable again (back to psql workaround for corrections).
- Email affordance reverts to the inline underlined link.

Any NPIs that were edited via the UI during the 4.1.17 window stay in their new values (no data state to unwind).

## See also

- Soak checks: [`prod-rel-4.1.17-soak-checks.md`](prod-rel-4.1.17-soak-checks.md)
- Predecessor: [`prod-rel-4.1.16-handoff.md`](prod-rel-4.1.16-handoff.md)
- Related earlier fix (same full-name bug class on a different surface): v1.17.7 Insights full-name search, in `prod-rel-4.1.7-handoff.md`.
