# prod-rel-4.1.44 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.44` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.43` (v1.17.63).
**Bundles:** v1.17.64 — one-paragraph Intro tab follow-up to 4.1.43.

## TL;DR

The Insights Introduction tab now ends with a sentence pointing to the new Use Cases guide. Closes the discovery loop for users who land on Introduction by default — they get told about the guide without having to spot the "Use Cases" button in the header on their own.

## What changes for customers

| Surface | Before (4.1.43) | After (4.1.44) |
|---|---|---|
| Insights → Introduction tab → Methodology card | Ends after the "data-driven view of the KOL landscape" sentence. | Adds one more paragraph linking to `/admin/dashboards/guide` (the Use Cases guide shipped in 4.1.43), with a hint that the same content is also reachable via the **Use Cases** button in the dashboard header. |

Pure FE-only addition. Existing Methodology copy unchanged. Link is a standard Next.js `<Link>` — opens the bookmarkable guide page in the same tab.

## API changes

**None.**

## Migrations

**None.**

## Risk

**Trivial.** One paragraph. One link. Zero behavioral side-effects.

Rollback: redeploy 4.1.43 (v1.17.63). Intro tab reverts to the prior ending.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.64 |
| Link target | `/admin/dashboards/guide` route exists (shipped in 4.1.43) |

## Manual soak

1. Open the Insights dashboard for any disease area.
2. Land on the Introduction tab (it's the default).
3. Scroll to the bottom of the Methodology card.
4. **Expected**: a paragraph that ends with a "📖 Insights — Use Cases" link. Click it → standalone guide page loads.

## See also

- Soak checks: [`prod-rel-4.1.44-soak-checks.md`](prod-rel-4.1.44-soak-checks.md)
- Predecessor: [`prod-rel-4.1.43-handoff.md`](prod-rel-4.1.43-handoff.md)
