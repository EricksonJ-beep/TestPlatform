/**
 * Assessment reads for the builder, preview, and assign screens. Callers must
 * have passed requireShared(assessment, ...) or requireOwner first.
 */
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { BuilderItem, BuilderSection, PoolQuestion } from "@/lib/assessments/serve";
import type { BankQuestionRow } from "./banks";
import { listBankQuestions } from "./banks";

export type AssessmentSummary = {
  id: string;
  title: string;
  type: "practice" | "formative" | "summative";
  courseId: string | null;
  courseName: string | null;
  isPublished: boolean;
  sections: number;
  assignments: number;
  updatedAt: Date;
};

export async function listAssessments(teacherId: string): Promise<AssessmentSummary[]> {
  return db
    .select({
      id: schema.assessments.id,
      title: schema.assessments.title,
      type: schema.assessments.type,
      courseId: schema.assessments.courseId,
      courseName: schema.courses.name,
      isPublished: schema.assessments.isPublished,
      sections: sql<number>`(select count(*)::int from ${schema.assessmentSections} s where s.assessment_id = ${schema.assessments.id})`,
      assignments: sql<number>`(select count(*)::int from ${schema.assignments} a where a.assessment_id = ${schema.assessments.id})`,
      updatedAt: schema.assessments.updatedAt,
    })
    .from(schema.assessments)
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(eq(schema.assessments.ownerId, teacherId))
    .orderBy(desc(schema.assessments.updatedAt));
}

export type SectionItem =
  | {
      kind: "question";
      id: string;
      sortOrder: number;
      points: number | null;
      question: {
        id: string;
        type: BankQuestionRow["type"];
        stem: string;
        points: number;
        stimulusId: string | null;
        stimulusTitle: string | null;
        targets: { id: string; code: string; title: string }[];
      };
    }
  | {
      kind: "pool";
      id: string;
      sortOrder: number;
      drawCount: number;
      pool: {
        id: string;
        name: string;
        size: number;
        drawStimulusGroups: boolean;
        targets: { id: string; code: string; title: string }[];
      };
    };

export type SectionDetail = {
  id: string;
  title: string;
  instructions: string | null;
  sortOrder: number;
  learningTargetId: string | null;
  learningTarget: { id: string; code: string; title: string } | null;
  items: SectionItem[];
};

export type AssessmentDetail = {
  id: string;
  ownerId: string;
  courseId: string | null;
  courseName: string | null;
  type: "practice" | "formative" | "summative";
  title: string;
  instructions: string | null;
  attemptLimit: number | null;
  reviewMode: "auto" | "teacher_approved";
  retakeThreshold: number;
  optionalRetakes: boolean;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  oneAtATime: boolean;
  allowBacktrack: boolean;
  showResultsImmediately: boolean;
  isPublished: boolean;
  sections: SectionDetail[];
  assignments: number;
};

