# prod-rel-4.1.21 — Soak Checks (v1.17.41)

Tag at the merge commit on `main`. Single-line tooltip clarity fix on top of `prod-rel-4.1.20`. No migrations.

## What 4.1.21 changed

Survey Score (i) tooltip dropped Regional Leader from the "Not counted" list — that enum value exists but no customer survey uses it, so listing it was confusing. Backend formula behavior unchanged.

## Phase A — Sanity (within minutes of deploy)

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.41", ... }
```

### A2. Tooltip text matches

Insights → KOL Explorer → hover (i) next to the **Survey** column header. Tooltip should read:

> Counted (4): National Leader, Discussion Leaders, Advice Leaders, Rising Star.
> Not counted: Referral Leaders, Social Leader, Biased Leader.

No mention of Regional Leader.

### A3. scoreSurvey numbers unchanged

Numbers on the Insights dashboard for any analysis recalculated under 4.1.20 should be **identical** under 4.1.21 — only the tooltip wording changed. No need to click Recalculate.

---

## Rollback gate

If A1-A2 don't pass, redeploy `prod-rel-4.1.20` (v1.17.40). Backend behavior is unchanged either way; this is a pure cosmetic-text fix.
