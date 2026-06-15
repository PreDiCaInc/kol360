# prod-rel-4.1.24 — Soak Checks (v1.17.44)

Tag at the merge commit on `main`. No migrations. Adds 2 influencer-type buckets + surfaces the allowed list as visible badges on the import dialog.

## Phase A — Sanity (within minutes of deploy)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.44", ... }
```

### A2. Import dialog shows 5-type badge list

Admin → HCPs → Import Influencer Types:
- Header now shows a row of 5 badges: National Leaders, Rising Stars, Regional Influencers, **Regional Leaders**, **Pre-Emergent**
- Description text matches

### A3. Template download includes the new types

Click "Download Template" → opened CSV has 5 sample rows, one per canonical type.

### A4. Upload a test CSV with the new types

```
NPI,InfluencerType
9990000001,Regional Leaders
9990000002,Pre-Emergent
```

Preview should show:
- matched: 2
- countsByType: `{ "Regional Leaders": 1, "Pre-Emergent": 1, ... }`
- No errors

### A5. Backend accepts aliases

Upload a row with `Pre Emergent` (space, no hyphen) and `regional leader` (singular, lowercase). Both should resolve to canonical and land as `matched`, not `invalidType`.

---

## Phase B — Regression (the existing 3 buckets still work)

```
NPI,InfluencerType
9990000001,National Leaders
9990000002,Rising Stars
9990000003,Regional Influencers
```

Preview: matched=3, no errors.

---

## Rollback gate

If A1-A2 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.23` (v1.17.43). Effects per the handoff "Rollback" section.
