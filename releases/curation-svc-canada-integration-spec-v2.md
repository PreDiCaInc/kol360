# Canada HCP Support — Curation-svc Integration Spec v2

**Status:** Ready for curation-svc integration. **All four sign-off conditions from v1 review closed.**
**kol360 side:** shipped v1.17.71 (prod-rel-4.1.51). Backward compatible with pre-v1.17.69 callers; pairing enforcement added at the schema level per the review.
**Contact:** kol360 team; questions via the shared Slack channel.
**Supersedes:** [`curation-svc-canada-integration-spec-v1.md`](curation-svc-canada-integration-spec-v1.md).
**Review closed:** [`curation-svc-canada-integration-spec-v1-review.md`](curation-svc-canada-integration-spec-v1-review.md).
**Related tickets:**
- `docs/findings/canada-hcp-support-lite-plan-2026-06-25.md` (kol360 side)
- Prior curation spec: `kolcuration/spec/curation-kol360-sync-spec-v0.3.md §6` (merge-tombstone flow), `§6.2` (original get-beid contract)

---

## What changed vs v1 (delta from the review)

| Sign-off condition | Resolution |
|---|---|
| **#1** — server-side pairing enforcement | Added `.superRefine` on `getBeIdRequestSchema`. Unpaired `country`/`nationalIdType` combos now 400 at the request boundary. New 400 error shape documented in §4. Unit + e2e tests locked in. |
| **#2** — §5.3 "always send" | Rewritten. Curation-svc will send both fields on every call once integrated. Defaults remain for the pre-v1.17.69 install base. |
| **#3** — merge-tombstone pointer for MINC corrections | New §7 Q5 pointing at `curation-kol360-sync-spec-v0.3.md §6`. |
| **#4** — "Sun Pharma" placeholder swap | Was a placeholder; replaced with "a US-region client" throughout. |

Non-blocking asks also addressed inline: §2.3 cross-licensing (Path B chosen), §2.4 backfill identification (curation-svc supplies beId list), §3.1 rate limits, §3.2 response echo (added), §3.4 state validation.

---

## 1. Purpose

kol360 v1.17.69 extended `Hcp` to support Canadian identifiers (MINC alongside US NPI). The curation `POST /api/v1/hcps/get-beid` endpoint accepts `country` + `nationalIdType`. Post-review v1.17.71 hardens the contract: pairing enforced server-side, persisted values echoed in the response.

---

## 2. What changed on the kol360 side

**Endpoint URL:** unchanged — `POST /api/v1/hcps/get-beid`
**Auth:** unchanged — Cognito `client_credentials`, scope `kol360-api/hcps:write-stub`, client id `5ml2abmii9ot8eesu6birg5dmq`.

**Request field additions (both required-in-practice; defaults preserved for backward compat):**

| Field | Type | Default | Enforcement (v1.17.71) |
|---|---|---|---|
| `country` | enum `"US" \| "CA"` | `"US"` | Must pair with `nationalIdType`. |
| `nationalIdType` | enum `"NPI" \| "MINC"` | `"NPI"` | Must pair with `country`: `CA` ↔ `MINC`, `US` ↔ `NPI`. |

**Pairing rule (new in v1.17.71):** the schema rejects `country: 'US' + nationalIdType: 'MINC'` and `country: 'CA' + nationalIdType: 'NPI'` with a 400. See §4.

**Response additions (v1.17.71):** the response now echoes the persisted `country` + `nationalIdType`. Additive; existing curation clients that ignore them keep working.

**Identifier validation:**
- `nationalIdType: 'NPI'` → `npi` must match `/^\d{10}$/`
- `nationalIdType: 'MINC'` → `npi` must normalize to `/^CAMD\d{8}$/`

**MINC normalization:** kol360 strips non-alphanumerics + uppercases, so `"CA-MD-1234-567-8"` and `"camd12345678"` both land as `"CAMD12345678"`. Recommended: curation-svc sends canonical form directly.

**Dedup:** unchanged — by `Hcp.npi @unique`. The `CAMD` letter prefix guarantees a MINC + NPI with matching digits can't collide.

---

## 3. Contract

### 3.1 Request — US case

