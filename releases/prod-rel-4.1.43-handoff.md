# prod-rel-4.1.43 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.43` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.42` (v1.17.62).
**Bundles:** v1.17.63 — Insights Use Cases guide (P2 customer enablement) + four tooling-only commits already on dev (no behavioral impact).

## TL;DR

**Insights Use Cases guide is now in-product.** Client admins can read 5 worked case studies + 4 practice scenarios without leaving the dashboard. The same content the pteam case-study doc covered (organizing a doctor dinner, picking a SECO speaker, building an advisory board, etc.) renders inline as a right-side drawer + as a bookmarkable standalone page. Per-tab `?` info popovers give a one-line orientation + a deep-link into the matching case study. Brand-neutral — the "Sun Pharma" branding from the source doc is dropped in-product, so every tenant sees the same canonical "Insights — Use Cases" guide.

## What changes for customers

| Surface | Before (4.1.42) | After (4.1.43) |
|---|---|---|
| Insights dashboard header | Client + Disease Area selectors only | Adds a **Use Cases** button (rightmost). Click → drawer opens with the full guide. |
| First-time admin landing on `/admin/dashboards/[id]` | Lands directly on Introduction tab | Drawer auto-opens once; dismissible. Subsequent visits don't re-pop. State lives in browser `localStorage` per device. |
| Each Insights tab (Demographics, Benchmarking, Sociometric Leaders, Total Weighted Score) | Tab label only | Adds a small `?` icon next to the label. Click → popover with a one-line orientation + bullet list + deep-links into the relevant case studies. |
| Bookmarkable URL | n/a | `/admin/dashboards/guide` renders the same content as a standalone page (for sharing, printing, or opening in a separate window while the dashboard stays focused). |

Existing Introduction tab is **unchanged** — kept in place so the rollout doesn't disturb the dashboard layout users are already used to. The ticket flagged "don't use a tab for the intro" as the *new* direction, but didn't ask for the existing tab to be removed; that's a separate behavioral call worth taking deliberately.

## Content

5 case studies + 4 practice scenarios, all rebranded as generic (no Sun Pharma references in-product):

1. Organizing a Doctor Dinner in Florida (Benchmarking → KOL Profile)
2. SECO Dinner — Discussion and Advice Leaders (Benchmarking)
3. SECO Dinner — Identifying Rising Stars (Sociometric Leaders)
4. NY/NJ Symposium — Main Stage Speaker Selection (Sociometric Leaders + Benchmarking)
5. Combining Trade Publication Visibility + National Leader Status (Total Weighted Score)

Plus 4 "Try It Yourself" practice scenarios at the end (TX Optometric dinner, National webinar, CA formulary win, AAOpt advisory board).

Source content (`docs/Sun Pharma - Case Study.docx`) is **NOT** in the repo (the `docs/` folder is gitignored). The 12 screenshots embedded in the docx were extracted and committed under [`apps/web/public/help/insights-guide/`](apps/web/public/help/insights-guide/) (~3.9 MB total). Markdown text content lives as a typed TypeScript module at [`apps/web/src/content/insights-guide/guide-content.ts`](apps/web/src/content/insights-guide/guide-content.ts) — to update the guide, edit that file (and any swapped screenshots) and ship in the normal release cycle. No CMS, no DB schema, no markdown library dependency added.

## Implementation surfaces

- New: [`apps/web/src/components/ui/sheet.tsx`](apps/web/src/components/ui/sheet.tsx) — right-aligned side-drawer primitive using the same Radix Dialog backend Dialog uses.
- New: [`apps/web/src/components/insights/insights-guide-content.tsx`](apps/web/src/components/insights/insights-guide-content.tsx) — renders the structured guide data. Shared between the standalone page and the drawer.
- New: [`apps/web/src/components/insights/insights-guide-drawer.tsx`](apps/web/src/components/insights/insights-guide-drawer.tsx) — drawer wrapper + `useInsightsGuideAutoOpen()` hook for first-visit pop.
- New: [`apps/web/src/components/insights/tab-help-popover.tsx`](apps/web/src/components/insights/tab-help-popover.tsx) — `?` icon button + Radix Popover with per-tab help content.
- New: [`apps/web/src/app/admin/dashboards/guide/page.tsx`](apps/web/src/app/admin/dashboards/guide/page.tsx) — standalone route.
- Modified: [`apps/web/src/components/insights/insights-dashboard.tsx`](apps/web/src/components/insights/insights-dashboard.tsx) — Use Cases button, per-tab popovers, drawer mount.

Also folded into this release (no behavioral impact, were sitting on dev):
- `scripts/sync-hcps-from-prod.ts` + `scripts/sync-segment-scores-from-prod.ts` — pteam-requested tooling to sync prod HCPs + segment scores into test DB. Hardcoded URLs + runtime IP pin (no env-var override; refuses to write to prod under any circumstance).

## API changes

**None.**

## Migrations

**None.**

## Risk

**Low.** Pure additive UI. New components, new route, no shared-state impact. No data path changed. If the auto-open is annoying, dismissal records permanently (no server round trip).

Rollback: redeploy 4.1.42 (v1.17.62). The Use Cases button disappears; per-tab `?` popovers disappear; auto-open stops firing. The new route 404s. Browsers that already wrote the `kol360.insightsGuideSeenAt` localStorage flag keep it — harmless.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.63 |
| `/admin/dashboards/guide` route registered | confirmed in Next.js build output |
| 12 screenshot assets ship under `/help/insights-guide/` | confirmed |

## Rollback

Redeploy `prod-rel-4.1.42` (v1.17.62). Use Cases button, drawer, popovers, route all disappear. No data destruction; localStorage flags persist harmlessly.

## Manual soak

1. **First-visit auto-open** — open a private/incognito window. Sign in. Go to `/admin/dashboards/[id]`. The Use Cases drawer should auto-open once. Click the X to dismiss. Reload — drawer should NOT re-open. Verify `localStorage.getItem('kol360.insightsGuideSeenAt')` returns a timestamp.
2. **Use Cases button** — click the Use Cases button in the header. Drawer opens to the top of the guide.
3. **Open full page** — click the "Open full page" link in the drawer header. New tab opens with `/admin/dashboards/guide`.
4. **Per-tab `?` popovers** — click the `?` next to each tab label (Demographics, Benchmarking, Sociometric Leaders, Total Weighted Score). Each shows tab-specific orientation + a "See case studies" deep-link section. Click a case-study link — drawer opens scrolled to that case.
5. **Cross-client** — verify the guide is visible for a CLIENT_ADMIN (not just PLATFORM_ADMIN) and for Bio-Exec lite client.

## Open follow-up (NOT in this release)

The existing "Introduction" tab on the Insights dashboard was kept in place for this rollout. The ticket's Option A rejection ("don't put it in a tab") was about avoiding a NEW intro tab, but implicitly suggests removing the existing one too. Worth a follow-up to decide whether to fold the existing Introduction content into the guide (or drop it entirely) once customers have used the new surface for a release or two.

## See also

- Soak checks: [`prod-rel-4.1.43-soak-checks.md`](prod-rel-4.1.43-soak-checks.md)
- Predecessor: [`prod-rel-4.1.42-handoff.md`](prod-rel-4.1.42-handoff.md)
- Source ticket: [`docs/findings/insights-use-case-guide-presentation-2026-06-24.md`](../docs/findings/insights-use-case-guide-presentation-2026-06-24.md)
- Source content: `docs/Sun Pharma - Case Study.docx` + `.txt` (not in repo — pteam-local)
