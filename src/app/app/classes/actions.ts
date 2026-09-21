"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireOwner, requireTeacher, withAuthz } from "@/lib/authz";
import { parseCsvRecords } from "@/lib/csv";
import { generateTempPassword, hashPassword, passwordPolicy } from "@/lib/password";

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

const classSchema = z.object({
  name: z.string().trim().min(1, "Give the class a name.").max(80),
  courseName: z.string().trim().max(80).optional().or(z.literal("")),
  period: z.string().trim().max(20).optional().or(z.literal("")),
  term: z.string().trim().max(40).optional().or(z.literal("")),
});

/** Create a class owned by the signed-in teacher; a typed course name is created on the fly. */
export const createClass = withAuthz(async (formData: FormData) => {
  const session = await requireTeacher();
  const parsed = classSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new ActionError("Check the form.", 400, fieldErrors(parsed.error));
  const { name, courseName, period, term } = parsed.data;

  let courseId: string | null = null;
  if (courseName) {
    const existing = await db.query.courses.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.courses.ownerId, session.userId),
        sql`lower(${schema.courses.name}) = ${courseName.toLowerCase()}`
      ),
    });
    if (existing) {
      courseId = existing.id;
    } else {
      const [course] = await db
        .insert(schema.courses)
        .values({ ownerId: session.userId, name: courseName })
        .returning({ id: schema.courses.id });
      courseId = course.id;
    }
  }

  const [cls] = await db
    .insert(schema.classes)
    .values({
      ownerId: session.userId,
      courseId,
      name,
      period: period || null,
      term: term || null,
    })
    .returning({ id: schema.classes.id });

  revalidatePath("/app/classes");
  revalidatePath("/app");
  return { classId: cls.id };
});

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

const studentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().min(1, "Last name is required.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  tempPassword: z
    .string()
    .trim()
    .max(72)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || v.length >= passwordPolicy.minLength, passwordPolicy.message),
});

export type CreatedStudent = {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Plain temp password, shown to the teacher exactly once. null if the account already existed. */
  tempPassword: string | null;
  status: "created" | "enrolled_existing" | "already_enrolled";
};

/**
 * Create-or-enroll one student. Password hashes are computed here and never returned.
 * Requires ownership of the class.
 */
async function createOrEnrollStudent(
  classId: string,
  organizationId: string | null,
  input: { firstName: string; lastName: string; email: string; tempPassword?: string }
): Promise<CreatedStudent> {
  const existing = await db.query.users.findFirst({
    columns: { id: true, role: true, firstName: true, lastName: true, email: true },
    where: sql`lower(${schema.users.email}) = ${input.email}`,
  });

  if (existing && existing.role !== "student") {
    throw new ActionError(`${input.email} belongs to a teacher account.`, 409);
  }

  if (existing) {
    const enrolled = await db.query.enrollments.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.enrollments.classId, classId),
        eq(schema.enrollments.studentId, existing.id)
      ),
    });
    if (enrolled) {
      return {
        studentId: existing.id,
        ...existing,
        tempPassword: null,
        status: "already_enrolled",
      };
    }
    await db.insert(schema.enrollments).values({ classId, studentId: existing.id });
    return { studentId: existing.id, ...existing, tempPassword: null, status: "enrolled_existing" };
  }

  const tempPassword = input.tempPassword || generateTempPassword();
  const [user] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      passwordHash: await hashPassword(tempPassword),
      role: "student",
      firstName: input.firstName,
      lastName: input.lastName,
      organizationId,
      mustChangePassword: true,
    })
    .returning({ id: schema.users.id });
  await db.insert(schema.enrollments).values({ classId, studentId: user.id });
  return {
    studentId: user.id,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    tempPassword,
    status: "created",
  };
}

async function teacherOrganizationId(userId: string): Promise<string | null> {
  const me = await db.query.users.findFirst({
    columns: { organizationId: true },
    where: eq(schema.users.id, userId),
  });
  return me?.organizationId ?? null;
}