```http
POST /api/v1/hcps/get-beid HTTP/1.1
Host: kol360.bio-exec.com
Authorization: Bearer <M2M_TOKEN>
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "specialty": "Ophthalmology",
  "city": "Boston",
  "state": "MA",
  "npi": "1234567890",
  "country": "US",
  "nationalIdType": "NPI",
  "discoveredFrom": { "source_url": "https://directory.example.com/jane-smith", "scraper_run_id": "run-2026-07-01-a", "ai_verification_snapshot_url": "s3://kolcuration-snapshots/run-2026-07-01-a/jane-smith.json", "captured_at": "2026-07-01T10:00:00Z" }
}
```

Response (v1.17.71 shape):

```json
{
  "beId": "BE-000123",
  "id": "cmxxxxxxxx",
  "createdAt": "2026-07-01T10:00:01.123Z",
  "wasExisting": false,
  "country": "US",
  "nationalIdType": "NPI"
}
```

### 3.2 Request — Canada case

```http
POST /api/v1/hcps/get-beid HTTP/1.1
Host: kol360.bio-exec.com
Authorization: Bearer <M2M_TOKEN>
Content-Type: application/json

{
  "firstName": "François",
  "lastName": "Tremblay",
  "specialty": "Ophthalmology",
  "city": "Montreal",
  "state": "QC",
  "npi": "CAMD87654321",
  "country": "CA",
  "nationalIdType": "MINC",
  "discoveredFrom": { "source_url": "https://directory.example.ca/francois-tremblay", "scraper_run_id": "run-2026-07-01-b", "ai_verification_snapshot_url": "s3://kolcuration-snapshots/run-2026-07-01-b/francois-tremblay.json", "captured_at": "2026-07-01T10:05:00Z" }
}
```

Response:

```json
{
  "beId": "BE-000124",
  "id": "cmxxxxxxxx",
  "createdAt": "2026-07-01T10:05:01.456Z",
  "wasExisting": false,
  "country": "CA",
  "nationalIdType": "MINC"
}
```

**State field:** currently unstructured 2-letter string on kol360's side (US states and Canadian provinces both fit; `state` isn't enum-validated per country). See §7 Q4 for the design intent + your defensive validation plan.

### 3.3 Request — no-identifier case

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "country": "CA",
  "nationalIdType": "MINC",
  "discoveredFrom": {
    "source_url": "https://blog.example.ca/jane-doe",
    "scraper_run_id": "run-2026-07-01-c",
    "ai_verification_snapshot_url": "s3://kolcuration-snapshots/run-2026-07-01-c/jane-doe.json",
    "captured_at": "2026-07-01T10:10:00Z",
    "notes": "MINC not published on personal blog; reviewer accepted based on institutional bio."
  }
}
```

Even without `npi`, the pairing rule still applies — `country: 'CA'` requires `nationalIdType: 'MINC'`. kol360 mints with `Hcp.npi = NULL`, `Hcp.country = 'CA'`, `Hcp.nationalIdType = 'MINC'`.

### 3.4 Dedup response (unchanged flow, new echo)

Re-posting a known NPI or MINC returns the existing row's beId. Echoed `country`/`nationalIdType` reflect **what's stored**, not the request payload — useful when reconciling a client's local expectation against reality:

```json
{
  "beId": "BE-000124",
  "id": "cmxxxxxxxx",
  "createdAt": "2026-07-01T10:05:01.456Z",
  "wasExisting": true,
  "country": "CA",
  "nationalIdType": "MINC"
}
```

---

## 4. Error responses

**400 — pairing violation (new in v1.17.71)**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "nationalIdType: country and nationalIdType must be paired: 'CA' → 'MINC', 'US' → 'NPI'"
}
```

Fires when `country`/`nationalIdType` are unpaired. curation-svc should catch this and surface a reviewer-visible correction; it means the toggle + derived type got out of sync.

