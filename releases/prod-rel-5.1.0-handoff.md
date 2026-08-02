# prod-rel-5.1.0 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Fully reversible via PR revert.
**Tag:** `prod-rel-5.1.0` — anchor at the merge commit on `main`.
**Supersedes:** `prod-rel-5.0.5` (v2.0.5).
**Bundles:** v2.0.5 → v2.1.0 — 5 follow-up items outstanding through 2+ release cycles, cleared in one bundle (2 pteam-flagged from 5.0.4/5.0.5 soak, 3 dev-side deferrals). **Minor bump** (2.0.5 → **2.1.0**, not patch) — scope justifies it: FE + BE + e2e surfaces all touched.

**One-liner:** TabHelpPopover no longer nests `<button>` inside `<button>` (kills the tab-bar hydration bailout pteam pinned as the pie/bar chart re-render race root cause); `ensureClientSelected()` e2e helper actually completes on prod; TEAM_MEMBER users don't 403 on `/clients`; break-glass single-invitation route is now PLATFORM_ADMIN-gated + emits a distinct audit action; `export.service.ts` payment-import parse boundary uses the v2.0.5 `cellText()` helper.

---

## On pull, run

**Nothing to reinstall. TS-only + one new e2e test file. Just `git pull`.**

Zero `package.json` dep edits, zero `pnpm-lock.yaml` movement, zero pretest-hook changes. The edits are:

1. FE — `apps/web/src/components/insights/tab-help-popover.tsx` (revert to plain `<button>`, no more nested-button gymnastics needed after the parent refactor).
2. FE — `apps/web/src/components/insights/insights-dashboard.tsx` (wrap each `(TabsTrigger, TabHelpPopover)` pair in a `relative flex` div; popover absolute-positioned as a **sibling** of the tab button, not a child).
3. FE — `apps/web/src/hooks/use-clients.ts` + `apps/web/src/components/insights/insights-dashboard.tsx` + `apps/web/src/components/layout/user-menu.tsx` (add `enabled` gate to `useClients`; skip the fetch for non-PLATFORM_ADMIN callers).
4. E2E — `e2e/web/insights-demographics-pie.spec.ts` + `e2e/web/tour.spec.ts` (rewrite `ensureClientSelected()` to wait on DOM state instead of blind `waitForTimeout`s).
5. BE — `apps/api/src/routes/distribution.ts` (add per-route `requirePlatformAdmin()` preHandler on the break-glass route + rename audit action to `distribution.invitation_break_glass_send` + response now carries `breakGlass: true`).
6. BE — `apps/api/src/services/export.service.ts` (import + apply `cellText()` at the 4 parse-boundary sites the v2.0.5 hygiene sweep called out).
7. Tests — `apps/api/src/utils/excel.test.ts` extended (18 → 32 tests) covering payment-import column shapes.
8. Tests — new `e2e/api/distribution-break-glass-send.test.ts` covering the break-glass route (3 tests: happy path, missing-HCP 400, impersonation path).
9. Three `package.json` version-string bumps (2.0.5 → **2.1.0** — minor bump).
10. This handoff + soak-checks doc + README row.

Skip `pnpm install`, skip `npx playwright install`, skip `npx prisma generate`.

---

## TL;DR (per ticket)

### 1. TabHelpPopover nested-`<button>` hydration fix (highest care)

**File:** `apps/web/src/components/insights/tab-help-popover.tsx`, `apps/web/src/components/insights/insights-dashboard.tsx:421-471`.

**Root cause.** `<TabHelpPopover>` renders a `<button>` (Radix `PopoverTrigger asChild` + `<button>` child). It was rendered as a child of `<TabsTrigger>` (which Radix renders as `<button role="tab">`). A `<button>` inside a `<button>` is invalid HTML → React 18 hydration bailout on the whole tab bar. Pteam's late-day 2026-07-28 diagnostic ([finding link]) argued this is the underlying cause of the pie-chart re-render race (fixed in prod-rel-5.0.3 / 5.0.4 via a `ResizeObserver` remount hack) and likely the `-1/-1` bar chart warnings — the root cause was hydration failing on the tabs subtree, not the chart primitives themselves.

**Fix picked (option (a) — sibling placement).** `TabsList` renders the 5 tabs in a `grid grid-cols-5` layout. For each tab that carries a help popover, we now wrap the `TabsTrigger` and `TabHelpPopover` in a plain `<div className="relative flex">`. The `TabsTrigger` gets `w-full pr-7` so the label leaves room for the icon; the `TabHelpPopover` is absolutely positioned at `right-1 top-1/2 -translate-y-1/2 z-10` so it visually sits inside the tab's right edge but is DOM-adjacent to (not nested inside) the tab button. `TabHelpPopover` itself is back to a clean `<button>` trigger — no more `<span role="button">` gymnastics needed.

