# prod-rel-4.1.42 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.42` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.41` (v1.17.61).
**Bundles:** v1.17.62 — three pteam tickets, two P1.

## TL;DR

1. **Email logo renders in browser-based webmail (P1).** Post-4.1.41 the gradient + tagline + CTA all rendered correctly but the logo was still a broken-image placeholder in **every** browser-based webmail client (Outlook web, Gmail web, Yahoo Mail). Root cause: Next.js was setting `Cross-Origin-Resource-Policy: same-origin` on every static path, including `/images/*`. When webmail's image proxy fetched the logo and tried to render it back in the email-client's page DOM, the browser enforced CORP and blocked the render. Two coordinated fixes: (a) **inline the email logo as a base64 data URI** in every template so the remote fetch is eliminated entirely; (b) **loosen CORP to `cross-origin`** on `/images/*` and `/_next/static/*` paths via a second header block in `next.config.mjs`. Either fix alone would have solved the webmail render, but inlining is the bulletproof fix that survives corporate image-block proxies + metered connections too. Logo asset is at the same path it's always been, still works as a direct URL.

2. **KOL Profile drill-down no longer leaks internal Bio-Exec nominators (P1).** `getKolProfile` was treating `excludeInternalEmails` as an opt-in query-string parameter the FE never sent → tenant-level "Exclude internal emails" toggle was being silently ignored on every KOL profile, on every dashboard. Sun Pharma → Paul Karpecki was the surfaced repro (Charisza Lastimosa, `charisza@bio-exec.com`, appearing as a nominator despite all 4 Sun campaigns having the flag on). Fix: derive `excludeInternalEmails` from `campaigns.some((c) => c.excludeInternalEmails)` inside the service — the canonical pattern already used by `getSummary` / `getDemographics` / `getKolNominationMetadata`. Also dropped the dead `_excludeInternalEmails` param from `getLeaderRankings` (Leader Rankings reads from precomputed `HcpAnalysisScore` which was already filtered during recalc).

3. **WTD score table — "Nominators" relabeled to "Nominations".** Each row in the KOL Profile drill-down table is one nomination event (nominator + nomination type + campaign). A single nominator who nominates an HCP for 3 different types produces 3 rows. The previous "Nominators" wording made it look like 3 separate people. User-visible labels only (card title, description, live-count label, export sheet name + filename). Internal variable names (`sortedNominators`, etc.) unchanged.

## Behavior change to flag (item 2)

| Tenant | Pre-fix Karpecki nominator count visible | Post-fix |
|---|---|---|
| Sun Pharma | N (includes 4 `@bio-exec.com`) | N − 4 |
| B+L | similar drop for any internal nominators on their analyses | same shape |
| Bio-Exec own dashboards | unchanged (campaigns have `excludeInternalEmails=false`) | unchanged |

**Customers may notice the dip and ask** — it's the intended fix: campaign-level "Exclude internal" was being silently ignored on the KOL Profile drill-down. The underlying DB rows aren't touched. Worth a heads-up to anyone watching the Sun Pharma or B+L dashboards today.

## What changes for customers

### Item 1 — Email logo on webmail
| Surface | Pre-fix | Post-fix |
|---|---|---|
| Outlook web, Gmail web, Yahoo Mail web | broken-image placeholder where the logo should sit | inline data-URI logo renders inside the 144×36 box, no remote fetch, no CORP enforcement |
| Outlook desktop, Apple Mail, mobile mail | already worked (don't enforce CORP) | byte-identical |
| Email body size | ~unchanged at ~30 KB | ~+6.6 KB (base64-encoded logo) — well under spam-filter thresholds |
| `/images/logo-white.png` served as a URL | CORP=same-origin (broken cross-origin embeds) | CORP=cross-origin (embeddable anywhere) |

### Item 2 — Internal nominator leak
See behavior-change table above.

### Item 3 — KOL Profile nominations label
- Card title "Nominators" → "Nominations"
- Description "Showing N of M nominators" → "Showing N of M nominations"
- Live filter count "N nominators match" → "N nominations match"
- Excel export filename `<kol>-nominators.xlsx` → `<kol>-nominations.xlsx`; sheet name `Nominators` → `Nominations`

## API changes

- `GET /insights/:da/kol-profile/:hcpId` — `excludeInternalEmails` query param is now **ignored**; semantics derived from campaign config. Old callers passing it see no error, no effect. FE never sent it.
- `GET /insights/:da/leader-rankings` — same: `excludeInternalEmails` query param now ignored (was already a no-op on the service side — Leader Rankings reads from precomputed scores).
- No other request/response contracts change.

## Migrations

**None.** Code-only.

## Risk

**Low.**

- Item 1: email-HTML edit + one Next.js header-config addition. CORP loosening only widens what's already publicly fetchable as bytes. Inline data URI is the same pattern v1.17.60 already uses for client-uploaded logos.
- Item 2: pure server-side filter widening. Less data in the response when the tenant has the toggle on; no new data exposed.
- Item 3: cosmetic UI relabel.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.62 |
| `curl -sI /images/logo-white.png` | will verify `cross-origin-resource-policy: cross-origin` post-deploy |
| Inline data URI rendering | confirmed locally — same 144×36 box, sharper at retina |

## Rollback

Redeploy `prod-rel-4.1.41` (v1.17.61). Effects:
- Webmail recipients see broken-image placeholders again.
- Internal Bio-Exec staff reappear as nominators on Sun Pharma + B+L KOL Profiles.
- WTD table reverts to "Nominators" label.

No data destruction.

## Manual soak

1. **Webmail logo render**:
   - Send a fresh welcome invite to an Outlook.com / Gmail / Yahoo Mail recipient.
   - Open in the **web** client (browser). Confirm the KOL360 logo renders inside the green header band — no broken-image placeholder, no "click to download images" step required.
   - Cross-check `curl -sI https://kol360.bio-exec.com/images/logo-white.png | grep cross-origin-resource` → returns `cross-origin`.
2. **Internal-nominator filter**:
   - Sun Pharma → Dry Eye → Paul Karpecki KOL Profile → Nominators table.
   - Confirm **no `@bio-exec.com` email addresses** in the table.
   - SQL spot-check (via prod tunnel) that the underlying nominations are still in the DB — only filtered out at the API layer.
3. **WTD table label**:
   - Any KOL Profile drill-down. Card title reads "Nominations" (was "Nominators").
   - Export Excel — filename ends `-nominations.xlsx`.

## See also

- Soak checks: [`prod-rel-4.1.42-soak-checks.md`](prod-rel-4.1.42-soak-checks.md)
- Predecessor: [`prod-rel-4.1.41-handoff.md`](prod-rel-4.1.41-handoff.md)
- Source tickets:
  - [`docs/findings/email-logo-corp-blocks-webmail-render-2026-06-23.md`](../docs/findings/email-logo-corp-blocks-webmail-render-2026-06-23.md)
  - [`docs/findings/kol-profile-ignores-exclude-internal-flag-2026-06-23.md`](../docs/findings/kol-profile-ignores-exclude-internal-flag-2026-06-23.md)
  - WTD relabel — informal pteam request 2026-06-23
