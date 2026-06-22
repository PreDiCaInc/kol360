# prod-rel-4.1.40 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.40` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.39` (v1.17.59).
**Bundles:** v1.17.60 — two pteam tickets + one held-back e2e fixup.

## TL;DR

1. **Email templates — Outlook gradient + logo fallback (P1).** Six gradient sites across welcome / survey-invite / survey-reminder now declare a solid `background-color: #147a6d` BEFORE the `linear-gradient`. Outlook (which drops gradients silently) lands on the solid; modern clients still see the gradient (CSS cascade — last declaration wins). All three logo `<img>` tags now ship with HTML `width="144" height="36"` attrs + `object-fit: contain`, `border: 0`, centered `display: block; margin: auto` — Outlook reserves the right box even when the remote image is blocked. Customer-visible: previously every Outlook recipient since v1.17.48 saw an invisible tagline + an invisible CTA + a broken-image placeholder; now they see solid green + visible button text + a properly-sized image (or sized alt-text placeholder).

2. **Client edit + detail — logo upload + 20KB cap + full settings inline (P2).** Client form dialog gains an Upload | Paste URL tab pair on the Logo field. Upload reads the picked file via `FileReader.readAsDataURL`, enforces a 20 KB binary cap client-side, stores the data URI directly in `client.logoUrl` (no S3 infra — the data URI is short enough to live inline in the row). Zod schema (`packages/shared`) accepts both `http(s)` URLs and `data:image/*` URIs with a 32 KB string cap. Live preview renders whatever's in the field, with an `onError` handler that surfaces a "failed to load" warning. Client detail page (`/admin/clients/[id]`) now shows Logo (with preview), Allowed Email Domains (Badge chips with destructive "None — only @bio-exec.com staff can be invited" when empty, reflecting the actual v1.17.19 behavior) inline — no need to open the Edit dialog to read these.

3. **Users page — resend invite + delete (P2 follow-up).** Two new endpoints: `POST /users/:id/resend-invite` (rotates the Cognito temp password via `AdminSetUserPasswordCommand` and re-sends the branded invite via SES; only valid for PENDING_VERIFICATION, returns 400 INVALID_STATE otherwise) and `DELETE /users/:id` (hard delete in Cognito + DB; self-delete blocked at the route layer via `cognitoSub` match). Users page dropdown gets Resend Invite (PENDING only) and Delete (always, two-step confirm because hard-delete is destructive + irreversible). Disable + Enable + Approve already existed.

4. **E2E — PARTIAL_UPDATE_HCP fixture.** Held-back hygiene fix from the 4.1.39 cycle. Mirrors the v1.17.57 PARITY fix: dedicated HCP for the hcp-import-partial-update test (`PARTIAL_UPDATE_HCP_*` in `STABLE_FIXTURE`) so concurrent full-row writes from other test files no longer clobber the partial-update's read-back.

## What changes for customers

### Item 1 — Email rendering in Outlook
| Surface | Before (4.1.39) | After (4.1.40) |
|---|---|---|
| Welcome invite — Outlook | invisible header tagline + blank CTA pill + broken-image logo | solid green header + visible "Sign In to KOL360" button + alt-text-sized image placeholder if blocked, real logo otherwise |
| Survey invitation — Outlook | same broken pattern | solid green + visible "Start Survey" |
| Survey reminder — Outlook | same broken pattern | solid green + visible "Complete Survey Now" |
| Non-Outlook clients (Gmail / Apple Mail / Yahoo / mobile) | gradient renders correctly | byte-identical render — `background-color` is shadowed by the gradient per CSS cascade |

### Item 2 — Client onboarding UX
| Surface | Before | After |
|---|---|---|
| Client edit dialog → Logo | text input only; admin must host the image somewhere and paste a URL | Upload | Paste URL tabs; Upload accepts PNG/JPG/SVG up to 20 KB and embeds the bytes as a `data:image/*` URI; both paths show a live preview with an `onError` warning |
| Client detail page | shows Type, Status, Lite toggle, Brand Color | also shows Logo (with preview), Allowed Email Domains (Badge chips + destructive empty-state warning) |

