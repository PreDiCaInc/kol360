# .githooks/

Repo-tracked Git hooks. Activated per-clone with:

```bash
git config core.hooksPath .githooks
```

(One-time. Verify with `git config core.hooksPath` → should print `.githooks`.)

## Hooks

### `pre-push`

**Tripwire that blocks pushes to `Bio-Exec/kol360` carrying internal/sensitive paths.**

Fires on every `git push` but only enforces when the destination URL matches
`Bio-Exec/kol360`. Pushes to PreDiCa (or any other remote) are unaffected.

It scans the ref(s) being pushed against the canonical strip manifest:

- Directory prefixes: `func-spec/`, `tech-spec/`, `tmp/`, `creds/`, `csv/`, `sec-scan*`, `docs/`, `.claude/`
- Single files: `tech-spec.zip`
- Extensions: `.csv .log .zip .tar .gz .docx .xlsx .xls .pem .key`
- All `*.md` except top-level `README.md` and `DEPLOYMENT.md`
- Known credential strings (defense-in-depth grep)

Plus a credential-content grep over every blob in the push tree.

If any match → push aborts with a list of the offending paths.

**This is a backstop**, not the primary mechanism. The clean way to push is
the happy-path wrapper:

```bash
kol360-push-bioexec.sh <tag>   # e.g. kol360-push-bioexec.sh prod-rel-4.1.31
```

The wrapper handles the snapshot, strip, scans, diff confirmation, push,
cleanup, and hands off to the deploy poller. The pre-push hook catches
the case where someone bypasses the wrapper and runs `git push origin
main` directly.

#### Override

If a scan is a false positive (extremely rare — investigate first):

```bash
git push --no-verify ...
```

Don't make `--no-verify` a habit. The hook exists because the 2026-06-17
prod-rel-4.1.30 push leaked 24 internal files when the manual strip was
ad-hoc'd. The wrapper + hook combination removes the human-judgment step
that caused it.
