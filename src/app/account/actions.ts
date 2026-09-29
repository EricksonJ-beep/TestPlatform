"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireSession, withAuthz } from "@/lib/authz";
import { hashPassword, passwordPolicy, verifyPassword } from "@/lib/password";

const schemaChange = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(passwordPolicy.minLength, passwordPolicy.message).max(200),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, {
    path: ["confirm"],
    message: "The two new passwords don't match.",
  })
  .refine((v) => v.next !== v.current, {
    path: ["next"],
    message: "Pick a password you haven't used here.",
  });

/**
 * Change your own password (student or teacher). Rule: the current password
 * must verify; the new one meets the policy; `must_change_password` clears.
 */
export const changePassword = withAuthz(async (formData: FormData) => {
  const session = await requireSession();
  const parsed = schemaChange.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues)
      (fieldErrors[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
    throw new ActionError("Check the form.", 400, fieldErrors);
  }
  const user = await db.query.users.findFirst({
    columns: { passwordHash: true },
    where: eq(schema.users.id, session.userId),
  });
  if (!user) throw new ActionError("Not found.", 404);
  if (!(await verifyPassword(parsed.data.current, user.passwordHash)))
    throw new ActionError("Check the form.", 400, {
      current: ["That isn't your current password."],
    });
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(parsed.data.next), mustChangePassword: false })
    .where(eq(schema.users.id, session.userId));
  revalidatePath("/student");
  revalidatePath("/app/settings");
  return { ok: true };
});

/** Whether the signed-in user still has to change a temporary password (for the nudge). */
export const passwordStatus = withAuthz(async () => {
  const session = await requireSession();
  const user = await db.query.users.findFirst({
    columns: { mustChangePassword: true },
    where: eq(schema.users.id, session.userId),
  });
  return { mustChange: !!user?.mustChangePassword };
});
