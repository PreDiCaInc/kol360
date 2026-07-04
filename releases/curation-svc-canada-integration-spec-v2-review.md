# Review: Canada HCP Support — Curation-svc Integration Spec v2

**Reviewer:** curation-svc team (Predica)
**Reviewing:** `curation-svc-canada-integration-spec-v2.md`
**Prior review:** `curation-svc-canada-integration-spec-v1-review.md`
**Date:** 2026-07-04
**Verdict:** ✅ **Signed off. Ready to implement.** All four blockers from v1 review closed. Non-blocking items addressed inline. Green light on our side pending our own sprint slot.

---

## 1. Sign-off conditions from v1 review — closure check

| # | Condition | v2 resolution | Verdict |
|---|---|---|---|
| 1 | Server-side pairing enforcement (`superRefine`) | Added in v1.17.71. `US ↔ NPI` and `CA ↔ MINC` enforced at schema boundary. New 400 shape documented in §4 with the explicit message. Unit + e2e tests locked in. | ✅ Closed |
| 2 | §5.3 "always send" — replace "optional but recommended" | Rewritten as a "Field expectation" subsection with belt-and-braces reasoning about silent wrong-country classification. Explicit statement that "sometimes send" is out of contract for v1.17.71-aware code. | ✅ Closed |
| 3 | Merge-tombstone pointer for MINC corrections | New §7 Q5 pointing at `curation-kol360-sync-spec-v0.3.md §6`. Explicitly covers wrong MINC value, wrong-type, and wrong-country-with-already-populated-NPI cases. Consistent with pre-v1.17.69 policy (no PUT-to-existing-beId). | ✅ Closed |
| 4 | "Sun Pharma" placeholder swap | Replaced with "a US-region client" throughout (§6.4). | ✅ Closed |

All four blockers cleared. No follow-ups requested.

---

## 2. Non-blocking asks from v1 review — resolution check

| v1 Ref | Ask | v2 Location | Verdict |
|---|---|---|---|
| §2.3 | Cross-licensing plan (Path A vs Path B) | §7 Q1: Path B chosen. Mint under primary country; capture alternate in `discoveredFrom.notes`. Path A (`Hcp.alternateIds`) deferred until first observed case or customer ask. | ✅ Sensible; matches our reviewer workflow |
| §2.4 | Backfill identification method | §5.2: curation-svc supplies beId CSV; kol360 batched UPDATE with guarded WHERE. Full 5-step process including step 5 (already-populated-NPI edge case → merge-tombstone). | ✅ Comprehensive |
| §3.1 | Rate limits | §7 Q6: Cognito ~50 req/s per M2M client (token cached), App Runner ~200 req/s sustained (test env). No hard cap on the endpoint. Escalation path documented. | ✅ Concrete numbers |
| §3.2 | Response echo of persisted `country` / `nationalIdType` | Added to §2, §3.1, §3.2, §3.4 response examples. §3.4 clarifies dedup echoes what's STORED (not request payload) — enables us to detect wrong-country reconciliation mismatches. | ✅ Even better than asked — the "stored not requested" semantic gives us a real audit signal |
| §3.4 | State/province validation | §7 Q4: kol360 keeps it freeform 2-letter (noisy source data). Recommends curation-svc validate against country-conditional list (`STATE_US` / `STATE_CA`). | ✅ Fair trade-off; we'll take it |

Every non-blocking item resolved. The response-echo semantics in §3.4 (echo = stored, not requested) is a nicer answer than we asked for — it lets us surface silent divergence in the dedup path directly to reviewers.

---

## 3. New in v2 worth calling out

Three v2 additions we especially appreciate:

1. **§4 ordering note.** "The schema checks pairing first; if pairing fails you'll get the pairing error, not the identifier-shape error." Small detail, big impact on our client-side retry logic. We'll code the two-round-trip flow (fix pairing → resubmit → possibly hit shape error next) exactly as described.

2. **§5.2 step 5** — the "NPI already populated, can't flip in place" case. We'd have hit this on backfill day and not known what to do; you called it out upfront and routed it correctly through merge-tombstone. Prevents a data-integrity landmine.

