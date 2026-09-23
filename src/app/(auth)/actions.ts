"use server";

import { AuthError } from "next-auth";
import { unstable_rethrow } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db, schema } from "@/db";
import { publicAction } from "@/lib/authz";
import { findUserByIdentifier } from "@/lib/join";
import { hashPassword, passwordPolicy } from "@/lib/password";
import { safeNext } from "@/lib/routes";

export type AuthFormState = { error?: string; fieldErrors?: Record<string, string> } | null;

const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email or username.").max(200),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/** Public by design: this is how a session begins. Distinguishes "no account" from "wrong password". */
export const loginAction = publicAction(
  async (_prev: AuthFormState, formData: FormData): Promise<AuthFormState> => {
    const parsed = loginSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { fieldErrors: firstErrors(parsed.error) };
    }
    const { email, password, next } = parsed.data;

    const user = await findUserByIdentifier(email);
    if (!user) {
      return {
        error: email.includes("@")
          ? "We don't have an account for that email. Students: use your class join code. Teachers: create an account below."
          : "We don't have an account with that username. Check the spelling, or join your class with its code.",
      };
    }

    try {
      await signIn("credentials", { email, password, redirectTo: safeNext(next, user.role) });
    } catch (err) {
      unstable_rethrow(err); // success: Auth.js redirects, and that must propagate
      if (err instanceof AuthError) {
        return { error: "That password isn't right. Try again, or ask your teacher to reset it." };
      }
      throw err;
    }
    return null;
  }
);

const signupSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name."),
  lastName: z.string().trim().min(1, "Enter your last name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(passwordPolicy.minLength, passwordPolicy.message),
  inviteCode: z.string().trim().min(1, "Enter the invite code."),
});

/** Public by design, but gated by TEACHER_INVITE_CODE so strangers can't register. Creates teachers only. */
export const signupAction = publicAction(
  async (_prev: AuthFormState, formData: FormData): Promise<AuthFormState> => {
    const parsed = signupSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { fieldErrors: firstErrors(parsed.error) };
    }
    const { firstName, lastName, email, password, inviteCode } = parsed.data;

    const expected = process.env.TEACHER_INVITE_CODE;
    if (!expected || inviteCode !== expected) {
      return { fieldErrors: { inviteCode: "That invite code isn't right." } };
    }

    const existing = await db.query.users.findFirst({
      columns: { id: true },
      where: sql`lower(${schema.users.email}) = ${email}`,
    });
    if (existing) {
      return {
        fieldErrors: { email: "There's already an account with that email. Log in instead." },
      };
    }

    await db.insert(schema.users).values({
      email,
      passwordHash: await hashPassword(password),
      role: "teacher",
      firstName,
      lastName,
    });

    try {
      await signIn("credentials", { email, password, redirectTo: "/app" });
    } catch (err) {
      unstable_rethrow(err);
      throw err;
    }
    return null;
  }
);

/** Public by design: ending a session needs no authorization. */
export const logoutAction = publicAction(async () => {
  await signOut({ redirectTo: "/login" });
});

function firstErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
