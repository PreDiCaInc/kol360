# ACK: Canada cross-licensing — Path B ADR

**From:** curation-svc team (Predica)
**Ref:** [`canada-cross-licensing-path-b-decision-2026-07-04.md`](canada-cross-licensing-path-b-decision-2026-07-04.md)
**Date:** 2026-07-04
**Status:** ✅ Acknowledged and accepted

---

## 1. On the decision

Agreed on Path B. The cost/volume math is right — zero cross-licensed HCPs in the corpus today, Path A needs 3+ FE surfaces + query work, and Path B is reversible via a one-shot regex parse of `discoveredFrom.notes` when we get there.

Especially appreciate:

- **Concrete flip triggers** (§ When to revisit): "5 in a session or 20 total" is measurable, not folkloric. We'll instrument on our side (see §3 below).
- **Reversibility captured explicitly.** The "Path B → Path A is one-shot" framing means neither team is locked in by today's choice.
- **What we're accepting is spelled out** — reduced alternate-country search recall today, manual backfill later. No hidden costs.

---

## 2. Action item we're accepting

Per ADR § When to revisit: *"Curation-svc has agreed to ping kol360 when they observe the first cross-licensed HCP in the wild so we can capture the alternate identifier via `discoveredFrom.notes` and start building a real-world sample of the transition volume."*

Committed. Specifically:

- When a reviewer flags a cross-licensed HCP (during NEW_HCP triage), the curation-svc UI will surface a "cross-licensed?" prompt.
- If yes, the reviewer captures both identifiers verbatim in `discoveredFrom.notes` using a canonical format (see §4 below for the format ask).
- Curation-svc pings kol360 on the first observation via the shared Slack channel — one message, "first cross-licensed HCP hit, note format is X, current running total: N."
- Ongoing: we'll tally cross-licensed observations per review session + per week. If either trigger threshold from § When to revisit fires (≥5 in a session or ≥20 total), we notify kol360 to reopen the Path A discussion.

Adding this to the curation-svc backlog alongside the main Canada integration ticket so it lands in the same sprint.

---

## 3. Instrumentation on our side

To make the "≥5 in session / ≥20 total" thresholds enforceable, we'll add:

- A `cross_licensed_observed_at` audit event whenever a reviewer flags one.
- A weekly summary line in the review-metrics dashboard: *"Cross-licensed HCPs observed this week: N (total to date: M)."*
- An automated Slack notification when the running total crosses 20 OR any single review session logs 5.

No kol360-side code needed — this is all on the curation-svc reviewer surface.

---

## 4. One small format ask

The ADR says: *"reviewer captures both identifiers verbatim in the notes."*

To make the future flip-day regex clean (§ What we're accepting: *"~1 hr of scripting per current volume estimates"*), it'd help if we agreed a canonical prefix now — even something minimal. Two options:

**Option A — inline prose (freeform, human-first):**
```
notes: "François Tremblay — cross-licensed. Primary practice: Toronto (MINC CAMD87654321). Also holds US NPI 1234567890 from residency in Boston 2018-2022."
```

**Option B — structured prefix (regex-friendly):**
```
notes: "alt_id_type: NPI\nalt_id: 1234567890\n\nFrançois Tremblay — cross-licensed. Primary practice: Toronto. US NPI from Boston residency 2018-2022."
```

**Our preference:** **Option B.** Adds a whopping ~40 characters per record; makes the future backfill regex `alt_id_type:\s*(NPI|MINC)\s*\nalt_id:\s*(\S+)` a one-liner instead of NLP; keeps the human prose for context. Curation-svc reviewer UI can prepend the block automatically so it's zero reviewer overhead.

Green-light on Option B and we'll wire it into the reviewer-notes template. Or flag a different format you'd prefer.

---

## 5. Nothing else outstanding

- Canada integration spec v2 → signed off ([review](curation-svc-canada-integration-spec-v2-review.md))
- Path B ADR → accepted (this doc)
- kol360 side → v1.17.71 shipped
- curation-svc side → 3-4 day implementation ticket in the next sprint

Only open item is the note format in §4 above — one-line reply is enough.

Thanks for the fast ADR + the clean thresholds. Ready to build.

---

*Contact: Predica curation-svc team via the shared Slack channel.*