**400 — malformed identifier for declared type**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "npi: MINC must be 12 characters: CAMD followed by 8 digits (input may be hyphenated; will be normalized)"
}
```

**400 — malformed body**

Missing `firstName`/`lastName`/`discoveredFrom`, invalid `country` enum, etc. Standard Zod messaging.

**401 / 403** — auth. Unchanged.

**Note on ordering:** the schema checks pairing first; if pairing fails you'll get the pairing error, not the identifier-shape error. Fix pairing, resubmit, and the shape validation runs next.

---

## 5. Migration plan for curation-svc

**Zero-coordination.** kol360 accepts both pre-v1.17.69 (no country) and v1.17.71+ (with pairing) shapes. Curation-svc flips when ready.

### 5.1 Suggested sequence

1. Add country selection to the curation-svc reviewer UI. Reviewer picks US or Canada per NEW_HCP. Derive `nationalIdType` from country (`US → NPI`, `CA → MINC`). Never let them drift.
2. Add MINC regex + normalization on curation-svc side. Same rules: strip non-alphanumerics, uppercase, then check `/^CAMD\d{8}$/`. Bounce malformed values pre-flight instead of round-tripping the 400.
3. Add client-side pairing check as a belt-and-braces layer — fail closed if `country`/`nationalIdType` disagree before the request goes out. (kol360's `.superRefine` is the invariant home; this just saves a round trip.)
4. Update the `get-beid` client to include `country` + `nationalIdType` on every call. **This spec supersedes v1's "optional but recommended" language.** Curation-svc always sends both.
5. Handle the new response echo. On success, log `data.country` + `data.nationalIdType` for the reviewer-visible confirmation. On mismatch (dedup path returning something different from what curation-svc sent), surface that to the reviewer as a warning.
6. Backfill — see §5.2.
7. E2E tests: US regression, CA happy path, no-NPI CA, pairing enforcement (both directions), MINC normalization.

### 5.2 Backfill — identifying rows to correct

The identification method: **curation-svc supplies a beId list** to kol360; kol360 runs a batched UPDATE.

Rationale — curation-svc is authoritative for "which of these HCPs are Canadian" (reviewer notes, source URLs, institutional context). kol360 has no signal to infer country from `city`/`state` reliably (a `state` = "ON" could be Ohio or Ontario ambiguously; state alone is not a reliable classifier). One-shot process:

1. curation-svc queries its own DB / audit log for rows minted before the CA toggle rolled out that reviewers now identify as CA.
2. curation-svc sends kol360 team a CSV of `beId` values via the shared secure channel.
3. kol360 runs `UPDATE "Hcp" SET country = 'CA', nationalIdType = 'MINC' WHERE "beId" IN (...) AND country = 'US' AND nationalIdType = 'NPI'` (guarded WHERE clause prevents accidentally re-flipping a manually-corrected row). Runtime: seconds even for thousands of rows.
4. kol360 confirms the affected row count back to curation-svc for reconciliation.
5. **If any affected row's `npi` is already populated as a 10-digit NPI**, we cannot flip it in place — the identifier shape wouldn't match the new type. Those become the merge-tombstone flow (see §7 Q5) — curation-svc mints the correct MINC row, kol360 tombstones the wrongly-typed NPI row.

For v0.3 volumes this is a manual process. If backfill volume grows we can wrap it in an M2M endpoint; not needed today.

### 5.3 Field expectation (rewritten per review §2.2)

**Curation-svc always sends `country` + `nationalIdType` on every `get-beid` call.** Defaults are retained on the kol360 side for pre-integration callers (of which there are none in prod today besides curation-svc itself). Once curation-svc is on v1.17.71-aware code, "sometimes send, sometimes omit" is out of contract.

Rationale: omitting `country` when the HCP is actually Canadian silently classifies them US via the default. The pairing rule then fires only if `nationalIdType` was sent as `MINC` alone — otherwise you get a wrong-country row that Insights filters against silently. Belt-and-braces: always send.

---

## 6. Verification

Once curation-svc rolls out on v1.17.71+ integration:

1. **Round-trip a CA HCP.** Send `country: "CA"`, `nationalIdType: "MINC"`, fresh MINC. Confirm 201. Response echo matches. `GET /api/v1/hcps?country=CA` returns the HCP with canonical MINC.
2. **Round-trip a US HCP.** Same request shape with US/NPI. Behavior identical to pre-v1.17.69.
3. **Pairing violations.** Send `country: "US"` + `nationalIdType: "MINC"`. Expect 400 with the pairing message. Repeat with `country: "CA"` + `nationalIdType: "NPI"`.
4. **Insights isolation.** Load a US-region client dashboard. Confirm the CA HCP does NOT appear in KOL Explorer, Leader Rankings, or Sociometric Summary. Automated on the kol360 side in `e2e/api/canada-hcp-isolation.test.ts` and `e2e/api/curation-get-beid.test.ts` (three CA tests added v1.17.71).
5. **MINC normalization round-trip.** Send `npi: "CA-MD-1234-567-8"`. Confirm response echoes `nationalIdType: "MINC"`. Follow-up `GET /api/v1/hcps/:id` shows `npi: "CAMD12345678"` (canonical form).

---

## 7. Q&A

**Q1. What if a MINC HCP is also cross-licensed in the US (has an NPI too)?**

**Path B (from review §2.3 options).** Reviewer mints under primary practice country only. If cross-licensing is material to the record, capture the alternate identifier in `discoveredFrom.notes` (already accepted as freeform). Migration to `Hcp.alternateIds` (already in the schema, currently unused) is deferred until (a) we hit enough of these cases to justify wiring the read side, or (b) a customer explicitly asks. Ping the kol360 team when you observe the first case in the wild — we'll capture the alternate ID and pick a rollout window.

Why not Path A? `Hcp.alternateIds` needs FE surfaces (dedup UI, cross-country search) that we haven't scoped. Path B lets us capture the data now via the `notes` field without a schema-blocked ship window.

**Q2. What if the reviewer isn't sure whether the HCP is US or CA?**

Reviewer picks their best guess (default US as a policy — matches the historical corpus). If they later realize the classification is wrong, follow the correction flow in Q5 below.

**Q3. Does the audit log capture the country?**

Yes — always. `hcp.curation_minted_with_npi` / `hcp.curation_minted_no_npi` rows include the full request payload. Country + nationalIdType are also persisted on the `Hcp` row and queryable at any time. If a wrong-country mint gets caught later, both the audit trail and the current row state agree on what happened.

**Q4. State/province validation — enum or freeform?**

Freeform 2-letter for now. `Hcp.state.length === 2` is the only server-side check. Design intent: neither corpus (US or CA) has a stable-enough state/province vocabulary in curation-svc's source data to enforce enum at the boundary — HCP records with mis-abbreviated states are common enough that hard-rejecting would eat the batch.

**Recommendation:** curation-svc validates state against a country-conditional list (`STATE_US` for US, `STATE_CA` for CA) client-side. If a reviewer's input doesn't match, prompt for correction rather than pass it through. That's the invariant we want; keeping it on your side avoids kol360 needing a schema migration + backfill later.

**Q5. Correction path — reviewer edits a MINC after minting.**

Merge-tombstone flow. Per `curation-kol360-sync-spec-v0.3.md §6`: curation-svc mints a new HCP with the corrected identifier, then issues a merge request that tombstones the wrong row (90-day retention) and points references to the new one. No PUT-to-existing-beId endpoint — same policy as pre-v1.17.69.

Applies equally to: wrong MINC value, MINC that should have been an NPI (or vice versa — via re-mint with correct country + type), or wrong-country classification that has already accumulated a real `npi` value.

**Q6. Rate limits on `get-beid`?**

No hard rate limit today. Cognito's baseline throttles apply at the auth layer (~50 requests/sec per M2M client; the token itself is cached, so this only bites token minting). App Runner request throttling is per-service (~200 req/sec sustained on the test env's current config). If reviewer bulk-approve sessions approach either ceiling, ping us before rollout — we can size up or add a request-batching endpoint. For expected v0.3 volumes (single-reviewer, ~10s of approvals per session), no throttling risk.

**Q7. Can I test against koltest before flipping prod?**

Yes. `https://koltest.bio-exec.com` (test env, auto-deployed from `PreDiCaInc/kol360` main branch, currently v1.17.71). Same M2M client id + scope work there. API path identical.

---

## 8. Effort estimate reconciled

Review §4 estimated ~3-4 days curation-svc side. That still holds:

| Step | Effort (unchanged) |
|---|---|
| Country toggle + derived `nationalIdType` on NEW_HCP review UI | ~½–1 day |
| MINC regex + normalization on curation-svc (defensive) | ~2 hrs |
| Pairing check client-side (belt-and-braces) | ~½ hr |
| Update `getBeid` client to always send both fields + handle response echo | ~1 hr |
| Backfill coordination + execution (per §5.2) | ~½ day |
| E2E tests: US regression + CA happy path + no-NPI CA + pairing enforcement (both directions) | ~½ day |
| **Total** | **~3-4 days** |

---

## 9. Next steps

- **kol360 team:** ✓ prod-rel-4.1.51 (v1.17.71) shipped with pairing enforcement + response echo. Spec v2 published.
- **curation-svc team:** green light for implementation on v1.17.71+.
- **Both teams:** smoke test against `koltest.bio-exec.com` before curation-svc flips prod. Coordinate window via shared Slack channel.
