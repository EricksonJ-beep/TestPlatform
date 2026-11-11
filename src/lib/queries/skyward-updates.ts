/**
 * Skyward updates reads and writes (Jon, Nov 5 2026; the rules are `src/lib/skyward-updates.ts`):
 * what Skyward has (`skyward_marks`), the assignments whose counting scores may have moved since,
 * and the changes themselves. A teacher with nothing tracked costs one small query. Callers pass the
 * guards first.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { schoolOffset } from "@/lib/reopen";
import { skywardScore, type SkywardFile } from "@/lib/skyward";
import {
  marksAsOf,
  skywardChanges,
  type HistoryEntry,
  type SkywardChange,
  type SkywardMark,
} from "@/lib/skyward-updates";
import { getSkywardExport, WHOLE, type SkywardExport } from "@/lib/queries/skyward";

/** Remember what Skyward now has for these files' students (each student with a score). */
export async function recordSkywardMarks(
  assignmentId: string,
  files: Pick<SkywardFile, "key" | "students">[],
  source: "export" | "marked",
  now = new Date()
): Promise<number> {
  const rows = files.flatMap((f) =>
    f.students.flatMap((s) => {
      const score = skywardScore(s.percent);
      return s.id && score !== null
        ? [{ assignmentId, columnKey: f.key, studentId: s.id, score, source, recordedAt: now }]
        : [];
    })
  );
  return writeMarks(rows);
}

async function writeMarks(
  rows: {
    assignmentId: string;
    columnKey: string;
    studentId: string;
    score: number;
    source: "export" | "marked";
    recordedAt: Date;
  }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  await db
    .insert(schema.skywardMarks)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        schema.skywardMarks.assignmentId,
        schema.skywardMarks.columnKey,
        schema.skywardMarks.studentId,
      ],
      set: {
        score: sql`excluded.score`,
        source: sql`excluded.source`,
        recordedAt: sql`excluded.recorded_at`,
      },
    });
  return rows.length;
}

/** The teacher's assignments with anything tracked, and those whose scores may have moved since. */
async function trackedAndMoved(teacherId: string): Promise<{ tracked: string[]; moved: string[] }> {
  const tracked = (
    await db
      .selectDistinct({ id: schema.skywardMarks.assignmentId })
      .from(schema.skywardMarks)
      .innerJoin(schema.assignments, eq(schema.skywardMarks.assignmentId, schema.assignments.id))
      .where(eq(schema.assignments.ownerId, teacherId))
  ).map((r) => r.id);
  if (tracked.length === 0) return { tracked, moved: [] };
  // Moved: a score change after a student's mark, or a counting score for a student never handed over.
  const [changed, fresh] = await Promise.all([
    db
      .selectDistinct({ id: schema.skywardMarks.assignmentId })
      .from(schema.skywardMarks)
      .innerJoin(
        schema.scoreHistory,
        and(
          eq(schema.scoreHistory.assignmentId, schema.skywardMarks.assignmentId),
          eq(schema.scoreHistory.studentId, schema.skywardMarks.studentId),
          gt(schema.scoreHistory.at, schema.skywardMarks.recordedAt)
        )
      )
      .where(inArray(schema.skywardMarks.assignmentId, tracked)),
    db
      .selectDistinct({ id: schema.assignmentFinalScores.assignmentId })
      .from(schema.assignmentFinalScores)
      .where(
        and(
          inArray(schema.assignmentFinalScores.assignmentId, tracked),
          sql`not exists (select 1 from ${schema.skywardMarks} m where m.assignment_id = ${schema.assignmentFinalScores.assignmentId} and m.student_id = ${schema.assignmentFinalScores.studentId})`
        )
      ),
  ]);
  return { tracked, moved: [...new Set([...changed, ...fresh].map((r) => r.id))] };
}

async function marksAndHistory(assignmentIds: string[]) {
  if (assignmentIds.length === 0)
    return { marks: new Map<string, SkywardMark[]>(), history: new Map<string, HistoryEntry[]>() };
  const [markRows, historyRows] = await Promise.all([
    db
      .select({
        assignmentId: schema.skywardMarks.assignmentId,
        columnKey: schema.skywardMarks.columnKey,
        studentId: schema.skywardMarks.studentId,
        score: schema.skywardMarks.score,
        recordedAt: schema.skywardMarks.recordedAt,
      })
      .from(schema.skywardMarks)
      .where(inArray(schema.skywardMarks.assignmentId, assignmentIds)),
    db
      .select({
        assignmentId: schema.scoreHistory.assignmentId,
        studentId: schema.scoreHistory.studentId,
        percent: schema.scoreHistory.percent,
        basis: schema.scoreHistory.basis,
        at: schema.scoreHistory.at,
      })
      .from(schema.scoreHistory)
      .where(inArray(schema.scoreHistory.assignmentId, assignmentIds)),
  ]);
  const group = <T extends { assignmentId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.assignmentId, [...(m.get(r.assignmentId) ?? []), r]);
    return m;
  };
  return { marks: group(markRows), history: group(historyRows) };
}

