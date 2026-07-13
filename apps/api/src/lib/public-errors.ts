/**
 * v1.17.82 — Explicit error class for public-endpoint validation failures.
 *
 * Throw this from services when the client submitted something the spec
 * rejects (e.g. Brand-Affinity Grid item S invariants). The route-level
 * error handler recognizes the subclass and returns 400 with the raw
 * message — no more fragile substring matches against
 * "not found" / "already completed" / etc.
 *
 * Use for user-fixable input validation only. For genuinely internal
 * failures (unreachable DB, invariant break), throw a regular Error so
 * publicErrorResponse still returns 500 + logs to CloudWatch.
 */
export class PublicValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicValidationError';
  }
}
