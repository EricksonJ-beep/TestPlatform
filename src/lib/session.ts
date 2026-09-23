import { auth } from "@/auth";
import type { UserRole } from "@/db/types";

/** The identity every authorization check works from. Never includes secrets. */
export type Session = {
  userId: string;
  role: UserRole;
  /** null for students who joined with a class code; they log in with `username`. */
  email: string | null;
  username?: string | null;
  firstName: string;
  lastName: string;
};

/** Reads the Auth.js JWT session. Tests mock this module to inject a session. */
export async function getCurrentSession(): Promise<Session | null> {
  const s = await auth();
  if (!s?.user?.id) return null;
  return {
    userId: s.user.id,
    role: s.user.role,
    email: s.user.email ?? null,
    username: s.user.username ?? null,
    firstName: s.user.firstName,
    lastName: s.user.lastName,
  };
}
