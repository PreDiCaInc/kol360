# ADR: Canada cross-licensed HCPs — Path B (capture-in-notes) over Path A (enable alternateIds)

**Date:** 2026-07-04
**Status:** Accepted
**Owners:** kol360 team
**Related:** [`curation-svc-canada-integration-spec-v2.md`](curation-svc-canada-integration-spec-v2.md) §7 Q1; [`curation-svc-canada-integration-spec-v1-review.md`](curation-svc-canada-integration-spec-v1-review.md) §2.3
**Requested by:** curation-svc team (v2 review, non-blocking soft ask)

## Decision

**Path B.** When an HCP is cross-licensed in both US and CA, curation-svc mints them under their **primary practice country** and captures the alternate identifier in `discoveredFrom.notes` (freeform, already accepted). We defer wiring `Hcp.alternateIds` (schema-present since v1.17.68 Phase 1, currently unused on all read surfaces) until either (a) we hit enough cases to justify the FE + query work, or (b) a customer explicitly asks.

## Context

Curation-svc review flagged: an ophthalmologist trained in the US but now practicing in Toronto is exactly the KOL persona our corpus surfaces. Silence on the plan risked a schema-migration-under-pressure the first time we hit one.

Two options considered:

- **Path A** — Enable `Hcp.alternateIds` read paths before the CA rollout broadens (dedup UI, cross-country search, Insights display).
- **Path B** — Mint under primary country, park the alternate identifier as freeform prose in `discoveredFrom.notes`.

## Rationale

- **Cost:** Path A needs FE work on 3+ surfaces (dedup dialog, HCP profile, search results) plus a query pass to make `alternateIds` participate in name/id lookup. Path B is zero code today.
- **Data preservation:** Both paths capture the alternate identifier durably. Path A does it as structured field; Path B does it as reviewer prose alongside the mint context (auditable through the `discoveredFrom` audit-log rows curation-svc already writes).
- **Reversibility:** Path B → Path A is a one-shot migration: parse `discoveredFrom.notes` for MINC/NPI patterns, populate `alternateIds`, wire up the read surfaces. No lock-in.
- **Volume today:** Zero cross-licensed HCPs in prod. Kolcuration v0.3 is local-only, sub-hundred-row corpus. Optimizing for a case we haven't hit is premature.

## When to revisit

Flip to Path A when any of these fire:

1. Curation reviewers report ≥5 cross-licensed HCPs in a single review session, or ≥20 total.
2. A customer asks for a cross-country search / dedup surface.
3. `Hcp.alternateIds` reaches a natural bundling opportunity (e.g., a broader HCP-identity refactor).

Curation-svc has agreed to ping kol360 when they observe the first cross-licensed HCP in the wild so we can capture the alternate identifier via `discoveredFrom.notes` and start building a real-world sample of the transition volume.

## What we're accepting

- **Reduced search recall on the alternate country side.** A CA-primary HCP with a US NPI won't be found by NPI lookup on the US path today. Freeform notes aren't queryable structurally. Mitigation: curation-svc reviewer captures both identifiers verbatim in the notes, so any manual lookup can grep.
- **Manual work at flip-time.** When we do enable Path A, we'll need to backfill `alternateIds` from `discoveredFrom.notes`. Regex-driven, ~1 hr of scripting per current volume estimates.

## What we're NOT changing

- `Hcp.alternateIds` schema field stays. It was added in Phase 1 with exactly this deferred rollout in mind.
- `discoveredFrom.notes` remains freeform. No structured-field promotion until Path A flips.
