# Review: Canada HCP Support — Curation-svc Integration Spec v1

**Reviewer:** curation-svc team (Predica)
**Reviewing:** `curation-svc-canada-integration-spec-v1.md`
**Date:** 2026-07-04
**Overall verdict:** Ready to implement against, with four items to close before we build. See §5 for the sign-off conditions.

---

## 1. What's ship-ready as-is

- **Zero-coordination rollout** (spec §2, §5). kol360 already accepts both old + new shapes as of `prod-rel-4.1.49`. We can flip the client-side whenever we're ready — nothing races, no cut-over window.
- **MINC normalization strategy** (§2, §3.2). Accepting hyphenated/lowercase input and canonicalizing to `CAMD########` server-side is right — reviewers WILL paste `CA-MD-1234-567-8` and `camd12345678`. Doing this on kol360's side beats us having to normalize identically before every call.
- **Dedup by `Hcp.npi` UNIQUE** (§2). The `CAMD` letter prefix guarantees a MINC and an NPI with the same digit sequence can't collide as strings. Clean.
- **Error responses** (§4). 400 messages carry the useful bit (field name + expected format). Actionable for reviewers.
- **Verification suite** (§6). Round-trip + US regression + Insights isolation is the right shape for smoke-testing our rollout.

---

## 2. Would tighten before we build

### 2.1 The country/nationalIdType pairing is a spec/behavior gap

§3.2 says the two fields "MUST be paired." §7 Q3 admits the schema currently accepts them unpaired ("technically valid but semantically wrong").

A landmine both sides know about but neither enforces is a bug waiting to hit prod when a client mints a bad row.

**Ask:** please add the `superRefine` on your side. If not, we'll enforce it client-side and fail closed on unpaired combinations — but the server-side check is the right home for the invariant.

### 2.2 §5.3 "optional but recommended for clarity" — please move to "always send"

If a curation-svc client sends `country=CA` with `nationalIdType` omitted, they'll get the NPI default and then get bounced by the MINC/NPI validation regex mismatch. The failure mode isn't the client's problem to prevent — the spec should just require both fields once the endpoint version supports them.

**Ask:** update §5.3 to say curation-svc will always send `country` + `nationalIdType`. We're not planning to ever omit them.

### 2.3 §7 Q1 cross-licensed HCPs — "pick one" is a real reviewer problem, not an edge case

An ophthalmologist trained in the US who now practices in Toronto is exactly the kind of person our KOL corpus flags. "Pick one" defers to reviewer judgment, which is fine as a v1, but we need to know the plan:

- Path A: **Enable `Hcp.alternateIds` before we ship the Canada toggle broadly** so the first cross-licensed HCP we hit doesn't force a schema change under pressure.
- Path B: **Explicitly document the reviewer workflow** — "mint under primary practice country, note the alternate identifier in `discoveredFrom.notes`, migrate via alternateIds later." Then we know what to tell reviewers on day 1.

Either works. Silence doesn't.

### 2.4 §5.4 backfill is under-specified

"Coordinate a one-time SQL update on the kol360 side" — the mechanic is clear, but the **identification** is not:

- How do we identify which existing NEW_HCPs sent by curation-svc are actually Canadian and should be flipped from `country='US'` (default) to `country='CA'`?
- Reviewer notes? Address inference from `city`/`state`? A curation-svc-generated candidate list?

For our platform the volume is small right now (v0.3, local-only, no historical prod HCPs). But the process should exist before we roll out the Canada toggle, not after we hit the wrong-country dashboards.

**Ask:** add a §5.4a "identification method" — even one sentence like "curation-svc supplies a beId list; kol360 runs a batched UPDATE" is enough.

---

## 3. Missing / worth confirming

### 3.1 Rate limits on `get-beid`

Not mentioned. If a reviewer bulk-approves 50 CA HCPs in one session, does the M2M client hit a throttle? What's the sustained + burst ceiling? Would prefer to know upfront so we can space calls if needed.

### 3.2 Response echo of persisted `country` + `nationalIdType`

Currently the response is `{beId, id, createdAt, wasExisting}`. To confirm what actually got stored, the client has to make a separate `GET /api/v1/hcps/:beId` call. Small cost, real audit-trail value — reviewers approving a MINC HCP could see "→ stored as `nationalIdType: MINC`" in the confirmation toast.

**Ask:** consider adding `country` + `nationalIdType` to the response payload. Backward-compatible (additive fields).

### 3.3 Correction path when a reviewer edits a MINC after minting

Say a reviewer accepts `CAMD12345678`, hits Save, then realizes it's actually `CAMD12345679`. What's the update flow?

- Is it a PUT to a new endpoint?
- Does it go through the merge-tombstone flow from the sync spec (§6 of `curation-kol360-sync-spec-v0.3.md`, 90-day tombstones)?
- Or does the reviewer have to mint a new beId and abandon the old one?

Probably covered by the merge path already — but the Canada spec doesn't cite it, so we'd like one line pointing at wherever the answer lives.

### 3.4 State/province validation for CA

§3.2 note: "accepts any 2-letter code." So `QC`, `ZZ`, `01` all get through the current schema.

We'll do this on our side (defensive validation before hitting your endpoint), but confirming the design intent: are you comfortable with kol360's `state` field being unstructured, or do you want to add a country-conditional enum server-side? We'll match whichever you settle on.

### 3.5 "Sun Pharma US dashboard" in §6.3

That reads as a specific client name, not a placeholder. Confirm it's placeholder text and swap to a neutral example (e.g., "a US-region client dashboard") — client names sprinkled through public spec docs make everybody nervous.

---

## 4. Our effort estimate (curation-svc side)

Given the migration plan in spec §5:

| Step | Effort |
|---|---|
| Country toggle + derived `nationalIdType` on NEW_HCP review UI | ~½–1 day |
| MINC regex + normalization on curation-svc (defensive) | ~2 hrs |
| Update `getBeid` client to always send `country` + `nationalIdType` | ~1 hr |
| Backfill coordination + execution | ~½ day (assuming clear identification method per §2.4) |
| E2E tests: US regression + CA happy path + no-NPI CA + pairing enforcement | ~½ day |
| **Total** | **~3-4 days** |

Small footprint. We can slot this into our next sprint once the four items in §5 below are closed.

---

## 5. Sign-off conditions

We're prepared to sign off contingent on:

1. **kol360 adds the `superRefine`** to enforce `country`/`nationalIdType` pairing at the schema level. (Or explicit agreement that we enforce client-side and fail closed — but server-side is where the invariant belongs.)
2. **§5.3 rewords** from "optional but recommended" to "curation-svc always sends both."
3. **One-liner in §7** pointing at the merge-tombstone flow (per `curation-kol360-sync-spec-v0.3.md §6`) for MINC corrections after minting.
4. **§6.3 example** confirmed as placeholder text and swapped to a neutral name.

Items in §2.3 (cross-licensing plan), §2.4 (backfill identification method), §3.1 (rate limits), §3.2 (response echo), and §3.4 (state validation) are stronger to close before general Canada rollout but shouldn't block the initial integration if we agree on the plan.

---

## 6. Next steps

- kol360 team: revise spec addressing the four sign-off items + as many of §3 as reasonable
- Predica curation-svc team: green-light for implementation once revised spec lands
- Both teams: agree on a smoke-test window against `koltest.bio-exec.com` before curation-svc flips prod

Thanks for the clean spec — the zero-coordination story is exactly right, and the examples covering US / CA / no-NPI make the contract easy to build against. Looking forward to the revision.

---

*Contact for questions on this review: Predica curation-svc team via the shared Slack channel.*
