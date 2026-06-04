# Release docs

Per-release handoff + soak-check documents for the prod team. Cut at every `prod-rel-X.Y.Z` tag.

## Convention

Each release has two files:

| File | For | When |
|---|---|---|
| `prod-rel-X.Y.Z-handoff.md` | Prod-team summary: what changed, migrations, rollback shape | Cut at tag time |
| `prod-rel-X.Y.Z-soak-checks.md` | Phased checklist (sanity / functional smoke / 24h watch) | Same PR as the handoff |

Tag `prod-rel-X.Y.Z` is anchored at the merge commit on `main` for the corresponding `vX.Y.Z` version.

Older releases (prod-rel-3.2 through prod-rel-4.1.1) lived in `docs/releases/` before this folder existed; they were migrated here on 2026-05-28.

## Releases (newest first)

| Tag | Version | Headline |
|---|---|---|
| [4.1.12](prod-rel-4.1.12-handoff.md) | v1.17.24 → v1.17.28 | Second wave of 2026-06-02 customer fixes: Demographics Practice Setting multi-select + three missing graphs (educational, social media, valuable content, objectivity) + Sociometric/Total-Weighted column reorder + Educational Resources chart layout + sort-comparator sign fix |
| [4.1.11](prod-rel-4.1.11-handoff.md) | v1.17.17 → v1.17.23 | emailDomains required + auto-approve invitees + TEAM_MEMBER read perms + ZodError→400 + escape hatch removed + lint CI fix + client roles view-only + nomail backfill + Hcp.email required + insights layout density + write-button hide sweep |
| [4.1.10](prod-rel-4.1.10-handoff.md) | v1.17.12 + v1.17.13 + v1.17.14 + v1.17.15 + v1.17.16 | Consolidated 2026-06-02 customer bug bundle: respondent-counting dedup + per-campaign email filter + byCoreFocus MULTI_CHOICE fix (Demographics + KOL Profile) + filter dropdown population + Biased Leaders nomination type + tab rename + 0-result UI + 3 skeleton dimensions + v1.17.16 follow-ups (NUM-extract crash on `".."`, Demographics filter bar mount fix) |
| [4.1.9](prod-rel-4.1.9-handoff.md) | v1.17.10 + v1.17.11 | Insights dashboard perf pass A + B (SQL aggregations, narrower fetches, composite index, threshold cache) |
| [4.1.8](prod-rel-4.1.8-handoff.md) | v1.17.8 + v1.17.9 | Per-client email-domain allowlist + campaign-create excludeInternalEmails fix + deferred E2E deep assertions |
| [4.1.7](prod-rel-4.1.7-handoff.md) | v1.17.7 | Insights full-name search fix + tunable InfluencerThreshold table |
| [4.1.6](prod-rel-4.1.6-handoff.md) | v1.17.6 | Rename-nomination dialog: inline exact-match callout |
| [4.1.5](prod-rel-4.1.5-handoff.md) | v1.17.4 + v1.17.5 | Bundled (state whitelist + respondent filters) |
| [4.1.4](prod-rel-4.1.4-handoff.md) | v1.17.3 | Clear-filters consistency across 5 Insights surfaces + nav grouping |
| [4.1.3](prod-rel-4.1.3-handoff.md) | v1.17.2 | P1 hotfix — admin users blocked + 2 queued UX items |
| [4.1.2](prod-rel-4.1.2-handoff.md) | v1.17.1 | Patch from 4.1.1 soak |
| [4.1.1](prod-rel-4.1.1-handoff.md) | v1.16.x | Phase 3 PR B/C/D — completes the Phase 3 arc |
| [4.0](prod-rel-4.0-handoff.md) | v1.16.0 | Phase 3 PR A — campaign-scoring teardown |
| [3.3](prod-rel-3.3-handoff.md) | v1.15.31 | Two follow-ups on 3.2 |
| [3.2](prod-rel-3.2-handoff.md) | v1.15.x | KOL Analysis cutover |

Fossils (caught in review, not deployed — kept for audit trail): `prod-rel-3.1`, `prod-rel-4.1`. See those tags directly; no handoff doc was cut.

## Tag → commit lookup

```bash
git tag -l 'prod-rel-*' | sort -V    # all release tags, version-sorted
git show prod-rel-4.1.7 --no-patch   # commit + tag message for one
```