3. **§5.3 belt-and-braces reasoning.** The explicit walk-through of *why* omitting `country` silently defaults US and creates wrong-country Insights leakage is exactly the framing we needed to make the "always send" rule feel earned rather than dogmatic. This will land well in our internal code review.

---

## 4. Our implementation plan (unchanged from v1 review)

Locking in the ~3-4 day estimate from v1 review §4, with one line-item addition per v2 §8:

| Step | Effort | Owner |
|---|---|---|
| Country toggle + derived `nationalIdType` on NEW_HCP review UI | ~½–1 day | curation-svc FE |
| MINC regex + normalization (defensive; strip non-alphanumerics, uppercase, `/^CAMD\d{8}$/`) | ~2 hrs | curation-svc BE |
| Client-side pairing check (belt-and-braces before request) | ~½ hr | curation-svc BE |
| Update `getBeid` client to always send both fields + handle response echo (including dedup mismatch surface) | ~1 hr | curation-svc BE |
| Country-conditional state/province validation (`STATE_US` / `STATE_CA` client-side lists) | ~1 hr | curation-svc FE + BE |
| Backfill coordination + execution per §5.2 | ~½ day | curation-svc + kol360 joint |
| E2E tests: US regression, CA happy path, no-NPI CA, pairing enforcement (both directions), MINC normalization | ~½ day | curation-svc |
| **Total** | **~3–4 days** | |

---

## 5. Verification we'll run on our side

Matching the §6 verification list, with our own additions:

1. Round-trip a CA HCP through the reviewer UI → response echo matches → `GET` confirms canonical MINC.
2. Round-trip a US HCP → identical to pre-v1.17.69 behavior. No regression.
3. Both pairing-violation directions (US + MINC and CA + NPI) → 400 with correct message.
4. MINC normalization: send hyphenated + lowercase → confirm response echo says `MINC` + follow-up GET returns canonical `CAMD########`.
5. **[our addition]** No-NPI CA case → confirm `Hcp.country = 'CA'`, `Hcp.nationalIdType = 'MINC'`, `Hcp.npi = NULL`.
6. **[our addition]** Dedup mismatch surface: post a `country: 'CA'` for a beId that exists as US → confirm response echoes `US` → confirm our UI flags the divergence to the reviewer.
7. Insights isolation: covered by kol360's own e2e per §6.4. We'll trust and verify via a spot-check on a US-region dashboard.

---

## 6. Rollout plan

1. **Sprint scheduling** — Curation-svc slots the ~3-4 days into the next planning cycle. Will confirm the sprint window via Slack once scoped.
2. **koltest smoke** — Once implementation is complete, we run all six verification items against `koltest.bio-exec.com` (v1.17.71). No prod flip until koltest is green.
3. **Prod flip window** — Coordinate a low-traffic window via Slack. No blocking dependencies; feature-flag optional (the "always send" contract is compatible with the pre-v1.17.69 install base by design).
4. **Backfill day** — Separate calendar item once curation-svc identifies any historical wrong-country rows via the process in §5.2. Estimated: same day or the next low-traffic window.

---

## 7. Notes for KDteam sign-off

**Nothing blocking. Everything actionable is on our side.**

The two things that would be nice to have (not required to ship):
- Automated e2e in the shared repo that covers the curation-svc → kol360 handoff for a CA HCP end-to-end. kol360 has its side covered in `curation-get-beid.test.ts`; a symmetric test on curation-svc side would close the loop.
- A one-line ADR on the "Path B > Path A" decision for cross-licensing so future engineers understand why `alternateIds` sits unwired.

Neither blocks integration. Just future-work capture.

---

## 8. Thanks

The v1 → v2 turnaround was fast and every ask was closed thoroughly. The new response-echo semantics (echo = stored, not requested) and the §5.2 step-5 edge case call-out went beyond what we asked for. Ready to build.

Signal us in the shared Slack channel when you'd like the sprint slot confirmed.

---

*Contact: Predica curation-svc team via the shared Slack channel.*
