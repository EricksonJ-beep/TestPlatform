/**
 * Sharing reads (PLAN.md §3.12, Ticket 1.16): who a bank or assessment is
 * shared with, a teacher lookup by email, and the assessments shared with me.
 * Callers pass the guards first.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SharePermission } from "@/db/types";

export type ShareRef = { type: "question_bank" | "assessment"; id: string };

export type ShareRow = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  permission: SharePermission;
};

export async function listShares(ref: ShareRef): Promise<ShareRow[]> {
  return db
    .select({
      userId: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      permission: schema.shares.permission,
    })
    .from(schema.shares)
    .innerJoin(schema.users, eq(schema.shares.sharedWithUserId, schema.users.id))
    .where(and(eq(schema.shares.resourceType, ref.type), eq(schema.shares.resourceId, ref.id)))
    .orderBy(asc(schema.users.lastName), asc(schema.users.firstName));
}

/** A teacher account by email (case-insensitive); null when none or not a teacher. */
export async function findTeacherByEmail(email: string) {
  const lower = email.trim().toLowerCase();
  if (!lower) return null;
  const [row] = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(
      and(
        sql`lower(${schema.users.email}) = ${lower}`,
        sql`${schema.users.role} in ('teacher', 'admin')`
      )
    )
    .limit(1);
  return row ?? null;
}

export type SharedAssessment = {
  id: string;
  title: string;
  type: "practice" | "formative" | "summative";
  courseName: string | null;
  isPublished: boolean;
  permission: SharePermission;
  ownerFirstName: string;
  ownerLastName: string;
  sections: number;
};

/** Assessments other teachers shared with this teacher. */
export async function listAssessmentsSharedWithMe(teacherId: string): Promise<SharedAssessment[]> {
  return db
    .select({
      id: schema.assessments.id,
      title: schema.assessments.title,
      type: schema.assessments.type,
      courseName: schema.courses.name,
      isPublished: schema.assessments.isPublished,
      permission: schema.shares.permission,
      ownerFirstName: schema.users.firstName,
      ownerLastName: schema.users.lastName,
      sections: sql<number>`(select count(*)::int from ${schema.assessmentSections} s where s.assessment_id = ${schema.assessments.id})`,
    })
    .from(schema.shares)
    .innerJoin(
      schema.assessments,
      and(
        eq(schema.shares.resourceId, schema.assessments.id),
        eq(schema.shares.resourceType, "assessment")
      )
    )
    .innerJoin(schema.users, eq(schema.assessments.ownerId, schema.users.id))
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(eq(schema.shares.sharedWithUserId, teacherId))
    .orderBy(asc(schema.assessments.title));
}
