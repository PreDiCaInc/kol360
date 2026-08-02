# prod-rel-5.1.0 — Soak Checks (v2.1.0)

Tag at the merge commit on `main`. 5 follow-up items bundled: TabHelpPopover
nested-button hydration fix (highest care — UI change on the insights tab
bar), `ensureClientSelected` e2e helper rewrite, TEAM_MEMBER `/clients` 403
suppression, break-glass single-invitation route (PLATFORM_ADMIN gate + audit
rename + `breakGlass: true` in response), and the `export.service.ts`
`cellText` hygiene sweep. See handoff for per-ticket details.

**No migrations.** No dep changes. Nothing to reinstall.

---

## On pull, run

Nothing. TS-only edits + one new e2e test file. Skip `pnpm install`, skip
`npx playwright install`, skip `npx prisma generate`.

---

## Phase A — Version deployed

### A1. Version returned by `/health`

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "2.1.0", ... }
```

If the version doesn't flip within ~5 min of merge, trigger a manual
deploy per the `tdct` runbook.

There are **no migrations** to verify — skip the `_prisma_migrations` query.

---

## Phase B — TabHelpPopover no longer nests `<button>` inside `<button>` (highest care)

**This is the top gate.** #1 is the highest-risk item — structural DOM
change on the insights tab bar. Two verifications: (B1) manual visual smoke
on prod, (B2) automated console-warning check.

### B1. Manual visual smoke on prod

1. Log in to `https://kol360.bio-exec.com` as PLATFORM_ADMIN.
2. Navigate to any Insights dashboard that has real data, e.g.
   `/admin/dashboards/<Dry-Eye-DA-ID>?clientId=<Sun-Pharma-Client-ID>`.
3. Open browser devtools **Console** tab BEFORE the page loads. Reload with
   devtools open.
4. **Green gate:** no `<button> cannot be a descendant of <button>` warning
   in the console. Pre-fix (v2.0.5): 4 of these warnings appear on every
   insights dashboard load, one per popover-carrying tab
   (Demographics / Benchmarking / Sociometric Leaders / Total Weighted
   Score).
5. **Green gate:** all 5 tabs render normally. The ? help icon appears on
   the right edge of the 4 non-Introduction tabs.
6. **Green gate:** click the ? icon on the Demographics tab. Popover opens
   with the Demographics one-liner + bullets + "Open full guide →" link.
   The active tab **STAYS** on whatever it was before (does NOT switch
   to Demographics from the popover click).
7. **Green gate:** click the Demographics tab label directly (not the ?).
   Tab switches to Demographics as expected. Popover from step 6 (if still
   open) auto-closes.

If ANY of steps 4-7 fail: rollback per the "Rollback gate" section below.
Item #1 is the highest-value fix in the bundle but also the highest risk
of the group.

### B2. Console-warning check via curl-and-grep (optional smoke)

Not available — hydration warnings only fire in the browser, not on the
server-render pass. B1 is the canonical check.

### B3. Pie-chart re-render race — regression check

The pie-chart-blank fix from prod-rel-5.0.3 / 5.0.4 is STILL IN PLACE in
this release (belt-and-suspenders). Verify that fix didn't regress:

1. On the same insights dashboard from B1, click into the **Demographics**
   tab.
2. Wait for the Respondent Role pie chart to render.
3. **Green gate:** pie is visible, non-empty, colored slices with labels.
4. Toggle Chart → Table on the Respondent Role card, then Table → Chart.
5. **Green gate:** pie renders again on the second Chart flip.

If B3 fails but B1 passes: the hydration fix took but the pie remount
race isn't fully resolved. NOT a v2.1.0 rollback gate — file back to dev
as a follow-up (the ResizeObserver hack from 5.0.3 / 5.0.4 is still in
place; something else regressed).

---

## Phase C — TEAM_MEMBER `/clients` 403 suppression

**Requires a TEAM_MEMBER account on prod.** If pteam doesn't have one,
skip this phase — the fix is FE-side console-noise suppression, not a
data-integrity change; test-env verification (B2 below) is sufficient.

### C1. TEAM_MEMBER login smoke on prod

1. Log in to `https://kol360.bio-exec.com` as any TEAM_MEMBER user (e.g.
   a Sun Pharma team member if available).
2. Open browser devtools **Network** tab BEFORE the page loads. Reload
   with devtools open.
3. Navigate through: `/admin/dashboards` → any Insights dashboard.
4. **Green gate:** the Network tab shows NO request to
   `GET /api/v1/clients` (with or without query params). The
   `/api/v1/clients/me` request is fine and expected.
5. Pre-fix (v2.0.5): the request fires on every insights dashboard load
   and every user-menu open; response is 403 with an error toast in the
   console.

### C2. Fallback: verify at the hook level in test env

If pteam has no TEAM_MEMBER account on prod, verify the FE hook gate on
the deployed test env:

