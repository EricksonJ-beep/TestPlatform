"use server";

import { unstable_rethrow } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { signIn } from "@/auth";
import { db, schema } from "@/db";
import { ActionError, publicAction, withAuthz, requireStudent } from "@/lib/authz";
import { logActivity } from "@/lib/activity-log";
import { isUniqueViolation } from "@/lib/db-errors";
import { normalizeJoinCode, uniqueUsername } from "@/lib/join";
import { hashPassword, passwordPolicy } from "@/lib/password";
import {
  clientAddress,
  isThrottled,
  recordFailure,
  THROTTLE,
  throttleKey,
  TOO_MANY_TRIES,
} from "@/lib/throttle";

/**
 * Join codes are short, so guessing them is slowed by address (H4.1, Nov 9 2026). The limit is
 * roomy: a whole class joins from one school address, typos included.
 */
async function joinGuard() {
  const address = await clientAddress();
  const key = throttleKey("join-from", address);
  const limited = address !== "unknown";
  return {
    blocked: limited && (await isThrottled(key, THROTTLE.joinAddress)),
    miss: async () => {
      if (limited) await recordFailure(key, THROTTLE.joinAddress);
    },
  };
}

export type JoinLookup = {
  classId: string;
  className: string;
  courseName: string | null;
  teacherName: string;
  names: { id: string; firstName: string; lastName: string }[];
};

// Rule: a join code resolves only while the class has joining open.
async function classForCode(code: string) {
  const norm = normalizeJoinCode(code);
  if (norm.length < 4) return null;
  const [cls] = await db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      joinOpen: schema.classes.joinOpen,
      courseName: schema.courses.name,
      ownerId: schema.classes.ownerId,
      teacherFirst: schema.users.firstName,
      teacherLast: schema.users.lastName,
      organizationId: schema.users.organizationId,
    })
    .from(schema.classes)
    .leftJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
    .innerJoin(schema.users, eq(schema.classes.ownerId, schema.users.id))
    .where(sql`replace(replace(upper(${schema.classes.joinCode}), '-', ''), ' ', '') = ${norm}`)
    .limit(1);
  return cls ?? null;
}

/** Public by design: turns a code into the class and the unclaimed names (no other student data). */
export const lookupJoinCode = publicAction(
  withAuthz(async (code: string) => {
    const guard = await joinGuard();
    if (guard.blocked) throw new ActionError(TOO_MANY_TRIES, 429);
    const cls = await classForCode(String(code ?? ""));
    if (!cls) {
      await guard.miss();
      throw new ActionError("That code doesn't match a class. Check it with your teacher.", 404);
    }
    if (!cls.joinOpen) throw new ActionError("Joining is closed for this class right now.", 403);
    const names = await db
      .select({
        id: schema.rosterNames.id,
        firstName: schema.rosterNames.firstName,
        lastName: schema.rosterNames.lastName,
      })
      .from(schema.rosterNames)
      .where(and(eq(schema.rosterNames.classId, cls.id), isNull(schema.rosterNames.studentId)))
      .orderBy(schema.rosterNames.lastName, schema.rosterNames.firstName);
    const out: JoinLookup = {
      classId: cls.id,
      className: cls.name,
      courseName: cls.courseName,
      teacherName: `${cls.teacherFirst} ${cls.teacherLast}`,
      names,
    };
    return out;
  })
);

const joinSchema = z
  .object({
    code: z.string().trim().min(4, "Enter the code from your teacher."),
    nameId: z
      .string()
      .optional()
      .transform((v) => v || null),
    firstName: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => v || ""),
    lastName: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => v || ""),
    password: z.string().min(passwordPolicy.minLength, passwordPolicy.message),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match." })
  .refine((d) => d.nameId || (d.firstName && d.lastName), {
    path: ["nameId"],
    message: "Pick your name, or type it if it isn't listed.",
  });

export type JoinState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  created?: { username: string };
} | null;

/**
 * Public by design: creates a student account from a class code. The student
 * claims a roster name (or types one, which is flagged for the teacher), gets a
 * username, and is signed in. Rules: open code only; a name can be claimed once.
 */
