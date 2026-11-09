/** True for Postgres's unique-violation error, whichever driver raised it. */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 4; i++) {
    const o = e as { code?: unknown; cause?: unknown };
    if (o.code === "23505") return true;
    e = o.cause;
  }
  return false;
}
