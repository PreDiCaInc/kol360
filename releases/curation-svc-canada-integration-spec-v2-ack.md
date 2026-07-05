# Reply: Canada HCP Support — v2 spec acknowledgement + soft-ask closure

**To:** curation-svc team (Predica)
**From:** kol360 team
**Date:** 2026-07-04
**Re:** [`curation-svc-canada-integration-spec-v2.md`](curation-svc-canada-integration-spec-v2.md) — spec v2 acknowledgement + your two soft asks.

---

## Ack on the three v2-addition callouts

Those three were intentional — glad the intent came through cleanly:

1. **§4 ordering — pairing check runs first.** Deliberate. The pairing invariant is a category error (client sent the wrong shape), and shape validation on top would be misleading noise. Two-round-trip on double failure is the correct cost for keeping the error stream unambiguous. If it starts biting reviewer UX we can collapse to a combined error later — but ordering stays as-is by default.
2. **§5.2 step 5 — NPI-already-populated edge case routes through merge-tombstone.** Same policy as any other identifier correction: we don't in-place mutate an already-existing identifier field. Merge-tombstone (`curation-kol360-sync-spec-v0.3.md §6`) is the correction pipeline for all identifier updates, not just wrong values but also wrong types (NPI → MINC re-mint). This preserves the audit trail and the 90-day tombstone window that dedup depends on.
3. **§3.4 response echo = stored, not requested.** Yes — the dedup path returning the stored row's country/type is the signal you can actually reconcile against. Echoing the request payload would be tautological ("we saw what you sent"); echoing what's actually stored answers the real question ("did what I sent match what's on file?"). Log it into the reviewer confirmation as suggested; if a mismatch surfaces, you have a hard data point without a follow-up GET.

## Two soft asks — closure

### Soft ask #1 — symmetric e2e test on the curation-svc side once you build

Sounds right. We're happy to review your test plan / matrix once it's ready; symmetric coverage from both sides is how we'll know the contract holds under real integration. Our side already has: US backward compat, CA happy path, unpaired US+MINC rejection, unpaired CA+NPI rejection, response echo assertion, and structural Insights isolation (`e2e/api/canada-hcp-isolation.test.ts`). Anything you cover that overlaps is a good redundancy; anything new you cover, please loop us in on.

### Soft ask #2 — one-line ADR capturing "Path B > Path A" cross-licensing decision

Done. Written up as [`canada-cross-licensing-path-b-decision-2026-07-04.md`](canada-cross-licensing-path-b-decision-2026-07-04.md) and linked from spec v2 §7 Q1.

Covers:
- **The decision** — Path B: mint under primary, alt in `discoveredFrom.notes`.
- **Rationale** — cost delta, data preservation equivalence, reversibility, current volume.
- **When to revisit** — three explicit triggers (volume ≥5/session, customer ask, natural bundling opportunity).
- **What we're accepting** — reduced search recall on the alternate country side; manual backfill at Path A flip-time.
- **What we're NOT changing** — schema field stays; `discoveredFrom.notes` stays freeform.

If the ADR's revisit criteria don't match how you'd expect the decision to flip, ping us — those are the concrete triggers that will kick off the Path A scoping conversation.

## What we captured from your commitment side

Noting these for our own tracking so we're not surprised when they land:

- **~3-4 days** of curation-svc work locked in for the client-side integration.
- **`STATE_US` / `STATE_CA` client-side validation** added to your scope per §7 Q4 recommendation. Thanks — that closes the state-field concern without a schema migration on our side.
- **Two extra verification items on your side**: no-NPI CA (matches our §3.3) + dedup mismatch UX (uses the response echo from §3.4).

## Next step

Ball's in your court for implementation. koltest.bio-exec.com is on v1.17.71 as of today; smoke test whenever your side is ready and we can coordinate a joint verification window before you flip prod. Shared Slack channel is the coord path.

Thanks for the tight review — the sign-off structure made the revision cycle clean.
