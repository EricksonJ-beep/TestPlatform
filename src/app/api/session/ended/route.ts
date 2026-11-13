import { NextResponse } from "next/server";
import { auth, signOut } from "@/auth";
import { publicRoute } from "@/lib/authz";
import { homeFor } from "@/lib/routes";
import { accountState, sessionEnded } from "@/lib/session";

/**
 * Where a session that is no longer good gets signed out (H4.2, Nov 9 2026): the password
 * changed after it began, or the account is gone. Public by design: it needs no authorization
 * because it only ends the caller's own session, and only when that session has in fact ended,
 * so a link to this address can't sign anyone out.
 */
export const GET = publicRoute(async (req: Request) => {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.redirect(new URL("/login", req.url));
  const account = await accountState(s.user.id);
  if (!sessionEnded(account, s.user.issuedAt ?? 0))
    return NextResponse.redirect(new URL(homeFor(s.user.role), req.url));
  await signOut({ redirectTo: "/login?ended=1" });
  return NextResponse.redirect(new URL("/login?ended=1", req.url));
});
