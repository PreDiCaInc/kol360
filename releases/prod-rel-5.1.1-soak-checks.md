# prod-rel-5.1.1 — Soak Checks (v2.1.1)

Test-infra only patch. Trimmed soak — no customer runtime path changed, no API surface changed, no schema changed.

---

## Phase A — Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: {"status":"ok","version":"2.1.1", ... }
```

App Runner auto-deploys from `main`. If `/health` still shows 2.1.0 after ~10 min, trigger a manual deploy.

---

## Phase B — Failing web tests either pass, or fail with a helper-scoped error

Run the two specs against prod:

```bash
cd e2e
pnpm --filter @kol360/e2e exec playwright test insights-demographics-pie tour
```

**Two acceptable outcomes:**

1. **Tests PASS** — the client-picker helper now completes on prod (options render + selection takes). We know the v2.1.0 helper rewrite plus this v2.1.1 error-surfacing fix combined to close the whole failure class.
2. **Tests FAIL with `Error: ensureClientSelected: client-picker options never became visible — …`** OR **`Error: ensureClientSelected: post-select tablist never appeared — …`** — the helper is still broken on prod, but now the failure names itself so we can diagnose from the error message alone (no more phantom "tab missing" chases).

**Unacceptable outcome:** tests fail with `getByRole('tab', {name:/demographics/i})` timeout OR `getByRole('button', {name:/how to/i})` timeout — this would mean the swallow removal didn't take (verify the deployed test files match the merged branch).

Any Phase B failure that surfaces a helper-scoped error is a **valuable signal** for the next patch, not a rollback trigger.

---

## Phase C — Brand-grid tests pass on prod against hermetic fixture

```bash
cd e2e
pnpm --filter @kol360/e2e exec vitest run brand-grid-survey-submit brand-grid-question-toggle
```

**Expected:** both test files green. First run creates a `cme2e0stable0quest0001` Question row via `prisma.question.upsert` in `beforeAll`. Subsequent runs are idempotent no-ops (update: `{minEntries: null}` re-asserts on every run).

**If prod DB already has a `cme2e0stable0quest0001` Question row from a prior test run**, the upsert's `update: { minEntries: null }` clause re-asserts the test-friendly value. Safe.

**If the row exists with drifted `nominationType` or `type`**, the upsert's `update` clause leaves those alone — only `minEntries` is enforced. If a future admin edit changes those to values the test can't handle, the test will surface it clearly (rather than the misleading 400 that the v2.1.0 version threw).

---

## Phase D — Sanity check: no other side effects

The changed files are all under `e2e/`. Nothing in `apps/api/src/`, `apps/web/src/`, or `packages/shared/src/` was touched. Verify the diff on `main`:

```bash
git diff prod-rel-5.1.0..prod-rel-5.1.1 --stat
# Expected: only e2e/ + releases/ + 3 package.json version-string edits
```

---

## Rollback gate

Roll back if any of the following:

- **A** — `/health` doesn't return 2.1.1 within the deploy window (App Runner issue; check CloudWatch, revert the tag if needed).
- **D** — the diff shows unexpected non-e2e files. That would mean a bad merge or the wrong PR shipped.

Phase B failures with helper-scoped errors are NOT rollback triggers — they're diagnostic value. Phase C failures against the fixture are NOT rollback triggers unless the failure is a Prisma constraint error (which would suggest the upsert itself is broken).

**Rollback shape:** revert PR — no schema to unwind, no data migration to undo. The only DB state introduced is one `Question` row with id `cme2e0stable0quest0001`; leaving it in place is harmless (it's namespaced under the `cme2e0stable0` fixture prefix and doesn't collide with real customer Questions).

---

## See also

- Handoff: [`prod-rel-5.1.1-handoff.md`](prod-rel-5.1.1-handoff.md)
- Source doc: [`docs/findings/5.1.0-post-soak-two-e2e-fragility-items-2026-08-02.md`](../docs/findings/5.1.0-post-soak-two-e2e-fragility-items-2026-08-02.md)
