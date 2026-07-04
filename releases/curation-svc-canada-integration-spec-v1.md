# Canada HCP Support — Curation-svc Integration Spec (v1 — SUPERSEDED)

> ⚠️ **This spec has been superseded by [v2](curation-svc-canada-integration-spec-v2.md)** after curation-svc team review ([review](curation-svc-canada-integration-spec-v1-review.md)). v2 adds server-side `country`/`nationalIdType` pairing enforcement, response echo of persisted fields, and clarifies the always-send expectation, cross-licensing path, backfill identification method, correction flow, and rate-limit posture.
>
> Read v2 instead. This file is kept only as history.

**Status:** Ready for curation-svc integration.
**kol360 side:** shipped v1.17.69 (prod-rel-4.1.49), backward compatible.
**Contact:** kol360 team; questions via the shared Slack channel.
**Related tickets:**
- `docs/findings/canada-hcp-support-lite-plan-2026-06-25.md` (kol360 side)
- Prior curation spec: `kolcuration/spec/curation-kol360-sync-spec-v0.3.md §6.2`

---

## 1. Purpose

kol360 v1.17.69 extended `Hcp` to support Canadian identifiers (MINC in addition to US NPI). The curation `POST /api/v1/hcps/get-beid` endpoint now accepts two new optional fields — `country` + `nationalIdType` — so curation-svc can register CA HCPs.

Existing curation-svc requests (no new fields) continue to work identically. This spec is a coordination-free integration: kol360 already accepts the new fields with US/NPI defaults; curation-svc can start sending them whenever ready.

---

## 2. What changed on the kol360 side

**Endpoint URL:** unchanged — `POST /api/v1/hcps/get-beid`
**Auth:** unchanged — Cognito `client_credentials` grant, scope `kol360-api/hcps:write-stub`, minted by `curation-svc-to-kol360` client id `5ml2abmii9ot8eesu6birg5dmq`.
**Response shape:** unchanged.

**New request fields (both optional, with defaults):**

| Field | Type | Default | Notes |
|---|---|---|---|
| `country` | enum `"US" \| "CA"` | `"US"` | Persisted on `Hcp.country`. Drives Insights isolation (a US client's dashboard cannot see CA HCPs and vice-versa). |
| `nationalIdType` | enum `"NPI" \| "MINC"` | `"NPI"` | Persisted on `Hcp.nationalIdType`. Tells the display layer whether to label the identifier as "NPI" or "MINC" in tables + CSV exports. |

**Identifier validation rule** (`npi` field, when present):
- `nationalIdType: 'NPI'` → `npi` must match `/^\d{10}$/`
- `nationalIdType: 'MINC'` → `npi` must match `/^CAMD\d{8}$/` after normalization

**MINC normalization:** if you send `"CA-MD-1234-567-8"` or `"camd12345678"`, kol360 will normalize to canonical `CAMD########` before storing. Recommended: send the canonical form directly to keep audit logs clean.

**Dedup behavior:** unchanged — dedup is still by `Hcp.npi` UNIQUE constraint. A MINC and an NPI with the same digit sequence cannot collide because the letter prefix makes them distinct strings. If curation-svc sends the same MINC twice, the second call gets the existing beId back (`wasExisting: true`).

---

## 3. Contract

### 3.1 Request — canonical US case (unchanged)

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
  "discoveredFrom": {
    "source_url": "https://directory.example.com/jane-smith",
    "scraper_run_id": "run-2026-07-01-a",
    "ai_verification_snapshot_url": "s3://kolcuration-snapshots/run-2026-07-01-a/jane-smith.json",
    "captured_at": "2026-07-01T10:00:00Z"
  }
}
```

Response — same as pre-v1.17.69:

```json
{ "beId": "BE-000123", "id": "cmxxxxxxxx", "createdAt": "2026-07-01T10:00:01.123Z", "wasExisting": false }
```

### 3.2 Request — Canada case (new)

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
  "discoveredFrom": {
    "source_url": "https://directory.example.ca/francois-tremblay",
    "scraper_run_id": "run-2026-07-01-b",
    "ai_verification_snapshot_url": "s3://kolcuration-snapshots/run-2026-07-01-b/francois-tremblay.json",
    "captured_at": "2026-07-01T10:05:00Z"
  }
}
```

**Notes:**
- `country: "CA"` + `nationalIdType: "MINC"` MUST be paired. Sending `country: "CA"` with `nationalIdType: "NPI"` (or vice versa) is currently accepted by the schema but is a downstream data-integrity landmine — please pair them.
- `state: "QC"` accepts any 2-letter code. Canadian provinces (`QC`, `ON`, `BC`, `AB`, `MB`, `SK`, `NS`, `NB`, `PE`, `NL`, `YT`, `NT`, `NU`) are all valid.
- MINC hyphenation optional (`CA-MD-8765-432-1` is normalized to `CAMD87654321`).