1. Log in to `https://koltest.bio-exec.com` as any TEAM_MEMBER user.
   (Pteam may need to seed one via Cognito console or via the invite
   flow.)
2. Open Insights Dashboard.
3. Same green gate as C1.4.

C1 or C2 is sufficient — either is a green gate. No BE state to verify
(the /clients route itself is unchanged).

---

## Phase D — Break-glass single-invitation route

**Prerequisite for this phase — the underlying send infrastructure works.**
Prod SES + campaign-send has been steady through 5.0.4 / 5.0.5; if it's
broken this phase will fail for reasons unrelated to v2.1.0.

### D1. Break-glass route reachable + audit-logged

1. Log in to `https://kol360.bio-exec.com` as PLATFORM_ADMIN.
2. Pick any ACTIVE campaign with at least one HCP that has been sent an
   invitation (has an EmailDeliveryEvent history).
3. Trigger a break-glass send. The route is not wired to a UI button in
   this release (that's a follow-up) — hit it via `curl`:

   ```bash
   TOKEN='<your-cognito-id-token>'
   CAMPAIGN='<active-campaign-cuid>'
   HCP='<hcp-cuid-attached-to-campaign>'
   curl -sX POST \
     -H "Authorization: Bearer $TOKEN" \
     "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/campaigns/$CAMPAIGN/distribution/$HCP/send"
   ```

4. **Green gate:** response is 200 with body
   `{"success":true,"messageId":"<ses-message-id>","breakGlass":true}`.
   The `breakGlass:true` is the new v2.1.0 signal — pre-v2.1.0 the response
   was `{"success":true,"messageId":"..."}` only.

### D2. Audit-log verification (via prod tunnel)

```bash
scripts/tunnel-up.sh prod   # port 5433
PGPASSWORD=RDS4Bioexec2025 psql \
  -h localhost -p 5433 -U kol360admin -d kol360 -c "
    SELECT \"action\", \"entityId\", \"newValues\", \"createdAt\"
    FROM \"AuditLog\"
    WHERE \"action\" = 'distribution.invitation_break_glass_send'
    ORDER BY \"createdAt\" DESC LIMIT 5;
  "
```

**Green gate:** the D1 send appears as a
`distribution.invitation_break_glass_send` row with `entityId`
`<campaignId>:<hcpId>` and `newValues.reason` set to
`'break_glass_cooldown_bypass'`. Old (pre-v2.1.0) calls would have
appeared as `distribution.invitation_sent` — the rename is deliberate so
future audits can distinguish break-glass overrides from routine sends.

### D3. Role-guard verification

Only PLATFORM_ADMIN can hit this route. There is no dev-side way to
exercise CLIENT_ADMIN or TEAM_MEMBER path without swapping to a
CLIENT_ADMIN / TEAM_MEMBER token — skip if inconvenient. Optional check:

```bash
CLIENT_ADMIN_TOKEN='<client-admin-cognito-id-token>'
curl -sX POST \
  -H "Authorization: Bearer $CLIENT_ADMIN_TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/campaigns/$CAMPAIGN/distribution/$HCP/send"
# Expected: 403 Forbidden
```

---

## Phase E — POST-DEPLOY DB CLEANUP (Part 2 — manual runbook step)

**This is NOT included in the v2.1.0 code deploy.** It's a one-shot data
cleanup pteam runs at their convenience after the release is soak-cleared,
to close the residual state pteam noted in the v2.0.5 handoff:
> "The four orphan `SurveyResponse status='RECENTLY_SURVEYED'` rows written
> for jboyd / jpikor on the two B&L Canada campaigns on 2026-07-30 — safe
> to leave (CampaignHcp rows already removed by biz user); optional
> prod-side `DELETE` documented in the finding."

We're rolling that cleanup into this release as an explicit runbook step so
it doesn't accumulate as tech debt.

### E1. Audit the 4 rows first (dry run)

```bash
scripts/tunnel-up.sh prod   # port 5433
PGPASSWORD=RDS4Bioexec2025 psql \
  -h localhost -p 5433 -U kol360admin -d kol360 -c "
    SELECT sr.\"id\", sr.\"campaignId\", c.\"name\" AS campaign_name,
           sr.\"respondentHcpId\", h.email,
           sr.\"status\", sr.\"createdAt\"
    FROM \"SurveyResponse\" sr
    JOIN \"Hcp\" h ON h.\"id\" = sr.\"respondentHcpId\"
    JOIN \"Campaign\" c ON c.\"id\" = sr.\"campaignId\"
    WHERE sr.\"status\" = 'RECENTLY_SURVEYED'
      AND h.\"email\" IN ('jboyd@bio-exec.com', 'jpikor@bio-exec.com')
      AND sr.\"createdAt\"::date = DATE '2026-07-30'
    ORDER BY sr.\"createdAt\" DESC;
  "
```

**Green gate (dry run):** query returns exactly 4 rows (jboyd × 2
campaigns + jpikor × 2 campaigns). If it returns 0, the rows were already
cleaned up out-of-band — skip E2. If it returns >4, additional orphans
have accumulated post-v2.0.5 — capture the extra IDs and file back to dev
before deleting.

### E2. Delete the 4 rows

```bash
PGPASSWORD=RDS4Bioexec2025 psql \
  -h localhost -p 5433 -U kol360admin -d kol360 -c "
    DELETE FROM \"SurveyResponse\"
    WHERE \"status\" = 'RECENTLY_SURVEYED'
      AND \"respondentHcpId\" IN (
        SELECT \"id\" FROM \"Hcp\"
        WHERE \"email\" IN ('jboyd@bio-exec.com', 'jpikor@bio-exec.com')
      )
      AND \"createdAt\"::date = DATE '2026-07-30';
  "
```

**Green gate:** `DELETE 4` returned. If DELETE 0 → E1 already showed 0
rows, nothing to do. If DELETE N where N > 4 → the E1 audit already caught
it; you deliberately widened the delete. Log the actual count in the soak
notes.

### E3. Confirm no CampaignHcp orphans left behind

```bash
PGPASSWORD=RDS4Bioexec2025 psql \
  -h localhost -p 5433 -U kol360admin -d kol360 -c "
    SELECT ch.\"campaignId\", h.email, ch.\"emailSentAt\"
    FROM \"CampaignHcp\" ch
    JOIN \"Hcp\" h ON h.\"id\" = ch.\"hcpId\"
    WHERE h.\"email\" IN ('jboyd@bio-exec.com', 'jpikor@bio-exec.com')
    ORDER BY ch.\"campaignId\";
  "
```

**Green:** returns rows only for campaigns that legitimately intend to
include jboyd / jpikor as respondents. If the biz user's cleanup pass
left CampaignHcp rows for the two B&L Canada campaigns they meant to
scrub, capture campaign IDs and file back to dev — those CampaignHcp
rows are a separate residue, not this release's Part 2 scope.

---

## Phase F — 24h light watch

Same posture as 5.0.5.

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for:

- Any spike in `/api/v1/campaigns/*/distribution/*/send` 5xx responses —
  the break-glass route is new-behavior (new response shape, new audit
  action). Zero web callers today; baseline should stay flat unless pteam
  runs the D1 curl test.
- Any spike in `/api/v1/clients` 403 responses — pre-v2.1.0 baseline was
  N per-TEAM_MEMBER-per-page-load. Post-v2.1.0 baseline should be 0 (or
  much lower — the FE gate blocks the noisy TEAM_MEMBER + CLIENT_ADMIN
  paths).
- Any user report of "the ? help icons are missing on Insights tabs" or
  "clicking the ? switches to that tab now" — either would indicate the
  #1 fix regressed the visual layout. Capture screenshot + report back.

No new API endpoints; API error baseline should remain flat.

---

## Rollback gate

Roll back if any of the following fail:

- **A1** — `/health` doesn't return 2.1.0 within the deployment window →
  App Runner issue; check CloudWatch + redeploy or revert the tag.
- **B1 (P1 gate for #1)** — nested `<button>` hydration warning still fires
  on prod insights dashboard load, OR the ? icons are missing from the
  tabs, OR clicking a ? activates the underlying tab. The #1 fix is a
  structural DOM change — if any of these three symptoms appear, roll back
  and file back to dev.
- **B3** — pie-chart-blank symptom returns → NOT a rollback gate on its
  own (the ResizeObserver hack is still in place from 5.0.3 / 5.0.4), but
  investigate together with B1: if B1 also fails, the hydration fix
  regressed the pie fix too.
- **D1** — break-glass route returns 500 (not 200 or 400) on a
  known-valid HCP + ACTIVE campaign → the new preHandler or the audit-log
  rename broke the route. Not a data-loss gate (single-send has zero web
  callers today; only pteam-side curl invocations use it).

Phase E is a post-soak manual cleanup — never a rollback gate. Phases C
and D3 are optional (depend on pteam having a TEAM_MEMBER or CLIENT_ADMIN
account handy) — skip cleanly if inconvenient.

**Rollback shape:** revert the PR on `main` → App Runner auto-redeploys to
v2.0.5. No schema to unwind, no infra state to unwind. If Phase E already
ran, the 4 deleted RECENTLY_SURVEYED rows stay deleted (harmless — they
were orphans pre-cleanup).

---

## See also

- Handoff: [`prod-rel-5.1.0-handoff.md`](prod-rel-5.1.0-handoff.md)
- Predecessor: [`prod-rel-5.0.5-handoff.md`](prod-rel-5.0.5-handoff.md)
- Pteam findings + prior release refs:
  - `docs/findings/insights-use-case-guide-presentation-2026-06-24.md`
  - `docs/findings/prod-rel-5.0.2-post-soak-notes-2026-07-26.md`
  - `docs/findings/send-cooldown-bioexec-exception-2026-07-30.md`
  - `docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md`