export async function getAssessmentDetail(assessmentId: string): Promise<AssessmentDetail | null> {
  const [a] = await db
    .select({
      id: schema.assessments.id,
      ownerId: schema.assessments.ownerId,
      courseId: schema.assessments.courseId,
      courseName: schema.courses.name,
      type: schema.assessments.type,
      title: schema.assessments.title,
      instructions: schema.assessments.instructions,
      attemptLimit: schema.assessments.attemptLimit,
      reviewMode: schema.assessments.reviewMode,
      retakeThreshold: schema.assessments.retakeThreshold,
      optionalRetakes: schema.assessments.optionalRetakes,
      randomizeQuestions: schema.assessments.randomizeQuestions,
      randomizeOptions: schema.assessments.randomizeOptions,
      oneAtATime: schema.assessments.oneAtATime,
      allowBacktrack: schema.assessments.allowBacktrack,
      showResultsImmediately: schema.assessments.showResultsImmediately,
      isPublished: schema.assessments.isPublished,
      assignments: sql<number>`(select count(*)::int from ${schema.assignments} x where x.assessment_id = ${schema.assessments.id})`,
    })
    .from(schema.assessments)
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(eq(schema.assessments.id, assessmentId))
    .limit(1);
  if (!a) return null;

  const sectionRows = await db
    .select({
      id: schema.assessmentSections.id,
      title: schema.assessmentSections.title,
      instructions: schema.assessmentSections.instructions,
      sortOrder: schema.assessmentSections.sortOrder,
      learningTargetId: schema.assessmentSections.learningTargetId,
      ltCode: schema.learningTargets.code,
      ltTitle: schema.learningTargets.title,
    })
    .from(schema.assessmentSections)
    .leftJoin(
      schema.learningTargets,
      eq(schema.assessmentSections.learningTargetId, schema.learningTargets.id)
    )
    .where(eq(schema.assessmentSections.assessmentId, assessmentId))
    .orderBy(asc(schema.assessmentSections.sortOrder));
  const sectionIds = sectionRows.map((s) => s.id);

  const itemRows = sectionIds.length
    ? await db
        .select({
          id: schema.assessmentQuestions.id,
          sectionId: schema.assessmentQuestions.sectionId,
          questionId: schema.assessmentQuestions.questionId,
          poolId: schema.assessmentQuestions.poolId,
          drawCount: schema.assessmentQuestions.drawCount,
          sortOrder: schema.assessmentQuestions.sortOrder,
          points: schema.assessmentQuestions.points,
          qType: schema.questions.type,
          qStem: schema.questions.stem,
          qPoints: schema.questions.points,
          qStimulusId: schema.questions.stimulusId,
          stimulusTitle: schema.stimuli.title,
          poolName: schema.questionPools.name,
          poolDrawGroups: schema.questionPools.drawStimulusGroups,
        })
        .from(schema.assessmentQuestions)
        .leftJoin(schema.questions, eq(schema.assessmentQuestions.questionId, schema.questions.id))
        .leftJoin(schema.stimuli, eq(schema.questions.stimulusId, schema.stimuli.id))
        .leftJoin(
          schema.questionPools,
          eq(schema.assessmentQuestions.poolId, schema.questionPools.id)
        )
        .where(inArray(schema.assessmentQuestions.sectionId, sectionIds))
        .orderBy(asc(schema.assessmentQuestions.sortOrder))
    : [];

  const questionIds = itemRows.map((i) => i.questionId).filter((x): x is string => !!x);
  const poolIds = itemRows.map((i) => i.poolId).filter((x): x is string => !!x);
  const [qTargets, poolSizes, poolTargets] = await Promise.all([
    questionIds.length
      ? db
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
          .where(inArray(schema.questionTargets.questionId, questionIds))
      : Promise.resolve([]),
    poolIds.length
      ? db
          .select({ poolId: schema.poolQuestions.poolId, n: count() })
          .from(schema.poolQuestions)
          .innerJoin(
            schema.questions,
            and(
              eq(schema.poolQuestions.questionId, schema.questions.id),
              eq(schema.questions.isArchived, false)
            )
          )
          .where(inArray(schema.poolQuestions.poolId, poolIds))
          .groupBy(schema.poolQuestions.poolId)
      : Promise.resolve([]),
    poolIds.length
      ? db
          .select({
            poolId: schema.poolTargets.poolId,
            id: schema.learningTargets.id,
            code: schema.learningTargets.code,
            title: schema.learningTargets.title,
          })
          .from(schema.poolTargets)
          .innerJoin(
            schema.learningTargets,
            eq(schema.poolTargets.learningTargetId, schema.learningTargets.id)
          )
          .where(inArray(schema.poolTargets.poolId, poolIds))
      : Promise.resolve([]),
  ]);
  const targetsByQ = new Map<string, { id: string; code: string; title: string }[]>();
  for (const t of qTargets)
    (targetsByQ.get(t.questionId) ?? targetsByQ.set(t.questionId, []).get(t.questionId)!).push({
      id: t.id,
      code: t.code,
      title: t.title,
    });
  const sizeByPool = new Map(poolSizes.map((p) => [p.poolId, p.n]));
  const targetsByPool = new Map<string, { id: string; code: string; title: string }[]>();
  for (const t of poolTargets)
    (targetsByPool.get(t.poolId) ?? targetsByPool.set(t.poolId, []).get(t.poolId)!).push({
      id: t.id,
      code: t.code,
      title: t.title,
    });

  const sections: SectionDetail[] = sectionRows.map((s) => ({
    id: s.id,
    title: s.title,
    instructions: s.instructions,
    sortOrder: s.sortOrder,
    learningTargetId: s.learningTargetId,
    learningTarget:
      s.learningTargetId && s.ltCode && s.ltTitle
        ? { id: s.learningTargetId, code: s.ltCode, title: s.ltTitle }
        : null,
    items: itemRows
      .filter((i) => i.sectionId === s.id)
      .map((i): SectionItem =>
        i.questionId && i.qType && i.qStem !== null
          ? {
              kind: "question",
              id: i.id,
              sortOrder: i.sortOrder,
              points: i.points,
              question: {
                id: i.questionId,
                type: i.qType,
                stem: i.qStem,
                points: i.qPoints ?? 1,
                stimulusId: i.qStimulusId ?? null,
                stimulusTitle: i.stimulusTitle ?? null,
                targets: targetsByQ.get(i.questionId) ?? [],
              },
            }
          : {
              kind: "pool",
              id: i.id,
              sortOrder: i.sortOrder,
              drawCount: i.drawCount ?? 1,
              pool: {
                id: i.poolId!,
                name: i.poolName ?? "Pool",
                size: sizeByPool.get(i.poolId!) ?? 0,
                drawStimulusGroups: i.poolDrawGroups ?? false,
                targets: targetsByPool.get(i.poolId!) ?? [],
              },
            }
      ),
  }));

  return { ...a, sections };
}