export const joinClass = publicAction(
  async (_prev: JoinState, formData: FormData): Promise<JoinState> => {
    const parsed = joinSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[String(i.path[0] ?? "form")] ??= i.message;
      return { fieldErrors: fe };
    }
    const d = parsed.data;
    const guard = await joinGuard();
    if (guard.blocked) return { error: TOO_MANY_TRIES };
    const cls = await classForCode(d.code);
    if (!cls) {
      await guard.miss();
      return { error: "That code doesn't match a class. Check it with your teacher." };
    }
    if (!cls.joinOpen) return { error: "Joining is closed for this class right now." };

    let firstName = d.firstName;
    let lastName = d.lastName;
    let rosterId: string | null = null;
    if (d.nameId) {
      const name = await db.query.rosterNames.findFirst({
        where: and(eq(schema.rosterNames.id, d.nameId), eq(schema.rosterNames.classId, cls.id)),
      });
      if (!name) return { error: "That name isn't on the list any more. Pick again." };
      if (name.studentId)
        return {
          error:
            "Someone already joined with that name. If it's you, log in instead; otherwise tell your teacher.",
        };
      firstName = name.firstName;
      lastName = name.lastName;
      rosterId = name.id;
    }

    // Two joins at the same moment can pick the same username (the same name claimed twice, or
    // two students who share a name). The loser of that race tries the next free one; if the
    // roster name itself has gone, they are told (H4.3, Nov 9 2026).
    const taken = {
      error:
        "Someone already joined with that name. If it's you, log in instead; otherwise tell your teacher.",
    };
    const passwordHash = await hashPassword(d.password);
    let username = "";
    let user: { id: string } | undefined;
    for (let attempt = 0; attempt < 4 && !user; attempt++) {
      username = await uniqueUsername(firstName, lastName);
      try {
        [user] = await db
          .insert(schema.users)
          .values({
            email: null,
            username,
            passwordHash,
            role: "student",
            firstName,
            lastName,
            organizationId: cls.organizationId,
            mustChangePassword: false,
          })
          .returning({ id: schema.users.id });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (rosterId) {
          const now = await db.query.rosterNames.findFirst({
            columns: { studentId: true },
            where: eq(schema.rosterNames.id, rosterId),
          });
          if (!now || now.studentId) return taken;
        }
      }
    }
    if (!user) return { error: "That didn't go through. Try again." };
    await db.insert(schema.enrollments).values({ classId: cls.id, studentId: user.id });
    await logActivity({ userId: user.id, kind: "class_joined", detail: { className: cls.name } });
    if (rosterId) {
      // One conditional UPDATE (H4.3): of two students picking the same name at the same
      // moment, one gets it. The other's new account is taken back and they are told.
      const claimed = await db
        .update(schema.rosterNames)
        .set({ studentId: user.id })
        .where(and(eq(schema.rosterNames.id, rosterId), isNull(schema.rosterNames.studentId)))
        .returning({ id: schema.rosterNames.id });
      if (claimed.length === 0) {
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
        return taken;
      }
    } else {
      await db
        .insert(schema.rosterNames)
        .values({ classId: cls.id, firstName, lastName, studentId: user.id, selfEntered: true });
    }

    try {
      await signIn("credentials", {
        email: username,
        password: d.password,
        redirectTo: "/student",
      });
    } catch (err) {
      unstable_rethrow(err); // success: Auth.js redirects
      // Auth.js sign-in errors carry a `type`; anything else is a real failure.
      if (err && typeof err === "object" && "type" in err)
        return { created: { username }, error: "Account created. Log in with your username." };
      throw err;
    }
    return { created: { username } };
  }
);

/** A signed-in student adds another class with its code. */
export const joinAnotherClass = withAuthz(async (code: string) => {
  const session = await requireStudent();
  const codeKey = throttleKey("join-as", session.userId);
  if (await isThrottled(codeKey, THROTTLE.code)) throw new ActionError(TOO_MANY_TRIES, 429);
  const cls = await classForCode(String(code ?? ""));
  if (!cls) {
    await recordFailure(codeKey, THROTTLE.code);
    throw new ActionError("That code doesn't match a class. Check it with your teacher.", 404);
  }
  if (!cls.joinOpen) throw new ActionError("Joining is closed for this class right now.", 403);
  const already = await db.query.enrollments.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.enrollments.classId, cls.id),
      eq(schema.enrollments.studentId, session.userId)
    ),
  });
  if (already) return { classId: cls.id, className: cls.name, alreadyEnrolled: true };
  await db.insert(schema.enrollments).values({ classId: cls.id, studentId: session.userId });
  await logActivity({
    userId: session.userId,
    kind: "class_joined",
    detail: { className: cls.name },
  });
  // Claim a matching pending name if there is one, so the teacher's list stays tidy.
  const match = await db.query.rosterNames.findFirst({
    where: and(
      eq(schema.rosterNames.classId, cls.id),
      isNull(schema.rosterNames.studentId),
      sql`lower(${schema.rosterNames.firstName}) = ${session.firstName.toLowerCase()}`,
      sql`lower(${schema.rosterNames.lastName}) = ${session.lastName.toLowerCase()}`
    ),
  });
  if (match)
    await db
      .update(schema.rosterNames)
      .set({ studentId: session.userId })
      .where(eq(schema.rosterNames.id, match.id));
  return { classId: cls.id, className: cls.name, alreadyEnrolled: false };
});
