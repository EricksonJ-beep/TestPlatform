import type { UserRole } from "@/db/types";

/** Where each role lands after login. */
export function homeFor(role: UserRole): string {
  return role === "student" ? "/student" : "/app";
}

/** Only allow same-site relative paths as post-login destinations. */
export function safeNext(next: string | null | undefined, role: UserRole): string {
  const home = homeFor(role);
  if (!next || !next.startsWith("/") || next.startsWith("//")) return home;
  const allowedPrefix = role === "student" ? "/student" : "/app";
  return next === allowedPrefix || next.startsWith(allowedPrefix + "/") ? next : home;
}
