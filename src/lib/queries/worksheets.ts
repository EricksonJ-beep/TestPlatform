/**
 * Worksheet reads (Ticket 1.14): the teacher's registry, one worksheet's
 * detail with its submissions and unmatched emails, and the students a
 * teacher can link an email to. Callers pass the guards first.
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { WorksheetCountsAs } from "@/db/types";

export type TargetRef = { id: string; code: string; title: string };

export type WorksheetRow = {
  id: string;
  scriptId: string;
  title: string | null;
  studentUrl: string | null;
  countsAs: WorksheetCountsAs;
  registered: boolean;
  ownerId: string | null;
  courseId: string | null;
  courseName: string | null;
  targets: TargetRef[];
  submits: number;
  students: number;
  unmatched: number;
  lastEventAt: Date | null;
};

async function targetsByWorksheet(ids: string[]): Promise<Map<string, TargetRef[]>> {
  const out = new Map<string, TargetRef[]>();
  if (ids.length === 0) return out;
  const viaSets = await db
    .select({
      worksheetId: schema.practiceSets.worksheetId,
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
      sortOrder: schema.learningTargets.sortOrder,
    })
    .from(schema.practiceSetTargets)
    .innerJoin(schema.practiceSets, eq(schema.practiceSetTargets.practiceSetId, schema.practiceSets.id))
    .innerJoin(
      schema.learningTargets,
      eq(schema.practiceSetTargets.learningTargetId, schema.learningTargets.id)
    )
    .where(inArray(schema.practiceSets.worksheetId, ids));
  const viaActs = await db
    .select({
      worksheetId: schema.relearningActivities.worksheetId,
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
      sortOrder: schema.learningTargets.sortOrder,
    })
    .from(schema.activityTargets)
    .innerJoin(
      schema.relearningActivities,
      eq(schema.activityTargets.activityId, schema.relearningActivities.id)
    )
    .innerJoin(
      schema.learningTargets,
      eq(schema.activityTargets.learningTargetId, schema.learningTargets.id)
    )
    .where(inArray(schema.relearningActivities.worksheetId, ids));
  const seen = new Set<string>();
  for (const r of [...viaSets, ...viaActs].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)
  )) {
    if (!r.worksheetId) continue;
    const key = `${r.worksheetId}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (out.get(r.worksheetId) ?? out.set(r.worksheetId, []).get(r.worksheetId)!).push({
      id: r.id,
      code: r.code,
      title: r.title,
    });
  }
  return out;
}

const eventCounts = {
  submits: sql<number>`(select count(*)::int from ${schema.worksheetEvents} e where e.worksheet_id = ${schema.worksheets.id} and e.event = 'submit')`,
  students: sql<number>`(select count(distinct e.student_id)::int from ${schema.worksheetEvents} e where e.worksheet_id = ${schema.worksheets.id} and e.student_id is not null)`,
  unmatched: sql<number>`(select count(distinct e.email)::int from ${schema.worksheetEvents} e where e.worksheet_id = ${schema.worksheets.id} and e.student_id is null)`,
  lastEventAt: sql<
    Date | null
  >`(select max(e.occurred_at) from ${schema.worksheetEvents} e where e.worksheet_id = ${schema.worksheets.id})`,
};

/** Worksheets the teacher owns plus unregistered ones nobody owns yet (created by a first webhook). */
export async function listWorksheets(teacherId: string): Promise<WorksheetRow[]> {
  const rows = await db
    .select({
      id: schema.worksheets.id,
      scriptId: schema.worksheets.scriptId,
      title: schema.worksheets.title,
      studentUrl: schema.worksheets.studentUrl,
      countsAs: schema.worksheets.countsAs,
      registered: schema.worksheets.registered,
      ownerId: schema.worksheets.ownerId,
      courseId: schema.worksheets.courseId,
      courseName: schema.courses.name,
      ...eventCounts,
    })
    .from(schema.worksheets)
    .leftJoin(schema.courses, eq(schema.worksheets.courseId, schema.courses.id))
    .where(or(eq(schema.worksheets.ownerId, teacherId), isNull(schema.worksheets.ownerId)))
    .orderBy(asc(schema.worksheets.registered), desc(schema.worksheets.updatedAt));
  const targets = await targetsByWorksheet(rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    lastEventAt: r.lastEventAt ? new Date(r.lastEventAt) : null,
    targets: targets.get(r.id) ?? [],
  }));
}

export type WorksheetEventRow = {
  id: string;
  email: string;
  studentId: string | null;
  studentName: string | null;
  event: "submit" | "progress";
  score: number | null;
  sectionScores: Record<string, number> | null;
  cardsCorrect: number | null;
  totalCards: number | null;
  totalChecks: number | null;
  occurredAt: Date;
};

