/**
 * Summatives are one section per learning target (PLAN.md §3.4, §8): a served question's target
 * comes from its section, and that target scores the attempt per target, decides which missed
 * questions need corrections, and scopes a targeted retake. Content packs used to build every
 * test as one untargeted "Questions" section, so a summative from a pack served no targets: no
 * per-target score, no corrections, no retake plan, and the student's card read "Done for now"
 * (Jon, Oct 20 2026: Unit 2 Test: Biochemistry). This builds a summative's sections from its
 * questions' own targets, and repairs the tests and attempts stored before the fix.
 */
import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ServedQuestion } from "@/db/types";
import { recomputeFinalScore } from "@/lib/attempts";
import { scoreAttempt, type Answer, type ResponseRecord } from "@/lib/grading";

export type TargetRef = { id: string; code: string; title: string; sortOrder: number };

/**
 * Rule: one group per target, in the course's target order, each keeping the items' order; null
 * when any item has no target (the test can't be split, so it is left as it is).
 */
export function groupByTarget<T extends { questionId: string }>(
  items: T[],
  targetOf: Map<string, TargetRef>
): { target: TargetRef; items: T[] }[] | null {
  const groups = new Map<string, { target: TargetRef; items: T[] }>();
  for (const item of items) {
    const target = targetOf.get(item.questionId);
    if (!target) return null;
    const g = groups.get(target.id) ?? { target, items: [] };
    g.items.push(item);
    groups.set(target.id, g);
  }
  return [...groups.values()].sort(
    (a, b) => a.target.sortOrder - b.target.sortOrder || a.target.code.localeCompare(b.target.code)
  );
}

/** The section title the builder gives a target's section (`addSectionPerTarget`). */
export function targetSectionTitle(t: TargetRef): string {
  return `${t.code} · ${t.title}`;
}

/**
 * Rule: a served question with no target takes the target of the section its question now sits in;
 * the rest stay as served. Null when nothing changes.
 */
export function retargetServed(
  served: ServedQuestion[],
  placement: Map<string, { sectionId: string; learningTargetId: string }>
): ServedQuestion[] | null {
  let changed = false;
  const next = served.map((q) => {
    const p = q.learningTargetId ? null : placement.get(q.questionId);
    if (!p) return q;
    changed = true;
    return { ...q, sectionId: p.sectionId, learningTargetId: p.learningTargetId };
  });
  return changed ? next : null;
}

/** Each question's target (the first in the course's order when it has several). */
export async function loadQuestionTargets(questionIds: string[]): Promise<Map<string, TargetRef>> {
  if (!questionIds.length) return new Map();
  const rows = await db
    .select({
      questionId: schema.questionTargets.questionId,
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
      sortOrder: schema.learningTargets.sortOrder,
    })
    .from(schema.questionTargets)
    .innerJoin(
      schema.learningTargets,
      eq(schema.learningTargets.id, schema.questionTargets.learningTargetId)
    )
    .where(inArray(schema.questionTargets.questionId, questionIds))
    .orderBy(asc(schema.learningTargets.sortOrder), asc(schema.learningTargets.code));
  const out = new Map<string, TargetRef>();
  for (const { questionId, ...t } of rows) if (!out.has(questionId)) out.set(questionId, t);
  return out;
}

/**
 * A new summative's sections from its questions: one per target, in target order. A question
 * with no target puts the whole test in one "Questions" section, as before.
 */
export async function insertTargetSections(
  assessmentId: string,
  questionIds: string[]
): Promise<void> {
  const groups = groupByTarget(
    questionIds.map((questionId) => ({ questionId })),
    await loadQuestionTargets(questionIds)
  );
  const sections = groups
    ? groups.map((g) => ({
        title: targetSectionTitle(g.target),
        learningTargetId: g.target.id as string | null,
        questionIds: g.items.map((i) => i.questionId),
      }))
    : [{ title: "Questions", learningTargetId: null, questionIds }];
  for (const [order, s] of sections.entries()) {
    const [sec] = await db
      .insert(schema.assessmentSections)
      .values({
        assessmentId,
        title: s.title,
        learningTargetId: s.learningTargetId,
        sortOrder: order,
      })
      .returning({ id: schema.assessmentSections.id });
    await db
      .insert(schema.assessmentQuestions)
      .values(
        s.questionIds.map((questionId, i) => ({ sectionId: sec.id, questionId, sortOrder: i }))
      );
  }
}

/**
 * Split the untargeted sections of stored summatives into target sections. Only sections the
 * split can't lose anything from: fixed questions (no pool draws), no section instructions, and
 * every question tagged with a target. A question goes to the test's section for its target
 * (created when missing); the emptied sections are removed. Safe to re-run: a run that stopped
 * part way leaves the rest in an untargeted section, which the next run moves. Returns the
 * assessments it changed.
 */
