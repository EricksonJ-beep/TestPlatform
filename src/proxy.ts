/**
 * Route protection (Next 16 `proxy`, formerly middleware).
 *   /app/*      → teachers only
 *   /student/*  → students only
 *   /login, /signup → bounce already-signed-in users to their home
 * Unauthenticated → /login?next=<path>. Wrong role → that role's home.
 *
 * Uses the proxy-safe auth config (JWT only, no database).
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { homeFor } from "@/lib/routes";
import { VIEW_AS_COOKIE } from "@/lib/view-as-cookie";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const role = req.auth?.user?.role ?? null;

  const wantsTeacher = pathname === "/app" || pathname.startsWith("/app/");
  const wantsStudent = pathname === "/student" || pathname.startsWith("/student/");
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (isAuthPage) {
    if (role) return NextResponse.redirect(new URL(homeFor(role), req.url));
    return NextResponse.next();
  }

  if (!role) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  // A teacher "viewing as" a student lives on the student pages until they leave (the
  // server re-validates the cookie; here it only steers the redirect).
  const viewingAs =
    (role === "teacher" || role === "admin") && !!req.cookies.get(VIEW_AS_COOKIE)?.value;
  if (viewingAs) {
    if (wantsTeacher) return NextResponse.redirect(new URL("/student", req.url));
    return NextResponse.next();
  }

  if (wantsTeacher && role !== "teacher" && role !== "admin") {
    return NextResponse.redirect(new URL(homeFor(role), req.url));
  }
  if (wantsStudent && role !== "student") {
    return NextResponse.redirect(new URL(homeFor(role), req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/app/:path*", "/student/:path*", "/login", "/signup"],
};
