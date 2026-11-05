/**
 * A request that changes something from a plain form post must come from Bloom's own pages: a
 * link or form on another site can't record a Skyward export in the teacher's name. Server actions
 * check this themselves; route handlers that write call this. Rule: the Origin header (or, when a
 * browser leaves it out, the Referer) names this request's own host.
 */
export function isSameOrigin(req: Request): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;
  const from = req.headers.get("origin") ?? req.headers.get("referer");
  if (!from) return false;
  try {
    return new URL(from).host === host;
  } catch {
    return false;
  }
}
