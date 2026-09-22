/**
 * Question bank reads for Phase 0 lists. Callers must have passed requireTeacher().
 */
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type BankSummary = {
  id: string;
  name: string;
  description: string | null;
  courseName: string | null;
  questions: number;
  sharedWith: number;
  createdAt: Date;
  isArchived: boolean;
};

/** Banks the teacher owns, with question counts and how many people they're shared with. */
export async function listMyBanks(
  teacherId: string,
  includeArchived = false
): Promise<BankSummary[]> {
  const rows = await db
    .select({
      id: schema.questionBanks.id,
      name: schema.questionBanks.name,
      description: schema.questionBanks.description,
      courseName: schema.courses.name,
      questions: count(schema.questions.id),
      createdAt: schema.questionBanks.createdAt,
      isArchived: schema.questionBanks.isArchived,
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
    .where(
      includeArchived
        ? eq(schema.questionBanks.ownerId, teacherId)
        : and(
            eq(schema.questionBanks.ownerId, teacherId),
            eq(schema.questionBanks.isArchived, false)
          )
    )
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
    .where(
      and(eq(schema.shares.sharedWithUserId, teacherId), eq(schema.questionBanks.isArchived, false))
    )
    .groupBy(
      schema.questionBanks.id,
      schema.shares.permission,
      schema.users.firstName,
      schema.users.lastName
    )
    .orderBy(asc(schema.questionBanks.name));
}

// ---------------------------------------------------------------------------
// One bank and its questions (Ticket 1.2)
// ---------------------------------------------------------------------------

export type BankDetail = {
  id: string;
  name: string;
  description: string | null;
  courseId: string | null;
  courseName: string | null;
  ownerId: string;
  ownerFirstName: string;
  ownerLastName: string;
  isArchived: boolean;
};

export async function getBank(bankId: string): Promise<BankDetail | null> {
  const [row] = await db
    .select({
      id: schema.questionBanks.id,
      name: schema.questionBanks.name,
      description: schema.questionBanks.description,
      courseId: schema.questionBanks.courseId,
      courseName: schema.courses.name,
      ownerId: schema.questionBanks.ownerId,
      ownerFirstName: schema.users.firstName,
      ownerLastName: schema.users.lastName,
      isArchived: schema.questionBanks.isArchived,
    })
    .from(schema.questionBanks)
    .leftJoin(schema.courses, eq(schema.questionBanks.courseId, schema.courses.id))
    .innerJoin(schema.users, eq(schema.questionBanks.ownerId, schema.users.id))
    .where(eq(schema.questionBanks.id, bankId))
    .limit(1);
  return row ?? null;
}

export type QuestionFilters = {
  q?: string;
  type?: string;
  targetId?: string;
  difficulty?: number;
  bloom?: string;
  tag?: string;
};

export type BankQuestionRow = {
  id: string;
  type: (typeof schema.questionType.enumValues)[number];
  stem: string;
  points: number;
  difficulty: number;
  bloom: (typeof schema.bloomLevel.enumValues)[number] | null;
  grading: "auto" | "manual";
  gradingConfig: unknown;
  topic: string | null;
  tags: string[];
  explanation: string | null;
  externalId: string | null;
  version: number;
  mediaUrl: string | null;
  videoUrl: string | null;
  stimulusRef: string | null;
  targets: { id: string; code: string; title: string }[];
  options: {
    content: string;
    isCorrect: boolean;
    matchText: string | null;
    correctPosition: number | null;
  }[];
  updatedAt: Date;
};

/** Live (non-archived) questions in a bank, filtered. Options and targets are attached in two follow-up queries. */
export async function listBankQuestions(
  bankId: string,
  f: QuestionFilters = {}
): Promise<BankQuestionRow[]> {
  const conds = [eq(schema.questions.bankId, bankId), eq(schema.questions.isArchived, false)];
  if (f.type) conds.push(sql`${schema.questions.type} = ${f.type}`);
  if (f.difficulty) conds.push(eq(schema.questions.difficulty, f.difficulty));
  if (f.bloom) conds.push(sql`${schema.questions.bloom} = ${f.bloom}`);
  if (f.tag) conds.push(sql`${f.tag} = any(${schema.questions.tags})`);
  if (f.q) conds.push(sql`${schema.questions.stem} ilike ${"%" + f.q + "%"}`);
  if (f.targetId) {
    conds.push(
      sql`exists (select 1 from ${schema.questionTargets} qt where qt.question_id = ${schema.questions.id} and qt.learning_target_id = ${f.targetId})`
    );
  }

  const base = await db
    .select({
      id: schema.questions.id,
      type: schema.questions.type,
      stem: schema.questions.stem,
      points: schema.questions.points,
      difficulty: schema.questions.difficulty,
      bloom: schema.questions.bloom,
      grading: schema.questions.grading,
      gradingConfig: schema.questions.gradingConfig,
      topic: schema.questions.topic,
      tags: schema.questions.tags,
      explanation: schema.questions.explanation,
      externalId: schema.questions.externalId,
      version: schema.questions.version,
      mediaUrl: schema.questions.mediaUrl,
      videoUrl: schema.questions.videoUrl,
      stimulusRef: schema.stimuli.ref,
      updatedAt: schema.questions.updatedAt,
    })
    .from(schema.questions)
    .leftJoin(schema.stimuli, eq(schema.questions.stimulusId, schema.stimuli.id))
    .where(and(...conds))
    .orderBy(desc(schema.questions.updatedAt))
    .limit(500);
  if (base.length === 0) return [];
  const ids = base.map((b) => b.id);

  const targetRows = await db
    .select({
      questionId: schema.questionTargets.questionId,
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
    })
    .from(schema.questionTargets)
    .innerJoin(
      schema.learningTargets,
      eq(schema.questionTargets.learningTargetId, schema.learningTargets.id)
    )
    .where(inArray(schema.questionTargets.questionId, ids));
  const optionRows = await db
    .select({
      questionId: schema.questionOptions.questionId,
      content: schema.questionOptions.content,
      isCorrect: schema.questionOptions.isCorrect,
      matchText: schema.questionOptions.matchText,
      correctPosition: schema.questionOptions.correctPosition,
      sortOrder: schema.questionOptions.sortOrder,
    })
    .from(schema.questionOptions)
    .where(inArray(schema.questionOptions.questionId, ids))
    .orderBy(asc(schema.questionOptions.sortOrder));

  const targetsBy = new Map<string, BankQuestionRow["targets"]>();
  for (const t of targetRows)
    (targetsBy.get(t.questionId) ?? targetsBy.set(t.questionId, []).get(t.questionId)!).push(t);
  const optionsBy = new Map<string, BankQuestionRow["options"]>();
  for (const o of optionRows)
    (optionsBy.get(o.questionId) ?? optionsBy.set(o.questionId, []).get(o.questionId)!).push(o);

  return base.map((b) => ({
    ...b,
    targets: targetsBy.get(b.id) ?? [],
    options: optionsBy.get(b.id) ?? [],
  }));
}

/** Distinct tags used in a bank, for the filter dropdown. */
export async function listBankTags(bankId: string): Promise<string[]> {
  const rows = await db
    .select({ tag: sql<string>`distinct unnest(${schema.questions.tags})` })
    .from(schema.questions)
    .where(and(eq(schema.questions.bankId, bankId), eq(schema.questions.isArchived, false)));
  return rows.map((r) => r.tag).sort();
}