**Rejected options:** (b) Radix `asChild` on the outer `TabsTrigger` mixed the tab-activation onto the popover trigger (any click on ? would ALSO activate the tab); (c) `<span role="button" tabIndex={0}>` with manual keyboard handling worked for hydration but the click still activated the underlying tab via Radix's `activationMode="automatic"` focus behavior — the FIRST take at this fix landed there and failed the visual verify's "click ? doesn't activate tab" assertion.

**Visual verify (mandatory per `feedback_visual_verify_ui_fixes`).**
Local dev stack (:3000 web, :3001 API, :5432 test-DB tunnel), signed in as `e2e.testuser@bio-exec.com` (PLATFORM_ADMIN), on `/admin/dashboards/cmj6ice860000wspd6wotdndy?clientId=cmmjq5hbl00jevqf87olee6yb` (Sun Pharma / Dry Eye — 77+ real respondents, 1,382 nominations, so tabs actually render past the empty-state gate). Playwright-driven regression assertions verified:
- **0 nested `<button>` inside `<button>` anywhere in the DOM** (down from 4 — one per popover-carrying tab).
- Tab bar renders all 5 tabs; each of the 4 non-Introduction tabs shows its ? help icon on the right side of the tab.
- Clicking the ? help icon opens the popover (Radix portal renders with the correct case-studies content).
- Active tab **stays** Introduction after clicking the Demographics ? — the popover click no longer bubbles up to activate the tab.
- **0 hydration warnings captured on the browser console** during dashboard load.

Screenshots: `scratchpad/v2.1.0-tab-bar.png` (tab bar with all 4 ? icons visible) + `scratchpad/v2.1.0-popover-open.png` (open popover on Sun Pharma / Dry Eye, active tab is Introduction with correct Demographics popover content visible).

### 2. `ensureClientSelected()` e2e helper — combobox opens but no selection completes

**Files:** `e2e/web/insights-demographics-pie.spec.ts` + `e2e/web/tour.spec.ts` (identical helper mirrored in both).

**Symptom (pteam-reported).** The helper opened the client combobox on prod but the first-option click never landed — downstream regression guards (like the pie-chart-first-paint assertion) never ran because the dashboard sat on the "Select a client" empty state.

**Root cause.** Prior helper used `waitForTimeout(300)` after `trigger.click()` and `waitForTimeout(600)` after `firstOption.click()`. On prod the client list is much larger than test (dozens of clients vs. 1), the Radix Select portal takes longer to mount, and the `useClients()` fetch itself is slower over the internet — 300ms was often not enough for the option to be visible in the portal at click time, so the first-option click landed on an empty query result.

**Fix.** Replace both blind `waitForTimeout` calls with explicit DOM-state gates:
- After `trigger.click()`: `firstOption.waitFor({ state: 'visible', timeout: 5000 })` — wait for the portal option to actually paint before clicking it.
- After `firstOption.click()`: `page.getByRole('tablist').first().waitFor({ state: 'visible', timeout: 8000 })` — the "Select a client" empty state renders NO tabs; the post-select dashboard renders a `role="tablist"`, so waiting on it proves the selection took.

Both waits carry `.catch(() => {})` so timeouts fall through silently and downstream `expect()` assertions surface the real failure with a clearer message.

### 3. `/clients` 403 for TEAM_MEMBER users

**Files:** `apps/web/src/hooks/use-clients.ts`, `apps/web/src/components/insights/insights-dashboard.tsx`, `apps/web/src/components/layout/user-menu.tsx`.

**Symptom.** The FE fires `GET /api/v1/clients?includeInactive=false` on Insights Dashboard load and on the user-menu render. `GET /clients` is `requirePlatformAdmin()`-gated at the API — TEAM_MEMBER + CLIENT_ADMIN callers get 403. Console noise, wasted request, red devtools-network row.

**Fix (FE side — smaller blast radius than opening `/clients` to non-admins).** Added an `enabled` param to `useClients(includeInactive, enabled)`, defaulting to `true` (existing PLATFORM_ADMIN-only pages — `admin/clients`, `admin/users`, `admin/campaigns`, `admin/kol-analysis`, user edit/invite dialogs — unchanged). Two callers that render for non-PLATFORM_ADMIN users now gate on role:
- `insights-dashboard.tsx` — client picker only renders for PLATFORM_ADMIN anyway; hook now `useClients(false, isPlatformAdmin)`.
- `layout/user-menu.tsx` — client-impersonation submenu is PLATFORM_ADMIN-only; hook now `useClients(false, isPlatformAdmin)`.

