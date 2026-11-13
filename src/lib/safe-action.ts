/**
 * A server action whose request never arrived (hardening plan H1.5, Nov 9 2026).
 *
 * `withAuthz` turns a refusal into `{ ok: false }`, but a wifi drop rejects the call itself.
 * Screens that awaited it directly were left on "Checking…" or "Submitting…" for good. `safe`
 * turns the rejection into an ordinary failed result with a plain message, so the screen's
 * own error path runs and the button comes back.
 */
import type { ActionResult } from "@/lib/authz";

export const NO_CONNECTION =
  "Couldn't reach Bloom. Check your wifi and try again. Your work is still on this screen.";

/** Status 0 marks "the request didn't arrive" (worth a retry), unlike a refusal from the server. */
export function safe<T>(call: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return call.catch((): ActionResult<T> => ({ ok: false, status: 0, error: NO_CONNECTION }));
}

/** Worth sending again: it never arrived, or the server itself failed. */
export function isRetryable(r: { ok: boolean; status?: number }): boolean {
  return !r.ok && (r.status === 0 || (r.status ?? 0) >= 500 || r.status === 429);
}
