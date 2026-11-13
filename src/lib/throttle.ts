/**
 * Slow down guessing (hardening plan H4.1, Nov 9 2026).
 *
 * Nothing limited how often a password, a class join code, a test's access code or a resume
 * code could be tried, and a temp password is one word and four digits. Each guessable thing
 * now counts its failed tries per key in `auth_throttle`; past the limit, the next try is
 * refused until the window ends. A success clears the count.
 *
 * Limits are per account or per student where there is one. Limits by network address are
 * generous on purpose: a whole school sits behind one address, and a class of 24 mistyping a
 * code once each must never lock the room out.
 */
import { eq, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/db";

export type ThrottleRule = { max: number; windowMs: number };

const MINUTES = 60_000;
export const THROTTLE = {
  /** One account's password. */
  loginAccount: { max: 10, windowMs: 10 * MINUTES },
  /** Every failed login from one network address (a school shares one). */
  loginAddress: { max: 150, windowMs: 10 * MINUTES },
  /** Class join codes tried from one address. */
  joinAddress: { max: 60, windowMs: 10 * MINUTES },
  /** One student on one test's access code, or one paused attempt's resume code. */
  code: { max: 10, windowMs: 10 * MINUTES },
  /** The teacher invite code from one address. */
  invite: { max: 10, windowMs: 30 * MINUTES },
} satisfies Record<string, ThrottleRule>;

export const TOO_MANY_TRIES = "Too many tries. Wait a few minutes, then try again.";

const t = schema.authThrottle;

/** True when the key has used up its tries in the current window. Reads only. */
export async function isThrottled(key: string, rule: ThrottleRule, now = new Date()) {
  const [row] = await db
    .select({ failures: t.failures, windowStartedAt: t.windowStartedAt })
    .from(t)
    .where(eq(t.key, key))
    .limit(1);
  if (!row) return false;
  if (row.windowStartedAt.getTime() + rule.windowMs <= now.getTime()) return false;
  return row.failures >= rule.max;
}

/** Count one failed try. One statement: a window that has ended starts again at 1. */
export async function recordFailure(key: string, rule: ThrottleRule, now = new Date()) {
  const windowStart = new Date(now.getTime() - rule.windowMs).toISOString();
  const nowIso = now.toISOString();
  await db
    .insert(t)
    .values({ key, failures: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        failures: sql`case when ${t.windowStartedAt} <= ${windowStart}::timestamptz then 1 else ${t.failures} + 1 end`,
        windowStartedAt: sql`case when ${t.windowStartedAt} <= ${windowStart}::timestamptz then ${nowIso}::timestamptz else ${t.windowStartedAt} end`,
      },
    });
  // Housekeeping, now and then: rows whose window ended a day ago are of no use.
  if (Math.random() < 0.02) {
    const old = new Date(now.getTime() - 24 * 60 * MINUTES);
    await db
      .delete(t)
      .where(lt(t.windowStartedAt, old))
      .catch(() => undefined);
  }
}

/** A success: the key starts clean. */
export async function clearFailures(key: string) {
  await db.delete(t).where(eq(t.key, key));
}

/** The caller's network address as the host reports it; "unknown" when it can't be read. */
export async function clientAddress(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || h.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** Keys are lowercase and bounded, whatever was typed. */
export const throttleKey = (...parts: string[]) =>
  parts.map((p) => p.trim().toLowerCase().slice(0, 120)).join(":");