export type SkywardUpdateFile = {
  /** Its index in the assignment's Skyward export, for the download. */
  index: number;
  key: string;
  label: string;
  name: string;
  changes: SkywardChange[];
};

export type SkywardUpdateGroup = {
  assignment: SkywardExport["assignment"];
  files: SkywardUpdateFile[];
  total: number;
};

/** The changes to make in Skyward, per assignment and file; only files with something to change. */
export async function getSkywardUpdates(teacherId: string): Promise<{
  tracking: boolean;
  groups: SkywardUpdateGroup[];
}> {
  const { tracked, moved } = await trackedAndMoved(teacherId);
  if (moved.length === 0) return { tracking: tracked.length > 0, groups: [] };
  const [{ marks, history }, exports] = await Promise.all([
    marksAndHistory(moved),
    Promise.all(moved.map((id) => getSkywardExport(id))),
  ]);
  const groups: SkywardUpdateGroup[] = [];
  for (const ex of exports) {
    if (!ex) continue;
    const id = ex.assignment.id;
    const files = ex.files
      .map((f, index) => ({
        index,
        key: f.key,
        label: f.label,
        name: f.name,
        changes: skywardChanges({
          files: [f],
          marks: marks.get(id) ?? [],
          history: history.get(id) ?? [],
        }),
      }))
      .filter((f) => f.changes.length > 0);
    if (files.length)
      groups.push({
        assignment: ex.assignment,
        files,
        total: files.reduce((n, f) => n + f.changes.length, 0),
      });
  }
  groups.sort(
    (a, b) =>
      a.assignment.className.localeCompare(b.assignment.className, undefined, { numeric: true }) ||
      a.assignment.title.localeCompare(b.assignment.title, undefined, { numeric: true })
  );
  return { tracking: true, groups };
}

/** How many grades to change in Skyward, for Needs you. */
export async function countSkywardUpdates(teacherId: string): Promise<number> {
  const { groups } = await getSkywardUpdates(teacherId);
  return groups.reduce((n, g) => n + g.total, 0);
}

/** One assignment's files, cut to the rows that changed since the marks (the "changes only" files). */
export async function changedRowsOnly(ex: SkywardExport): Promise<SkywardFile[]> {
  const { marks, history } = await marksAndHistory([ex.assignment.id]);
  const id = ex.assignment.id;
  return ex.files.map((f) => {
    const changed = new Set(
      skywardChanges({
        files: [f],
        marks: marks.get(id) ?? [],
        history: history.get(id) ?? [],
      }).map((c) => c.studentId)
    );
    const students = f.students.filter((s) => s.id && changed.has(s.id));
    return { ...f, students, rows: students.length };
  });
}

/** The end of a school day ("2026-11-05" → 11:59:59 pm Central that day), as an instant. */
export function endOfSchoolDay(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  return new Date(wall - schoolOffset(new Date(wall)));
}

/**
 * "I entered everything in Skyward up to <date>" for one course's quizzes and tests (`marksAsOf`):
 * marks what Skyward has as of then, so the page lists what changed after. Assignments already
 * tracked are left alone.
 */
export async function startSkywardTracking(
  teacherId: string,
  courseId: string,
  asOf: Date,
  now = new Date()
): Promise<{ assignments: number; marks: number }> {
  const rows = await db
    .select({ id: schema.assignments.id })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(
      and(
        eq(schema.assignments.ownerId, teacherId),
        eq(schema.assessments.courseId, courseId),
        inArray(schema.assessments.type, ["formative", "summative"])
      )
    );
  const { tracked } = await trackedAndMoved(teacherId);
  const ids = rows.map((r) => r.id).filter((id) => !tracked.includes(id));
  if (ids.length === 0) return { assignments: 0, marks: 0 };
  const { history } = await marksAndHistory(ids);
  let marks = 0;
  let assignments = 0;
  // A few at a time: each export is a handful of reads.
  for (let i = 0; i < ids.length; i += 5) {
    const batch = await Promise.all(ids.slice(i, i + 5).map((id) => getSkywardExport(id)));
    for (const ex of batch) {
      if (!ex) continue;
      const found = marksAsOf({
        files: ex.files,
        history: history.get(ex.assignment.id) ?? [],
        asOf,
        wholeKey: WHOLE,
      });
      if (found.length === 0) continue;
      assignments++;
      marks += await writeMarks(
        found.map((m) => ({
          ...m,
          assignmentId: ex.assignment.id,
          source: "marked" as const,
          // Stamped with the chosen day, not today (fixed Nov 11 2026): the mark says "this is
          // what Skyward had then", so a score that moved between that day and now still shows.
          // Stamped with today, a retake in between counted as already entered.
          recordedAt: asOf.getTime() < now.getTime() ? asOf : now,
        }))
      );
    }
  }
  return { assignments, marks };
}