export async function splitUntargetedSummatives(): Promise<string[]> {
  const candidates = await db
    .selectDistinct({ id: schema.assessments.id })
    .from(schema.assessments)
    .innerJoin(
      schema.assessmentSections,
      eq(schema.assessmentSections.assessmentId, schema.assessments.id)
    )
    .where(
      and(
        eq(schema.assessments.type, "summative"),
        isNull(schema.assessmentSections.learningTargetId)
      )
    );
  const changed: string[] = [];
  for (const { id: assessmentId } of candidates) {
    const sections = await db
      .select({
        id: schema.assessmentSections.id,
        learningTargetId: schema.assessmentSections.learningTargetId,
        instructions: schema.assessmentSections.instructions,
        sortOrder: schema.assessmentSections.sortOrder,
      })
      .from(schema.assessmentSections)
      .where(eq(schema.assessmentSections.assessmentId, assessmentId))
      .orderBy(asc(schema.assessmentSections.sortOrder));
    const untargeted = sections.filter((s) => !s.learningTargetId);
    if (untargeted.some((s) => s.instructions?.trim())) continue;
    const items = await db
      .select({
        id: schema.assessmentQuestions.id,
        sectionId: schema.assessmentQuestions.sectionId,
        questionId: schema.assessmentQuestions.questionId,
        sortOrder: schema.assessmentQuestions.sortOrder,
      })
      .from(schema.assessmentQuestions)
      .where(
        inArray(
          schema.assessmentQuestions.sectionId,
          untargeted.map((s) => s.id)
        )
      );
    if (!items.length || items.some((i) => !i.questionId)) continue;
    const sectionOrder = new Map(untargeted.map((s, i) => [s.id, i]));
    const ordered = items
      .map((i) => ({ ...i, questionId: i.questionId! }))
      .sort(
        (a, b) =>
          sectionOrder.get(a.sectionId)! - sectionOrder.get(b.sectionId)! ||
          a.sortOrder - b.sortOrder
      );
    const groups = groupByTarget(
      ordered,
      await loadQuestionTargets(ordered.map((i) => i.questionId))
    );
    if (!groups) continue;

    const byTarget = new Map(
      sections.filter((s) => s.learningTargetId).map((s) => [s.learningTargetId!, s.id])
    );
    let nextOrder = Math.max(...sections.map((s) => s.sortOrder)) + 1;
    for (const g of groups) {
      let sectionId = byTarget.get(g.target.id);
      if (!sectionId) {
        [{ id: sectionId }] = await db
          .insert(schema.assessmentSections)
          .values({
            assessmentId,
            title: targetSectionTitle(g.target),
            learningTargetId: g.target.id,
            sortOrder: nextOrder++,
          })
          .returning({ id: schema.assessmentSections.id });
      }
      const [{ last }] = await db
        .select({ last: max(schema.assessmentQuestions.sortOrder) })
        .from(schema.assessmentQuestions)
        .where(eq(schema.assessmentQuestions.sectionId, sectionId));
      let order = (last ?? -1) + 1;
      for (const item of g.items)
        await db
          .update(schema.assessmentQuestions)
          .set({ sectionId, sortOrder: order++ })
          .where(eq(schema.assessmentQuestions.id, item.id));
    }
    await db.delete(schema.assessmentSections).where(
      inArray(
        schema.assessmentSections.id,
        untargeted.map((s) => s.id)
      )
    );
    changed.push(assessmentId);
  }
  return changed;
}

/**
 * Give stored summative attempts the targets their questions now have (`retargetServed`), then
 * rescore each finished one per target from its stored scores (never re-graded) and recompute the
 * student's counting score and retake gates, so corrections and the retake plan appear. Safe to
 * re-run: an attempt whose questions all have a target is skipped. Returns the attempts changed.
 */
export async function retargetSummativeAttempts(): Promise<number> {
  const rows = await db
    .select({
      id: schema.attempts.id,
      status: schema.attempts.status,
      questionSet: schema.attempts.questionSet,
      assignmentId: schema.attempts.assignmentId,
      studentId: schema.attempts.studentId,
      assessmentId: schema.assignments.assessmentId,
    })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.attempts.assignmentId))
    .innerJoin(schema.assessments, eq(schema.assessments.id, schema.assignments.assessmentId))
    .where(
      and(
        eq(schema.assessments.type, "summative"),
        sql`${schema.attempts.questionSet} @> ${JSON.stringify([{ learningTargetId: null }])}::jsonb`
      )
    );
  const placements = new Map<
    string,
    Map<string, { sectionId: string; learningTargetId: string }>
  >();
  const pairs = new Map<string, { assignmentId: string; studentId: string }>();
  let changed = 0;
  for (const a of rows) {
    let placement = placements.get(a.assessmentId);
    if (!placement) {
      const items = await db
        .select({
          questionId: schema.assessmentQuestions.questionId,
          sectionId: schema.assessmentSections.id,
          learningTargetId: schema.assessmentSections.learningTargetId,
        })
        .from(schema.assessmentQuestions)
        .innerJoin(
          schema.assessmentSections,
          eq(schema.assessmentSections.id, schema.assessmentQuestions.sectionId)
        )
        .where(eq(schema.assessmentSections.assessmentId, a.assessmentId));
      placement = new Map(
        items.flatMap((i) =>
          i.questionId && i.learningTargetId
            ? [[i.questionId, { sectionId: i.sectionId, learningTargetId: i.learningTargetId }]]
            : []
        )
      );
      placements.set(a.assessmentId, placement);
    }
    const questionSet = retargetServed(a.questionSet, placement);
    if (!questionSet) continue;
    await db.update(schema.attempts).set({ questionSet }).where(eq(schema.attempts.id, a.id));
    changed++;
    if (a.status === "in_progress") continue;
    const responses = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.attemptId, a.id));
    const records = new Map<string, ResponseRecord>(
      responses.map((r) => [
        r.questionId,
        {
          questionId: r.questionId,
          answer: (r.answer as Answer | null) ?? null,
          autoScore: r.autoScore,
          manualScore: r.manualScore,
        },
      ])
    );
    const { perTarget } = scoreAttempt(questionSet, records);
    await db
      .delete(schema.attemptTargetScores)
      .where(eq(schema.attemptTargetScores.attemptId, a.id));
    if (perTarget.length)
      await db
        .insert(schema.attemptTargetScores)
        .values(perTarget.map((t) => ({ attemptId: a.id, ...t })));
    pairs.set(`${a.assignmentId}:${a.studentId}`, {
      assignmentId: a.assignmentId,
      studentId: a.studentId,
    });
  }
  for (const p of pairs.values()) await recomputeFinalScore(p.assignmentId, p.studentId);
  return changed;
}
