import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity-log";
import { findUserByIdentifier } from "@/lib/join";
import { verifyPassword } from "@/lib/password";
import {
  clearFailures,
  clientAddress,
  isThrottled,
  recordFailure,
  THROTTLE,
  throttleKey,
} from "@/lib/throttle";

// `email` carries either an email address or a username (students who joined with a class code).
const credentialsSchema = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Guessing is slowed here, so it holds however the sign-in is reached (H4.1): ten
        // misses on one account, or far more from one address, and the next tries are refused.
        const accountKey = throttleKey("login", email);
        const address = await clientAddress();
        const addressKey = throttleKey("login-from", address);
        if (await isThrottled(accountKey, THROTTLE.loginAccount)) return null;
        if (address !== "unknown" && (await isThrottled(addressKey, THROTTLE.loginAddress)))
          return null;
        const miss = async () => {
          await recordFailure(accountKey, THROTTLE.loginAccount);
          if (address !== "unknown") await recordFailure(addressKey, THROTTLE.loginAddress);
          return null;
        };

        const user = await findUserByIdentifier(email);
        if (!user) return miss();

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return miss();
        await clearFailures(accountKey);

        await db
          .update(schema.users)
          .set({ lastLoginAt: new Date() })
          .where(eq(schema.users.id, user.id));
        if (user.role === "student") await logActivity({ userId: user.id, kind: "login" });

        // Only these fields ever leave this function; password_hash stays here.
        return {
          id: user.id,
          email: user.email,
          username: user.username,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
        };
      },
    }),
  ],
});
