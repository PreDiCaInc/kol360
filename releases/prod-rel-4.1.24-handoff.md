# prod-rel-4.1.24 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.24` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.23` (v1.17.43).
**Bundles:** v1.17.44 — two new influencer-type buckets + dialog UX surfacing the allowed list.

## TL;DR

The data team's next classification cycle includes two buckets that weren't in the canonical list yet. Adding them + making the dialog show the accepted list inline so the data team can verify their labels before uploading.

## What changes

| Surface | Before (4.1.23) | After (4.1.24) |
|---|---|---|
| `INFLUENCER_TYPES` const (`@kol360/shared`) | 3 values: National Leaders, Rising Stars, Regional Influencers | **5 values:** + Regional Leaders, + Pre-Emergent |
| Backend CSV validator | Accepted 3 canonical + 4 singular/case alternates | Now also accepts: `Regional Leader` (singular) · `Pre Emergent` (space) · `Preemergent` (no separator) · `Pre-emergent` (lowercase 'e') |
| Import dialog header | Single text description | Description + a **visible row of badges** showing every allowed type, generated from the shared const. Adding a future type only requires editing `INFLUENCER_TYPES` — the badges auto-update. |
| Download Template button | Sample rows hardcoded with 3 types | Sample rows derived from the shared const — auto-includes new types |
| `countsByType` initialization on the backend | Hardcoded 3-key object | Derived from the shared const — every type starts at 0 |

## Naming overlap to flag

`NominationType.REGIONAL_LEADER` already exists as one of the 8 nomination question types (people nominate an HCP as a "regional leader"). The new `'Regional Leaders'` influencer-type bucket is a SEPARATE concept (data-team classification) that happens to share the name. Two distinct things in the data model; consider whether the UI labels need disambiguation if customer feedback comes back confused.

## Migrations

**None.** Code-only — `HcpDiseaseArea.influencerType` is already TEXT (no enum constraint), so the new values store fine without schema change.

## Risk

**Very low.** Const update + dialog UX. The data team's existing CSVs with the 3 original types continue to work unchanged.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **230/230** |

## Rollback

Redeploy `prod-rel-4.1.23` (v1.17.43). Effects:
- Backend rejects `Regional Leaders` / `Pre-Emergent` as `invalidType` per-row error (rest of CSV processes fine — batch contract preserved).
- Dialog badges revert to text description.
- Any rows already persisted with the new types stay in the DB; reads keep returning them (frontend filter just won't have them as known options until the frontend list updates).

## See also

- Soak checks: [`prod-rel-4.1.24-soak-checks.md`](prod-rel-4.1.24-soak-checks.md)
- Predecessor: [`prod-rel-4.1.23-handoff.md`](prod-rel-4.1.23-handoff.md)
