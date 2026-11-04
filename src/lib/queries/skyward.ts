/**
 * Skyward export reads (ticket R8; the rules are `src/lib/skyward.ts`): the counting percents for
 * one assignment's Skyward files. A quiz gives one file per learning target (Jon enters formatives
 * per target), a test one file for the whole test. Callers pass the guards first.
 */
import { and, asc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  missingIds,
  skywardCsv,
  skywardFileName,
  type SkywardFile,
  type SkywardStudent,
} from "@/lib/skyward";

export type SkywardExport = {
  assignment: {
    id: string;
    title: string;
    className: string;
    type: "practice" | "formative" | "summative";
  };
  files: SkywardFile[];
  /** Students whose email gives no Skyward ID: their rows go out with a blank ID (K2). */
  missing: { name: string; email: string | null }[];
  /**
   * A quiz from before the relearning path with more than one target stores no per-target counting
   * score, so its target files use each target's best attempt; the page says so.
   */
  note: string | null;
};

export async function getSkywardExport(assignmentId: string): Promise<SkywardExport | null> {
  const [asg] = await db
    .select({
      id: schema.assignments.id,
      classId: schema.assignments.classId,
      assessmentId: schema.assignments.assessmentId,
      title: schema.assessments.title,
      type: schema.assessments.type,
      className: schema.classes.name,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!asg) return null;

  const [students, finals, sectionTargets, attemptTargets] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        lastName: schema.users.lastName,
        firstName: schema.users.firstName,
        email: schema.users.email,
      })
      .from(schema.enrollments)
      .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
      .where(eq(schema.enrollments.classId, asg.classId))
      .orderBy(asc(schema.users.lastName), asc(schema.users.firstName)),
    db
      .select({
        studentId: schema.assignmentFinalScores.studentId,
        percent: schema.assignmentFinalScores.percent,
        perTarget: schema.assignmentFinalScores.perTarget,
      })
      .from(schema.assignmentFinalScores)
      .where(eq(schema.assignmentFinalScores.assignmentId, assignmentId)),
    db
      .selectDistinct({ id: schema.assessmentSections.learningTargetId })
      .from(schema.assessmentSections)
      .where(
        and(
          eq(schema.assessmentSections.assessmentId, asg.assessmentId),
          isNotNull(schema.assessmentSections.learningTargetId)
        )
      ),
    // Every finished attempt's per-target percent (a quiz's best attempt per target, before the path).
    db
      .select({
        studentId: schema.attempts.studentId,
        learningTargetId: schema.attemptTargetScores.learningTargetId,
        percent: schema.attemptTargetScores.percent,
      })
      .from(schema.attemptTargetScores)
      .innerJoin(schema.attempts, eq(schema.attemptTargetScores.attemptId, schema.attempts.id))
      .where(
        and(
          eq(schema.attempts.assignmentId, assignmentId),
          ne(schema.attempts.status, "in_progress")
        )
      ),
  ]);
  const targetIds = [
    ...new Set([
      ...sectionTargets.map((s) => s.id!).filter(Boolean),
      ...attemptTargets.map((t) => t.learningTargetId),
      ...finals.flatMap((f) => Object.keys(f.perTarget)),
    ]),
  ];
  const targets = targetIds.length
    ? (
        await db
          .select({
            id: schema.learningTargets.id,
            code: schema.learningTargets.code,
            sortOrder: schema.learningTargets.sortOrder,
          })
          .from(schema.learningTargets)
          .where(inArray(schema.learningTargets.id, targetIds))
      ).sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, undefined, { numeric: true })
      )
    : [];
  const finalBy = new Map(finals.map((f) => [f.studentId, f]));
  const bestBy = new Map<string, number>();
  for (const t of attemptTargets) {
    const k = `${t.studentId}:${t.learningTargetId}`;
    bestBy.set(k, Math.max(bestBy.get(k) ?? 0, t.percent));
  }
  const row = (
    s: (typeof students)[number],
    percent: (f: (typeof finals)[number]) => number | null
  ): SkywardStudent => {
    const f = finalBy.get(s.id);
    return {
      lastName: s.lastName,
      firstName: s.firstName,
      email: s.email,
      percent: f ? percent(f) : null,
    };
  };

  let files: SkywardFile[];
  let note: string | null = null;
  if (asg.type === "formative" && targets.length > 0) {
    const single = targets.length === 1;
    files = targets.map((t) => {
      const rows = students.map((s) =>
        row(s, (f) => {
          if (t.id in f.perTarget) return f.perTarget[t.id].percent;
          if (single) return f.percent;
          note =
            "This quiz is from before the relearning path, so each target's file uses the student's best attempt on that target.";
          return bestBy.get(`${s.id}:${t.id}`) ?? null;
        })
      );
      return {
        name: skywardFileName({ kind: "target", code: t.code }),
        label: t.code,
        csv: skywardCsv(rows),
        rows: rows.length,
      };
    });
  } else {
    const rows = students.map((s) => row(s, (f) => f.percent));
    files = [
      {
        name:
          targets.length > 0
            ? skywardFileName({ kind: "test", codes: targets.map((t) => t.code) })
            : `${asg.type === "summative" ? "S" : "F"}_${asg.title.replace(/[^\w]+/g, "").slice(0, 30)}`,
        label: asg.type === "summative" ? "Whole test" : "Whole quiz",
        csv: skywardCsv(rows),
        rows: rows.length,
      },
    ];
  }
  return {
    assignment: { id: asg.id, title: asg.title, className: asg.className, type: asg.type },
    files,
    missing: missingIds(students),
    note,
  };
}