Response — identical shape:

```json
{ "beId": "BE-000124", "id": "cmxxxxxxxx", "createdAt": "2026-07-01T10:05:01.456Z", "wasExisting": false }
```

### 3.3 Request — no-identifier case (unchanged)

If the reviewer approved a NEW_HCP with no identifier available, the country still needs to be supplied so the row lands with the right classification for Insights isolation:

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

`npi` omitted → kol360 mints a fresh beId with `Hcp.npi = NULL`, `Hcp.country = 'CA'`, `Hcp.nationalIdType = 'MINC'`.

---

## 4. Error responses

**400 — malformed identifier for declared type**

```http
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "npi: MINC must be 12 characters: CAMD followed by 8 digits (input may be hyphenated; will be normalized)"
}
```

Triggered when `nationalIdType: 'MINC'` but `npi` fails `/^CAMD\d{8}$/` even after normalization. Reviewer needs to correct the value or drop the identifier and mint no-NPI.

**400 — invalid country enum**

```http
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid enum value. Expected 'US' | 'CA'"
}
```

**401 / 403 — auth**

Unchanged. Same as pre-v1.17.69.

---

## 5. Migration plan for curation-svc

**Zero-coordination rollout.** kol360 accepts both old (no country) and new (with country) shapes as of prod-rel-4.1.49. Curation-svc can flip whenever ready.

Suggested sequence:

1. **Add country selection to the curation-svc reviewer UI.** For each NEW_HCP review item, the reviewer picks US or Canada. Default US. `nationalIdType` is derived: US → NPI, CA → MINC.
2. **Add MINC validation on the curation-svc side.** Same regex as kol360: `/^CAMD\d{8}$/` after normalizing (uppercase + strip non-alphanumerics). Bounces malformed values before hitting kol360's 400.
3. **Update the get-beid client to include `country` + `nationalIdType`** on every call. For US HCPs, sending `"US"` + `"NPI"` is optional but recommended for clarity.
4. **Backfill** — if curation-svc has historical CA HCPs (submitted before the toggle existed) that landed with `country='US'` by default, coordinate a one-time SQL update on the kol360 side. Contact kol360 team; ~5-minute manual step.

No breaking change is planned. When curation-svc starts sending the new fields, existing rows are unaffected.

---

## 6. Verification

**Once curation-svc rolls out**, verify with:

1. **Round-trip a CA HCP.** Send a `country: "CA"` request with a fresh MINC. Confirm 201 with a beId. Query `GET /api/v1/hcps?country=CA` on the kol360 side and confirm the HCP appears with `nationalIdType: "MINC"` and canonical uppercase MINC value.
2. **US regression.** Send a `country: "US"` (or omit country entirely) request. Confirm behavior is identical to pre-v1.17.69.
3. **Insights isolation.** Load a Sun Pharma US dashboard on the kol360 side. Confirm the CA HCP does NOT appear in KOL Explorer, Leader Rankings, or Sociometric Summary. (Optional — this is covered by kol360's own automated e2e in `e2e/api/canada-hcp-isolation.test.ts`.)

---

## 7. Q&A

**Q. What if a MINC HCP is also cross-licensed in the US (has an NPI too)?**
Today: pick one — send the primary identifier only. `Hcp.npi` is a single column and dedup is by that. If cross-licensing becomes common, kol360 has a `Hcp.alternateIds` array field ready for it (currently unused). Ping the kol360 team to enable that path.

**Q. What if the reviewer isn't sure whether the HCP is US or CA?**
Default to US (backward-compatible behavior). A follow-up can move the HCP to CA via a manual DB update if needed. Better than a wrong-country classification for the automated Insights filter.

**Q. Does the audit log capture the country?**
Yes — `hcp.curation_minted_with_npi` and `hcp.curation_minted_no_npi` audit rows include the request payload's `discoveredFrom` and `m2mClientId`. Country/nationalIdType are persisted on the `Hcp` row itself and queryable at any time.

**Q. What happens if I send `nationalIdType: "MINC"` with `country: "US"`?**
The Zod schema accepts it today (they're independent enums). The row will land with mixed values — technically valid but semantically wrong. Please pair them. If you want, we can add a superRefine to reject this combination; ping the kol360 team.

**Q. Can I test against koltest before flipping prod?**
Yes. `koltest.bio-exec.com` is the test environment (auto-deployed from `PreDiCaInc/kol360` main branch). Same M2M scope + client id work there. The API path is identical.