export type WorksheetDetail = WorksheetRow & {
  sectionTargetMap: Record<string, string>;
  /** Every section title the worksheet has ever reported, for the map editor. */
  sectionTitles: string[];
  events: WorksheetEventRow[];
  unmatchedEmails: { email: string; submits: number; lastAt: Date }[];
};

export async function getWorksheetDetail(worksheetId: string): Promise<WorksheetDetail | null> {
  const [row] = await db
    .select({
      id: schema.worksheets.id,
      scriptId: schema.worksheets.scriptId,
      title: schema.worksheets.title,
      studentUrl: schema.worksheets.studentUrl,
      countsAs: schema.worksheets.countsAs,
      registered: schema.worksheets.registered,
      ownerId: schema.worksheets.ownerId,
      courseId: schema.worksheets.courseId,
      courseName: schema.courses.name,
      sectionTargetMap: schema.worksheets.sectionTargetMap,
      ...eventCounts,
    })
    .from(schema.worksheets)
    .leftJoin(schema.courses, eq(schema.worksheets.courseId, schema.courses.id))
    .where(eq(schema.worksheets.id, worksheetId))
    .limit(1);
  if (!row) return null;
  const [targets, events, unmatched] = await Promise.all([
    targetsByWorksheet([worksheetId]),
    db
      .select({
        id: schema.worksheetEvents.id,
        email: schema.worksheetEvents.email,
        studentId: schema.worksheetEvents.studentId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        event: schema.worksheetEvents.event,
        score: schema.worksheetEvents.score,
        sectionScores: schema.worksheetEvents.sectionScores,
        cardsCorrect: schema.worksheetEvents.cardsCorrect,
        totalCards: schema.worksheetEvents.totalCards,
        totalChecks: schema.worksheetEvents.totalChecks,
        occurredAt: schema.worksheetEvents.occurredAt,
      })
      .from(schema.worksheetEvents)
      .leftJoin(schema.users, eq(schema.worksheetEvents.studentId, schema.users.id))
      .where(eq(schema.worksheetEvents.worksheetId, worksheetId))
      .orderBy(desc(schema.worksheetEvents.occurredAt))
      .limit(200),
    db
      .select({
        email: schema.worksheetEvents.email,
        submits: sql<number>`count(*) filter (where ${schema.worksheetEvents.event} = 'submit')::int`,
        lastAt: sql<Date>`max(${schema.worksheetEvents.occurredAt})`,
      })
      .from(schema.worksheetEvents)
      .where(
        and(eq(schema.worksheetEvents.worksheetId, worksheetId), isNull(schema.worksheetEvents.studentId))
      )
      .groupBy(schema.worksheetEvents.email)
      .orderBy(asc(schema.worksheetEvents.email)),
  ]);
  const sectionTitles = [
    ...new Set([
      ...Object.keys(row.sectionTargetMap ?? {}),
      ...events.flatMap((e) => Object.keys(e.sectionScores ?? {})),
    ]),
  ];
  return {
    ...row,
    lastEventAt: row.lastEventAt ? new Date(row.lastEventAt) : null,
    targets: targets.get(worksheetId) ?? [],
    sectionTargetMap: row.sectionTargetMap ?? {},
    sectionTitles,
    events: events.map(({ firstName, lastName, ...e }) => ({
      ...e,
      studentName: e.studentId ? `${lastName}, ${firstName}` : null,
    })),
    unmatchedEmails: unmatched.map((u) => ({ ...u, lastAt: new Date(u.lastAt) })),
  };
}

export type LinkableStudent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string | null;
};

/** Students in the teacher's classes, for "link this email to a student". */
export async function listLinkableStudents(teacherId: string): Promise<LinkableStudent[]> {
  return db
    .selectDistinct({
      id: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      username: schema.users.username,
    })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.enrollments.classId, schema.classes.id))
    .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
    .where(eq(schema.classes.ownerId, teacherId))
    .orderBy(asc(schema.users.lastName), asc(schema.users.firstName));
}

/** Unmatched submissions across the teacher's worksheets, for the dashboard. */
export async function countUnmatchedSubmissions(teacherId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.worksheetEvents)
    .innerJoin(schema.worksheets, eq(schema.worksheetEvents.worksheetId, schema.worksheets.id))
    .where(
      and(
        or(eq(schema.worksheets.ownerId, teacherId), isNull(schema.worksheets.ownerId)),
        isNull(schema.worksheetEvents.studentId),
        eq(schema.worksheetEvents.event, "submit")
      )
    );
  return r?.n ?? 0;
}
