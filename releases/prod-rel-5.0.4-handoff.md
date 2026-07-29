# prod-rel-5.0.4 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Fully reversible via PR revert.
**Tag:** `prod-rel-5.0.4` — anchor at the merge commit on `main`.
**Supersedes:** `prod-rel-5.0.3` (v2.0.3).
**Bundles:** v2.0.3 → v2.0.4 — hotfix on top of 5.0.3.

**One thing changed:** the Demographics "Respondent Role" pie chart is
swapped from Recharts to hand-rolled inline SVG. Fifth iteration on this
bug in one day; this is the first one visually confirmed rendering in a
browser before ship.

---

## On pull, run

**Nothing to reinstall. TS-only change to one file (`pie-distribution-chart.tsx`). Just `git pull`.**

Zero `package.json` dep edits, zero `pnpm-lock.yaml` movement, zero
pretest-hook changes. The only edits are (a) one TypeScript file
(`pie-distribution-chart.tsx`), (b) three `package.json` version-string
bumps (2.0.3 → 2.0.4), (c) this handoff + soak-checks doc + README row.

Skip `pnpm install`, skip `npx playwright install`, skip
`npx prisma generate`.

---

## TL;DR

**Nothing to reinstall. TS-only change to one file (`pie-distribution-chart.tsx`). Just `git pull`.**

Fifth iteration on the Demographics "Respondent Role" pie regression.
The prior four attempts (4.1.56 wrappers → 5.0.3 hook → 5.0.4 split-
render → 5.0.4 observer-only) all failed to render the pie under the
async-data-arrives path — the actual production path that users hit.

Pteam's late-day diagnostic (see finding doc link below, §UPDATE)
surfaced the underlying root cause: a React 18 hydration bailout caused
by an invalid `<button>`-in-`<button>` nesting in `TabHelpPopover`
was creating a chaotic re-render cycle that no Recharts measurement
fix could reliably survive. Every mount-timing / ResizeObserver /
split-render approach was fighting the symptom, not the cause.

