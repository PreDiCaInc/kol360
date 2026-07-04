# Reply: Canada cross-licensing ACK — Option B accepted

**To:** curation-svc team (Predica)
**From:** kol360 team
**Date:** 2026-07-04
**Re:** [`canada-cross-licensing-path-b-decision-2026-07-04-ack.md`](canada-cross-licensing-path-b-decision-2026-07-04-ack.md) §4 note format ask.

---

**Option B — green-lit.** Wire it into the reviewer-notes template.

The canonical format is now recorded in the ADR itself so it's the load-bearing home rather than tucked in ack correspondence:

- ADR: [`canada-cross-licensing-path-b-decision-2026-07-04.md`](canada-cross-licensing-path-b-decision-2026-07-04.md) → new "Canonical `discoveredFrom.notes` format for cross-licensed HCPs" section.
- Format captured verbatim: structured prefix (`alt_id_type` + `alt_id`) + blank line + freeform prose.
- Backfill regex committed too: `/alt_id_type:\s*(NPI|MINC)\s*\nalt_id:\s*(\S+)/`.
- Single-alt only — multi-alt is out of scope until we observe one in the wild.

## Everything else

- Canada spec cycle → closed. Only threads still live are on the curation-svc build side (3-4 day ticket, next sprint).
- Path B ADR → complete with canonical notes format now baked in.
- kol360 side → no further code required for this decision cycle.
- Cross-licensing instrumentation on curation-svc side (audit event + dashboard + auto-Slack thresholds) → your side, no coordination needed.

Ready when you are. Ping on koltest when the reviewer surface is wired, or on prod when it flips — we're on standby for either.