**Alternative rejected:** widening the BE `/clients` route to return the caller's single tenant Client for TEAM_MEMBER. Larger surface (also affects the impersonation flow, /clients/me semantics, and audit-log entity resolution) for a symptom that's purely FE-side noise.

### 4a. Wire the `POST /distribution/:hcpId/send` break-glass route

**File:** `apps/api/src/routes/distribution.ts:432-491`.

**Context.** Pteam v2.0.5 handoff noted this route as "un-wired follow-up" — the handler exists at the file level but had zero web callers, no PLATFORM_ADMIN gate, and its audit-log action was indistinguishable from the bulk `distribution.invitations_sent` event.

**Fix.**
- Added `{ preHandler: [requirePlatformAdmin()] }` on the route as **defense-in-depth** on top of the file-level `gateWritesToAdmins()`. Break-glass is PLATFORM_ADMIN-only; a future middleware refactor can't quietly widen access.
- Audit action renamed to `distribution.invitation_break_glass_send` with `newValues.reason: 'break_glass_cooldown_bypass'`. `entityId` stays `${campaignId}:${hcpId}` (matching the pre-v2.1.0 shape) so history for a given (campaign, HCP) pair stays greppable across both action names.
- Response body now carries `breakGlass: true` in addition to `success` + `messageId`. Callers can distinguish this from the pre-v2.1.0 generic single-send shape.

**Why this works as a cooldown-bypass without an explicit `overrideCooldown` flag.** The route calls `distributionService.sendSingleInvitation` → `EmailService.sendSurveyInvitation` directly. The 12-month same-DA cooldown lives ONLY in `EmailService.sendBulkInvitations` (`email.service.ts:938`) — single-send never touches `recentlySurveyedHcpIds`. So the "bypass" is structural, not conditional; the route is naturally cooldown-free by construction.

**NOT deployed here (Part 2 — post-deploy runbook step in soak-checks Phase E).** The four orphan `SurveyResponse status='RECENTLY_SURVEYED'` rows written for jboyd / jpikor on 2026-07-30 (documented in the v2.0.5 handoff as "safe to leave") — cleanup SQL is documented in `prod-rel-5.1.0-soak-checks.md` Phase E for pteam to run at their convenience.

### 5. `export.service.ts` cellText hygiene sweep

**File:** `apps/api/src/services/export.service.ts` lines ~617/675/678/690.

**Context.** The v2.0.5 XLSX hyperlink-silent-drop fix left `export.service.ts` payment-status import untouched to keep the diff surgical. Same class of `cell.value` binding pattern that caused the P2 bug lived at 4 sites in this file (header parse + payment-ID + NPI + status). Lower risk than the HCP import (payment IDs / NPIs less likely to be Excel-auto-hyperlinked), but same class of bug — worth closing.

**Fix.** Import `cellText` from `apps/api/src/utils/excel.ts` (already exists from v2.0.5) and swap the 4 `cell.value` binds:
- Header row parse — `String(cell.value || '').toLowerCase().trim()` → `(cellText(cell.value) ?? '').toLowerCase().trim()`.
- Payment ID column — `String(row.getCell(paymentIdCol + 1).value || '').trim()` → `cellText(row.getCell(paymentIdCol + 1).value) ?? ''`.
- NPI column — same shape as above.
- Status column — same shape as above, with `.toLowerCase()` moved to the outer call (helper already strips whitespace).

**Test.** Extended `apps/api/src/utils/excel.test.ts` from 18 → 32 tests with a new `describe('payment-status import — column value shapes')` block. Parameterized over the specific shapes the 3 columns care about: plain strings, trimmed whitespace, ExcelJS-hyperlinked cells (defensive — unlikely but proves the class is closed), richText, numeric IDs, empty cells.

---

## Migrations

**None.** Zero schema.

---

## Risk assessment (per fix — honest, not lowballed)