/** Pools on a course with sizes and targets, for the builder's "draw from pool" picker. */
export async function listPoolsForBuilder(courseId: string) {
  const pools = await db
    .select({
      id: schema.questionPools.id,
      name: schema.questionPools.name,
      drawStimulusGroups: schema.questionPools.drawStimulusGroups,
    })
    .from(schema.questionPools)
    .where(eq(schema.questionPools.courseId, courseId))
    .orderBy(asc(schema.questionPools.name));
  if (pools.length === 0) return [];
  const ids = pools.map((p) => p.id);
  const sizes = await db
    .select({ poolId: schema.poolQuestions.poolId, n: count() })
    .from(schema.poolQuestions)
    .innerJoin(
      schema.questions,
      and(
        eq(schema.poolQuestions.questionId, schema.questions.id),
        eq(schema.questions.isArchived, false)
      )
    )
    .where(inArray(schema.poolQuestions.poolId, ids))
    .groupBy(schema.poolQuestions.poolId);
  const targets = await db
    .select({
      poolId: schema.poolTargets.poolId,
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
    })
    .from(schema.poolTargets)
    .innerJoin(
      schema.learningTargets,
      eq(schema.poolTargets.learningTargetId, schema.learningTargets.id)
    )
    .where(inArray(schema.poolTargets.poolId, ids));
  const sizeBy = new Map(sizes.map((s) => [s.poolId, s.n]));
  return pools.map((p) => ({
    ...p,
    size: sizeBy.get(p.id) ?? 0,
    targets: targets
      .filter((t) => t.poolId === p.id)
      .map((t) => ({ id: t.id, code: t.code, title: t.title })),
  }));
}

