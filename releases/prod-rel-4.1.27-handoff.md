# prod-rel-4.1.27 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.27` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.26` (v1.17.46).
**Bundles:** v1.17.47 — 6 focused UX fixes layered on top of 4.1.26. No schema, additive backend response field only.

## TL;DR

6 small wins from pteam review:
1. **Bug fix**: View Scores page was returning HCPs unrelated to the selected disease area (Karpecki turned up with all em-dashes under Medical Oncology). Now scopes to active DA.
2. **Bug fix**: Decile bar charts on Insights rendered tallest-bar-first instead of decile 1→10. Now ordinal.
3. **Bug fix**: Client form "Allowed Email Domains" textbox said comma-separated but didn't accept commas or spaces.
4. **Polish**: Export Excel on the Nominators table.
5. **Polish**: NPI moved inline next to the name on KOL Profile (was: below).
6. **Polish**: Nominator names hyperlink to their own KOL Profile when they have scores in the analysis.

## What changes for customers

| Surface | Before (4.1.26) | After (4.1.27) |
|---|---|---|
| `/admin/hcps/scores` (View Scores, PLATFORM_ADMIN-only) | Search returned every HCP on the platform matching the query, regardless of disease area. Per-row score cells blanked out when the HCP wasn't linked to the selected DA. Paul Karpecki (Optometry / dry-eye) appeared under DA=Medical Oncology with every score column as `—`. | API call now passes `diseaseAreaIds: [activeDiseaseAreaId]`. The `/hcps` endpoint joins on `HcpDiseaseArea` internally; only HCPs linked to the selected DA come back. Karpecki disappears from Medical Oncology results; appears under his actual DAs with populated scores. |
| Insights → Demographics → Treatment Decile chart | Bars ordered by count desc (highest population first) — broke the left-to-right decile narrative | Bars ordered by decile NUMBER ascending (1, 2, 3, …, 10). Same on the KOL Profile's "Nominations by Treatment Decile" chart (which reuses the same backend path). |
| Client form (Create / Edit Client) — Allowed Email Domains | Textbox label said "Comma-separated" but every typed `,` or space was instantly eaten by the controlled-input round-trip (parse → join → re-render stripped the separator). User couldn't actually type a list at all. | New `<DomainsInput>` subcomponent: raw text in local state, parsed to array on blur. Submit button blurs the input before the form reads, so submission catches up cleanly. |
| KOL Profile (in KOL Explorer) — Nominators table | "Show All / Show Less" only; export only via the parent KOL Explorer's Export Excel | New **Export Excel** button next to Show All. Exports the FULL sorted nominator list (not just the 25 shown). Filename slug derives from the KOL name. Campaign column gated to PLATFORM_ADMIN, matching the on-screen v1.17.45 role gate. |
| KOL Profile header | NPI on its own line below the name | **NPI inline** next to the name (font-mono smaller, `items-baseline`). Long names + credentials wrap gracefully via `flex-wrap`. |
| Nominators table — name cell | Plain text | **Hyperlinks** to that nominator's KOL Profile when they have scores in the analysis (i.e. their profile would render usefully). Plain text otherwise (their profile would be empty — no false promises). |

## API changes (one additive field)

| Endpoint | Change | Pre-4.1.27 callers |
|---|---|---|
| `GET /api/v1/insights/:da/kol-profile/:hcp` | Each nominator item now includes `hasScores: boolean`. True iff the nominator has an HcpAnalysisScore row in this analysis. | Continue to work; the new field is ignored if unread. |
| `GET /api/v1/insights/:da/demographics` | `byDecile[]` is now sorted by decile NUMBER (1→10) instead of count desc. | Frontend just renders the array in order; downstream consumers that re-sort are unaffected. |
| `GET /api/v1/insights/:da/kol-profile/:hcp` | `nominatorDemographics.byDecile[]` sorted the same way. | Same as above. |

## Migrations

**None.** Code-only.

## Risk

**Low.** All bug fixes + small additive backend field + frontend UX polish.

The most user-visible behavioral change is that the View Scores page now filters by DA — so a CLIENT_ADMIN... wait, CLIENT_ADMIN can't see View Scores anymore as of 4.1.25 (PLATFORM_ADMIN gate). Net effect for PLATFORM_ADMIN: View Scores now correctly only shows HCPs in the active DA. If pteam previously used the "search across all HCPs" side-effect to find someone whose DA they didn't know, they now need to pick the right DA first (or use HCP admin's search instead).

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **230/230** |
| New e2e assertions | Added to `insights-report.test.ts`: byDecile sorted 1→10 on both demographics + kol-profile responses; `nominator.hasScores` is a boolean; `nominator.npi` field present |

## Rollback

Redeploy `prod-rel-4.1.26` (v1.17.46). Effects per the 5 items above reversed. No data destruction.

## See also

- Soak checks: [`prod-rel-4.1.27-soak-checks.md`](prod-rel-4.1.27-soak-checks.md)
- Predecessor: [`prod-rel-4.1.26-handoff.md`](prod-rel-4.1.26-handoff.md)