- **#1 (TabHelpPopover) — MEDIUM UI risk, HIGH upside.** Structural DOM change to the top-level insights tab bar. Layout of the ? icon inside the tab shifted from `inline-flex ml-1.5` to `absolute right-1 top-1/2 -translate-y-1/2`. Visual-verified on Sun Pharma / Dry Eye + tab-bar screenshot committed to scratchpad. Downside: the ? icon now overlaps with the tab label if a translation ever exceeds ~14 chars (all current labels fit). The `w-full pr-7` on `TabsTrigger` reserves the icon's real estate, but a very-narrow viewport could crowd. Upside: closes the hydration bailout the tabs subtree has been generating on every page load since v1.17.63, which pteam identified as the LIKELY root cause of the multi-release pie-chart re-render race + `-1/-1` bar chart warnings — meaning the ResizeObserver-remount hack from prod-rel-5.0.3 / 5.0.4 may now be redundant (NOT removed in this PR; left in place as belt-and-suspenders through soak).
- **#2 (ensureClientSelected) — LOW risk, test-only.** Both `.waitFor` calls carry `.catch(() => {})`; timeout falls through to downstream assertions. Worst case if the fix is wrong: same as before (test times out with a slightly different message).
- **#3 (/clients gate) — LOW risk.** One-line hook change with a defaulted param; every existing caller keeps working (`enabled = true`). Two call sites explicitly opt in to the new gate. If either of the two gated call sites was somehow depending on the fetch firing for a non-admin (they aren't — one renders the picker only for PLATFORM_ADMIN, the other renders the impersonation submenu only for PLATFORM_ADMIN), the gate cleanly disables an already-dead code path.
- **#4a (break-glass route) — LOW-MEDIUM risk, NEW ROUTE-BEHAVIOR.** The route existed pre-v2.1.0 (400/404s worked, 200 shape was `{success, messageId}`). Post-v2.1.0: response gains `breakGlass: true`; audit action is renamed. The existing consumer at `e2e/api/full-workflow.test.ts:331` accepts `[200, 400]` and doesn't assert the response shape — still passes. Zero web callers exist today (per pteam's v2.0.5 audit). The new PLATFORM_ADMIN gate is defense-in-depth on top of the file-level `gateWritesToAdmins` — CLIENT_ADMIN previously got 403 from `gateWritesToAdmins`, still gets 403 (from `requirePlatformAdmin`); PLATFORM_ADMIN was allowed by `gateWritesToAdmins`, still allowed. No behavior change for either role — the gate exists so a future refactor that widens `gateWritesToAdmins` back to CLIENT_ADMIN doesn't quietly re-open the break-glass to non-platform staff.
- **#5 (export.service cellText) — LOW risk.** Additive at 4 parse-boundary sites; the CSV path is unaffected (no ExcelJS involvement). Every string cell in every xlsx passes through `cellText()` as a trimmed string — same result as prior `String(cell.value || '').trim()` for the common case. Only the object-shape cases (hyperlink / richText / formula) behave differently, and pre-fix those were the bug. Unit regression net — 14 new parameterized tests over the specific shapes the 3 columns care about.

---

## Test verification

At `v2.1.0` on dev branch:

| Check | Result |
|---|---|
| `pnpm --filter @kol360/shared build` | pass |
| `pnpm --filter @kol360/api build` | pass |
| `pnpm --filter @kol360/web build` | pass |
| `apps/api/src/utils/excel.test.ts` (32 tests, up from 18) | pass |
| Local visual verify for #1 — Sun Pharma / Dry Eye Playwright regression | pass (screenshots captured) |

Formal e2e / soak verification happens post-deploy per `tdct` — see `prod-rel-5.1.0-soak-checks.md`.

---

## Rollback shape

1. Revert the PR on `main` → App Runner auto-redeploys to v2.0.5. No schema state to unwind, no infra state to unwind.
2. **Note on #1:** the ResizeObserver-remount hack shipped in prod-rel-5.0.3 / 5.0.4 is still in place on the pie chart; rollback restores both fixes back to their v2.0.5 state (i.e. the hack keeps the pie working, only the underlying hydration bailout returns). Pie is not the primary rollback risk.
3. **Note on #4a:** the Part 2 DB cleanup of the 4 orphan `RECENTLY_SURVEYED` rows is a SEPARATE post-deploy step documented in soak-checks Phase E. It does NOT ship in this PR. If we roll back v2.1.0 and the DB cleanup has already been applied, the DB stays clean — no reverse-migration needed.

---

## See also

- Soak checks: [`prod-rel-5.1.0-soak-checks.md`](prod-rel-5.1.0-soak-checks.md)
- Predecessor: [`prod-rel-5.0.5-handoff.md`](prod-rel-5.0.5-handoff.md)
- Pteam findings + prior release refs:
  - `docs/findings/insights-use-case-guide-presentation-2026-06-24.md` (original TabHelpPopover ticket)
  - `docs/findings/prod-rel-5.0.2-post-soak-notes-2026-07-26.md` #F1 (`ensureClientSelected` helper origin)
  - `docs/findings/send-cooldown-bioexec-exception-2026-07-30.md` (break-glass follow-up context)
  - `docs/findings/xlsx-import-hyperlink-cells-silently-drop-rows-2026-07-31.md` (cellText helper origin)