/** Banks a teacher can pick questions from for a course: own banks plus banks shared with them. */
export async function listBanksForCourse(teacherId: string, courseId: string) {
  const own = await db
    .select({ id: schema.questionBanks.id, name: schema.questionBanks.name })
    .from(schema.questionBanks)
    .where(
      and(
        eq(schema.questionBanks.ownerId, teacherId),
        eq(schema.questionBanks.courseId, courseId),
        eq(schema.questionBanks.isArchived, false)
      )
    );
  const shared = await db
    .select({ id: schema.questionBanks.id, name: schema.questionBanks.name })
    .from(schema.shares)
    .innerJoin(
      schema.questionBanks,
      and(
        eq(schema.shares.resourceId, schema.questionBanks.id),
        eq(schema.shares.resourceType, "question_bank")
      )
    )
    .where(
      and(
        eq(schema.shares.sharedWithUserId, teacherId),
        eq(schema.questionBanks.courseId, courseId),
        eq(schema.questionBanks.isArchived, false)
      )
    );
  return [...own, ...shared.map((b) => ({ ...b, name: `${b.name} (shared)` }))];
}

/** Everything the serve library needs to build a question set for an assessment. */
export async function loadBuilderSections(assessmentId: string): Promise<BuilderSection[]> {
  const detail = await getAssessmentDetail(assessmentId);
  if (!detail) return [];
  const poolIds = detail.sections.flatMap((s) =>
    s.items
      .filter((i) => i.kind === "pool")
      .map((i) => (i as Extract<SectionItem, { kind: "pool" }>).pool.id)
  );
  const poolQuestions = new Map<string, PoolQuestion[]>();
  if (poolIds.length) {
    const rows = await db
      .select({
        poolId: schema.poolQuestions.poolId,
        questionId: schema.questions.id,
        points: schema.questions.points,
        stimulusId: schema.questions.stimulusId,
      })
      .from(schema.poolQuestions)
      .innerJoin(
        schema.questions,
        and(
          eq(schema.poolQuestions.questionId, schema.questions.id),
          eq(schema.questions.isArchived, false)
        )
      )
      .where(inArray(schema.poolQuestions.poolId, poolIds));
    const qIds = rows.map((r) => r.questionId);
    const tRows = qIds.length
      ? await db
          .select({
            questionId: schema.questionTargets.questionId,
            learningTargetId: schema.questionTargets.learningTargetId,
          })
          .from(schema.questionTargets)
          .where(inArray(schema.questionTargets.questionId, qIds))
      : [];
    const tBy = new Map<string, string[]>();
    for (const t of tRows)
      (tBy.get(t.questionId) ?? tBy.set(t.questionId, []).get(t.questionId)!).push(
        t.learningTargetId
      );
    for (const r of rows)
      (poolQuestions.get(r.poolId) ?? poolQuestions.set(r.poolId, []).get(r.poolId)!).push({
        questionId: r.questionId,
        points: r.points,
        stimulusId: r.stimulusId,
        targetIds: tBy.get(r.questionId) ?? [],
      });
  }
  return detail.sections.map((s) => ({
    id: s.id,
    learningTargetId: s.learningTargetId,
    sortOrder: s.sortOrder,
    items: s.items.map((i): BuilderItem =>
      i.kind === "question"
        ? {
            kind: "question",
            id: i.id,
            questionId: i.question.id,
            points: i.points ?? i.question.points,
            stimulusId: i.question.stimulusId,
            sortOrder: i.sortOrder,
          }
        : {
            kind: "pool",
            id: i.id,
            poolId: i.pool.id,
            drawCount: i.drawCount,
            drawStimulusGroups: i.pool.drawStimulusGroups,
            questions: poolQuestions.get(i.pool.id) ?? [],
            sortOrder: i.sortOrder,
          }
    ),
  }));
}

/** Full question rows for a served set, in served order (preview and test screens). */
export async function questionsForServedSet(
  questionIds: string[]
): Promise<Map<string, BankQuestionRow>> {
  if (questionIds.length === 0) return new Map();
  const rows = await db
    .select({ bankId: schema.questions.bankId })
    .from(schema.questions)
    .where(inArray(schema.questions.id, questionIds));
  const bankIds = [...new Set(rows.map((r) => r.bankId))];
  const out = new Map<string, BankQuestionRow>();
  for (const bankId of bankIds) {
    for (const q of await listBankQuestions(bankId, { ids: questionIds })) out.set(q.id, q);
  }
  return out;
}