/** Add one student to a class (creates the account if needed). */
export const addStudent = withAuthz(async (classId: string, formData: FormData) => {
  const session = await requireOwner({ type: "class", id: classId });
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new ActionError("Check the form.", 400, fieldErrors(parsed.error));
  const orgId = await teacherOrganizationId(session.userId);
  const result = await createOrEnrollStudent(classId, orgId, {
    ...parsed.data,
    tempPassword: parsed.data.tempPassword || undefined,
  });
  revalidatePath(`/app/classes/${classId}`);
  return result;
});

export type ImportRowResult =
  | { line: number; ok: true; student: CreatedStudent }
  | { line: number; ok: false; email: string; error: string };

/** Bulk add from a CSV with first_name,last_name,email. One generated temp password per new account. */
export const importStudentsCsv = withAuthz(async (classId: string, formData: FormData) => {
  const session = await requireOwner({ type: "class", id: classId });
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ActionError("Choose a CSV file.", 400, { file: ["Choose a CSV file."] });
  }
  if (file.size > 1_000_000) throw new ActionError("That file is larger than 1 MB.", 400);

  const { headers, records } = parseCsvRecords(await file.text());
  for (const h of ["first_name", "last_name", "email"]) {
    if (!headers.includes(h)) {
      throw new ActionError(
        `The CSV needs a "${h}" column (found: ${headers.join(", ") || "none"}).`,
        400
      );
    }
  }
  if (records.length === 0) throw new ActionError("The CSV has a header but no rows.", 400);
  if (records.length > 200) throw new ActionError("Import at most 200 students at a time.", 400);

  const orgId = await teacherOrganizationId(session.userId);
  const results: ImportRowResult[] = [];
  const seen = new Set<string>();
  for (const [i, rec] of records.entries()) {
    const line = i + 2;
    const parsed = studentSchema.safeParse({
      firstName: rec.first_name,
      lastName: rec.last_name,
      email: rec.email,
      tempPassword: rec.temp_password ?? "",
    });
    if (!parsed.success) {
      results.push({ line, ok: false, email: rec.email ?? "", error: firstMessage(parsed.error) });
      continue;
    }
    if (seen.has(parsed.data.email)) {
      results.push({
        line,
        ok: false,
        email: parsed.data.email,
        error: "Duplicate email in file.",
      });
      continue;
    }
    seen.add(parsed.data.email);
    try {
      const student = await createOrEnrollStudent(classId, orgId, {
        ...parsed.data,
        tempPassword: parsed.data.tempPassword || undefined,
      });
      results.push({ line, ok: true, student });
    } catch (err) {
      results.push({
        line,
        ok: false,
        email: parsed.data.email,
        error: err instanceof ActionError ? err.message : "Could not add this student.",
      });
    }
  }
  revalidatePath(`/app/classes/${classId}`);
  return { results };
});

/** Set a new temp password for a student in this teacher's class and return it once. */
export const resetStudentPassword = withAuthz(async (classId: string, studentId: string) => {
  await requireOwner({ type: "class", id: classId });
  await assertStudentInClass(classId, studentId);

  const tempPassword = generateTempPassword();
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
    .where(and(eq(schema.users.id, studentId), eq(schema.users.role, "student")));
  revalidatePath(`/app/classes/${classId}`);
  return { tempPassword };
});

/** Remove a student from this class (keeps the account). */
export const removeStudent = withAuthz(async (classId: string, studentId: string) => {
  await requireOwner({ type: "class", id: classId });
  await assertStudentInClass(classId, studentId);
  await db
    .delete(schema.enrollments)
    .where(
      and(eq(schema.enrollments.classId, classId), eq(schema.enrollments.studentId, studentId))
    );
  revalidatePath(`/app/classes/${classId}`);
  return { removed: true };
});

// Rule: roster actions only reach students enrolled in the class being acted on.
async function assertStudentInClass(classId: string, studentId: string) {
  const enrolled = await db.query.enrollments.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.enrollments.classId, classId),
      eq(schema.enrollments.studentId, studentId)
    ),
  });
  if (!enrolled) throw new ActionError("That student isn't in this class.", 404);
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid row.";
}
