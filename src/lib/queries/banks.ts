/**
 * Question bank reads for Phase 0 lists. Callers must have passed requireTeacher().
 */
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type BankSummary = {
  id: string;
  name: string;
  description: string | null;
  courseName: string | null;
  questions: number;
  sharedWith: number;
  createdAt: Date;
};

/** Banks the teacher owns, with question counts and how many people they're shared with. */
export async function listMyBanks(teacherId: string): Promise<BankSummary[]> {
  const rows = await db
    .select({
      id: schema.questionBanks.id,
      name: schema.questionBanks.name,
      description: schema.questionBanks.description,
      courseName: schema.courses.name,
      questions: count(schema.questions.id),
      createdAt: schema.questionBanks.createdAt,
    })
    .from(schema.questionBanks)
    .leftJoin(schema.courses, eq(schema.questionBanks.courseId, schema.courses.id))
    .leftJoin(
      schema.questions,
      and(
        eq(schema.questions.bankId, schema.questionBanks.id),
        eq(schema.questions.isArchived, false)
      )
    )
    .where(eq(schema.questionBanks.ownerId, teacherId))
    .groupBy(schema.questionBanks.id, schema.courses.name)
    .orderBy(desc(schema.questionBanks.createdAt));

  const shares = await db
    .select({ resourceId: schema.shares.resourceId, n: count() })
    .from(schema.shares)
    .where(
      and(eq(schema.shares.ownerId, teacherId), eq(schema.shares.resourceType, "question_bank"))
    )
    .groupBy(schema.shares.resourceId);
  const shareCount = new Map(shares.map((s) => [s.resourceId, s.n]));

  return rows.map((r) => ({ ...r, sharedWith: shareCount.get(r.id) ?? 0 }));
}

export type SharedBank = {
  id: string;
  name: string;
  description: string | null;
  permission: "view" | "copy" | "co_edit";
  ownerFirstName: string;
  ownerLastName: string;
  questions: number;
};

/** Banks other teachers have shared with this teacher (never their private ones). */
export async function listBanksSharedWithMe(teacherId: string): Promise<SharedBank[]> {
  return db
    .select({
      id: schema.questionBanks.id,
      name: schema.questionBanks.name,
      description: schema.questionBanks.description,
      permission: schema.shares.permission,
      ownerFirstName: schema.users.firstName,
      ownerLastName: schema.users.lastName,
      questions: count(schema.questions.id),
    })
    .from(schema.shares)
    .innerJoin(
      schema.questionBanks,
      and(
        eq(schema.shares.resourceId, schema.questionBanks.id),
        eq(schema.shares.resourceType, "question_bank")
      )
    )
    .innerJoin(schema.users, eq(schema.questionBanks.ownerId, schema.users.id))
    .leftJoin(
      schema.questions,
      and(
        eq(schema.questions.bankId, schema.questionBanks.id),
        eq(schema.questions.isArchived, false)
      )
    )
    .where(eq(schema.shares.sharedWithUserId, teacherId))
    .groupBy(
      schema.questionBanks.id,
      schema.shares.permission,
      schema.users.firstName,
      schema.users.lastName
    )
    .orderBy(asc(schema.questionBanks.name));
}
