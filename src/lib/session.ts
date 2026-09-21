import { auth } from "@/auth";
import type { UserRole } from "@/db/types";

/** The identity every authorization check works from. Never includes secrets. */
export type Session = {
  userId: string;
  role: UserRole;
  email: string;
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
    email: s.user.email,
    firstName: s.user.firstName,
    lastName: s.user.lastName,
  };
}
