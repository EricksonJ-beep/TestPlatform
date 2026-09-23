/**
 * Auth.js config that is safe to import from proxy.ts: no database, no bcrypt.
 * `src/auth.ts` adds the Credentials provider on top of this.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  trustHost: true,
  providers: [],
  callbacks: {
    // Copy the fields we need into the JWT once at sign-in; the DB is not hit per request.
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id as string;
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.username = user.username ?? null;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.user.firstName = token.firstName;
      session.user.lastName = token.lastName;
      session.user.username = token.username ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;