### Item 3 — User admin
| Surface | Before | After |
|---|---|---|
| Users dropdown for PENDING users | Approve, Edit | Approve, Resend Invite, Edit, Delete |
| Users dropdown for ACTIVE users | Edit, Disable | Edit, Disable, Delete |
| Users dropdown for DISABLED users | Edit, Enable | Edit, Enable, Delete |

Delete prompts twice; only the second confirm fires the irreversible Cognito + DB delete. Self-delete blocked by route.

## API changes

- **New:** `POST /api/v1/users/:id/resend-invite` → 200 `{success: true}` | 400 INVALID_STATE | 404 | 403
- **New:** `DELETE /api/v1/users/:id` → 204 | 400 (self-delete) | 404 | 403
- **Extended:** Zod `logoUrlSchema` now accepts `data:image/*` URIs with a 32 KB character cap (in addition to `http(s)`).
- No other request/response contracts change.

## Migrations

**None.** Code-only.

## Risk

**Low.**

- Item 1: pure HTML edits. Non-Outlook clients are byte-identical. Reverting is a 3-line revert.
- Item 2: FE upload UI + Zod schema extension + page render extension. Existing http(s) `logoUrl` values continue to work. The 20 KB cap is enforced at TWO layers (FE + schema) but the existing http(s) path isn't size-capped.
- Item 3: two new endpoints, both gated behind `requirePlatformAdmin`. Self-delete guard prevents the obvious foot-gun. Cognito delete failures are logged and don't roll back the DB delete (graceful — keeps the row from getting orphaned).
- Item 4: test-only.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.60 |
| Shared schema unit tests | 20/20 pass |
| 4 new e2e tests for resend-invite + delete (structural-rejection paths) | will run post-deploy via `tdct` |

## Rollback

Redeploy `prod-rel-4.1.39` (v1.17.59). Effects:
- Outlook recipients see broken emails again.
- Client edit dialog reverts to URL-only logo field; detail page hides Logo + Allowed Email Domains rows.
- Resend Invite + Delete dropdown items disappear. Users created during the 4.1.40 window stay; they're standard Cognito + DB rows.

No data destruction.

## Manual soak

1. **Outlook check** (item 1):
   - Trigger a welcome invite to a free Outlook.com account (or any account that uses Outlook web).
   - Confirm the header is solid green, the tagline is visible, the "Sign In" CTA is a solid green pill with visible text.
   - Click "Download pictures" — confirm the KOL360 logo lands inside the 144×36 box.
   - If a customer's specific Outlook still flags broken render: check that nothing CSP-strips inline `<style>` or rewrites the `<img>` tag.

2. **Logo upload** (item 2):
   - Edit a test client → Logo tab → Upload. Pick a PNG > 20 KB → expect inline error pointing at tinypng.com.
   - Pick a PNG < 20 KB → expect immediate live preview.
   - Save → reopen detail page → preview still shows.

3. **Resend invite** (item 3):
   - Invite a brand new test user. Wait 60s. Confirm welcome email arrived.
   - Users page → dropdown → Resend Invite. Expect "Invitation resent to ..." alert.
   - Confirm a second welcome email arrived with a NEW temp password (the old one will no longer work).
   - Try Resend Invite on an ACTIVE user → expect inline error "Resend invite only valid for users in PENDING_VERIFICATION state".

4. **Delete user** (item 3):
   - Same test user. Users page → dropdown → Delete. Confirm twice. Expect row to disappear.
   - Try to sign in with that user → expect "user not found" from Cognito.
   - Try to delete your own account from the dropdown → expect "Cannot delete your own account".

## See also

- Soak checks: [`prod-rel-4.1.40-soak-checks.md`](prod-rel-4.1.40-soak-checks.md)
- Predecessor: [`prod-rel-4.1.39-handoff.md`](prod-rel-4.1.39-handoff.md)
- Source tickets:
  - [`docs/findings/email-templates-outlook-gradient-fallback-2026-06-22.md`](../docs/findings/email-templates-outlook-gradient-fallback-2026-06-22.md)
  - [`docs/findings/client-edit-page-logo-preview-and-full-settings-2026-06-22.md`](../docs/findings/client-edit-page-logo-preview-and-full-settings-2026-06-22.md)
  - [`docs/findings/e2e-hcp-import-partial-update-fixture-race-2026-06-22.md`](../docs/findings/e2e-hcp-import-partial-update-fixture-race-2026-06-22.md)