**This fix (pteam's primary rec):** swap `PieDistributionChart` to a
hand-rolled inline SVG donut. Fixed viewBox (`0 0 240 240`), one static
`<path>` per slice, native `<title>` for hover tooltips, plain
flex-layout legend. No Recharts, no `ResponsiveContainer`, no
lifecycle hooks, no measurement race, no hydration timing dependency.
Renders identically on server and client — hydration is a no-op.

The public component interface is preserved. `PieDistributionChart`
still accepts `{ data: {name, value, color?}[], title? }` and returns
the same visual shape (donut + legend to the right). Callers
(`demographics-tab.tsx`, `kol-explorer.tsx`) are unchanged. That means
the same swap also fixes the KOL Explorer specialty pie for free.

Recharts is still used elsewhere on the same tab (Educational Resources
bar, Social Media bar, State bar) — those charts self-heal on scale
change per pteam's original analysis and were never affected by this
regression. The swap was surgical to the pie only.

**Visually verified on localhost by user (Sam @ Sun Pharma / Dry Eye
DA) before commit.** This is the first fix in this bug class actually
confirmed rendering in a browser prior to ship — breaking the "compile
green, ship, hope" pattern that pteam called out after the 5.0.3 no-op.

---

## What changed — file by file

### `apps/web/src/components/insights/charts/pie-distribution-chart.tsx`

Full rewrite. Component is now a pure-render function:

- Sums `value` across the data array; if `total === 0` or `!data.length`,
  renders the "No data available" fallback (unchanged behavior).
- Otherwise walks slices, computes cumulative-angle start/end per slice,
  emits one `<path>` per slice using an `M / A / L / A / Z` donut path
  (outer radius 100, inner radius 55, viewBox 240×240).
- Each `<path>` gets a native SVG `<title>` child for browser-provided
  hover tooltip (name + count + percentage).
- Legend renders as a plain `<ul>` to the right of the SVG with color
  swatches and label + percentage.
- No `useEffect`, no refs, no `ResizeObserver`, no `key` bumping.
- No Recharts import.

Included: a multi-paragraph header comment documenting why this file
went inline-SVG (so the next person reading the file understands the
history and doesn't reintroduce a chart library "for consistency").

**Public interface preserved.** Component signature is
`PieDistributionChart({ data, title? })`. No caller changes required
and none were made. The KOL Explorer specialty pie uses the same
component, so it inherits the fix.

---

## Migrations

**None.** Zero schema.

---

## Risk

**Very low.** One TS file rewritten. No Recharts touched. No caller
touched.

- The failing path (Recharts `ResponsiveContainer` measuring 0×0
  during a hydration-bailout re-render) is physically gone — there is
  no `ResponsiveContainer` in this component anymore.
- Inline SVG has no measurement lifecycle: it renders whatever the
  viewBox tells it, scaled to the CSS-sized parent. The parent's
  layout race is now irrelevant.
- On empty-data DAs (`!data.length || total === 0`), the "No data
  available" fallback is preserved.
- Bar charts on the same tab (Educational Resources, Social Media,
  State) are Recharts and are untouched — they self-heal on scale
  change and were never broken by this regression.
- The KOL Explorer specialty pie uses the same component and gets
  the same fix for free — no explicit "did you also update the
  Explorer pie?" step required, because the component change is
  the fix.

Rollback shape: revert the PR. No schema, no infra state.

---

## Known-unfixed hygiene (deliberately not in this PR)

The `TabHelpPopover` nested-`<button>` React hydration warning is the
underlying root cause of the pie's misbehavior (per pteam's late-day
analysis). This PR routes around the warning by making the pie's
render immune to hydration timing — but the warning itself is still
in prod. Pteam recommends fixing it separately.

Rationale for holding it out of this PR:

- The pie fix is verified and needs to ship today. The
  `TabHelpPopover` fix is small but touches the tab-header layout and
  needs its own visual verification pass on all tabs — not something
  to bundle into a hotfix that the user is actively watching.
- Filed as a follow-up. Suggested shape: replace the outer trigger
  `<button>` in `TabHelpPopover` with a non-button element
  (`<span role="button" tabIndex={0}>`) or an `<a>`; whichever
  matches the existing UX. Verify no other component makes the same
  nesting mistake elsewhere on Insights.

---

## Test environment verification

At `v2.0.4` on dev branch:

| Check | Result |
|---|---|
| `pnpm --filter @kol360/shared build` | pass |
| `pnpm --filter @kol360/api build` | pass |
| `pnpm --filter @kol360/web build` | pass |
| **Localhost pie visual render** | **pass — user confirmed** |

**This is the first fix in this bug class actually confirmed rendering
in a browser before ship.** User loaded the Demographics tab on
localhost as Sam (TEAM_MEMBER role, Sun Pharma / Dry Eye DA) and
visually confirmed the two-slice donut renders with legend before
saying "we're good, ship it."

Formal e2e / soak verification happens post-deploy per `tdct` — see
`prod-rel-5.0.4-soak-checks.md`.

---

## Rollback shape

1. Revert the PR on `main` → App Runner auto-redeploys to v2.0.3.
2. Note: v2.0.3 has the broken pie fix (ship + no-op). Reverting to
   v2.0.3 puts you back at the same broken state prod is on today.
   Rollback further to v2.0.2 if the broken-pie state is somehow
   worse than the pre-fix state (it shouldn't be — same symptom).
3. No DB state to unwind (no migrations in this release).
4. No Cognito or infra state to unwind.

---

## See also

- Soak checks: [`prod-rel-5.0.4-soak-checks.md`](prod-rel-5.0.4-soak-checks.md)
- Pteam root-cause finding (the reason for the SVG swap):
  [`docs/findings/prod-rel-5.0.3-pie-fix-didnt-take-2026-07-28.md`](../docs/findings/prod-rel-5.0.3-pie-fix-didnt-take-2026-07-28.md)
- Predecessor (5.0.3 no-op fix): [`prod-rel-5.0.3-handoff.md`](prod-rel-5.0.3-handoff.md)
- Original pie-chart fix (also regressed): [`prod-rel-4.1.56-handoff.md`](prod-rel-4.1.56-handoff.md)
