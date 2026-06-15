# prod-rel-4.1.26 — Soak Checks (v1.17.46)

Tag at the merge commit on `main`. Single-line UI follow-on to 4.1.25. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.46", ... }
```

### A2. NPI under the name on KOL Profile

Insights → KOL Explorer → click any HCP.

Verify the header now reads, top to bottom:

```
Dr. <Name>                              <- text-4xl extra-bold (hero)
NPI <10-digit number>                   <- new: font-mono, muted
[Influencer Type] [Specialty] [Total]…  <- 4-tile metric row (unchanged)
```

For HCPs whose `Hcp.npi` is null, the NPI line conditionally hides (no "NPI -" rendering). Verify by picking an HCP without NPI.

### A3. Soak items from 4.1.25 still pass

The 4.1.25 soak checks (column-selector inline, sidebar shuffle, View Scores gating, Nominators NPI + Campaign role-gate) should all still pass — 4.1.26 only adds the one new line and doesn't touch anything else.

---

## Rollback gate

If A1-A2 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.25` (v1.17.45). NPI line disappears from the profile header.
