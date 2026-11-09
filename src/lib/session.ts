import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import type { UserRole } from "@/db/types";
import { sessionEnded } from "@/lib/session-rules";
import { readViewAsCookie, resolveViewAs } from "@/lib/view-as";

export { sessionEnded };

/** The identity every authorization check works from. Never includes secrets. */
export type Session = {
  userId: string;
  role: UserRole;
  /** null for students who joined with a class code; they log in with `username`. */
  email: string | null;
  username?: string | null;
  firstName: string;
  lastName: string;
  /** Set when a teacher is viewing as this student (read-only); names the real teacher. */
  viewingAs?: { teacherId: string; teacherName: string };
  /** Signed in with a temporary password: every page sends them to change it first (H4.2). */
  mustChangePassword?: boolean;
};

/** Where a session that is no longer good is signed out (it clears the cookie, then /login). */
export const SESSION_ENDED_PATH = "/api/session/ended";

/** One small read per request, shared by every guard in it. */
export const accountState = cache(async (userId: string) => {
  const [row] = await db
    .select({
      passwordChangedAt: schema.users.passwordChangedAt,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row ?? null;
});

/**
 * Reads the Auth.js JWT session, then swaps in the student a teacher is
 * "viewing as" when the cookie names one they may view. Tests mock this module
 * to inject a session.
 */
export async function getCurrentSession(): Promise<Session | null> {
  const s = await auth();
  if (!s?.user?.id) return null;
  const account = await accountState(s.user.id);
  // The cookie is still valid, so only the sign-out route can clear it; a plain "not signed in"
  // here would bounce between /login and the home page.
  if (sessionEnded(account, s.user.issuedAt ?? 0)) redirect(SESSION_ENDED_PATH);
  const real: Session = {
    userId: s.user.id,
    role: s.user.role,
    email: s.user.email ?? null,
    username: s.user.username ?? null,
    firstName: s.user.firstName,
    lastName: s.user.lastName,
    mustChangePassword: !!account?.mustChangePassword,
  };
  const viewAs = await readViewAsCookie();
  return viewAs ? resolveViewAs(real, viewAs.studentId) : real;
}
