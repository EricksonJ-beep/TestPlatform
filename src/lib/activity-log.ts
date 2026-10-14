/**
 * Student activity log (Jon, Oct 1 2026): milestones only, so a teacher can
 * see when a student was active and what they did. Writes never throw: a
 * logging failure must not break the action that produced it. Oct 13 2026
 * (dashboard plan build step 5): pauses, asks to finish and resumes are
 * logged too, and the reads take a since and a kind filter.
 */
import { and, desc, eq, exists, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { ATTEMPT_KINDS, KIND_GROUP, type FeedGroup } from "@/lib/activity-filter";
import type { ClassPlace } from "@/lib/needs-you";
import type { PauseReason } from "@/lib/pause";

export type ActivityKind =
  | "login"
  | "class_joined"
  | "attempt_started"
  | "attempt_submitted"
  | "corrections_submitted"
  | "practice_completed"
  | "activity_completed"
  | "retake_requested"
  /** A test paused: Finish later, 10 minutes idle, or its window closed (Oct 13 2026). */
  | "test_paused"
  /** The student pressed "Ask my teacher to let me finish" on a paused test. */
  | "resume_requested"
  /** A paused test reopened, with the resume code or the teacher's Let them continue. */
  | "resumed";

export type ActivityDetail = {
  attemptNumber?: number;
  percent?: number | null;
  title?: string;
  className?: string;
  approved?: boolean;
  /** test_paused: why it paused. */
  reason?: PauseReason;
  /** resumed: the resume code, or the teacher's OK. */
  by?: "code" | "teacher";
};

export async function logActivity(entry: {
  userId: string;
  kind: ActivityKind;
  assignmentId?: string | null;
  detail?: ActivityDetail;
  /** When it happened, if not now (an idle pause is written when the attempt is next touched). */
  at?: Date;
}): Promise<void> {
  try {
    await db.insert(schema.activityLog).values({
      userId: entry.userId,
      kind: entry.kind,
      assignmentId: entry.assignmentId ?? null,
      detail: entry.detail ?? {},
      ...(entry.at ? { createdAt: entry.at } : {}),
    });
  } catch (err) {
    console.error("activity log write failed", err);
  }
}

export type ActivityRow = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  kind: ActivityKind;
  assignmentId: string | null;
  /** The assignment's assessment title, when the event has one. */
  assignmentTitle: string | null;
  detail: ActivityDetail;
  /** Where an assignment's event happened (its class); null for logins, practice and joins. */
  place: ClassPlace | null;
  createdAt: Date;
};

/** Plain-language line for one event, e.g. "Submitted attempt 2 on Lab Quiz · 80%". */
export function describeActivity(
  row: Pick<ActivityRow, "kind" | "assignmentTitle" | "detail">
): string {
  return `${activityLine(row)}${activityScore(row) ?? ""}`;
}

/**
 * The score an event carries, as " · 80%" (a submitted attempt that was auto-graded); null when
 * none. Kept apart from the line so "Hide scores" on the Dashboard (Jon, Oct 13 2026, decision 6:
 * the Dashboard is the projector view) can drop it.
 */
export function activityScore(row: Pick<ActivityRow, "kind" | "detail">): string | null {
  const p = row.detail.percent;
  return row.kind === "attempt_submitted" && p !== null && p !== undefined
    ? ` · ${Math.round(p)}%`
    : null;
}

/** The event's line without its score (`activityScore`), e.g. "Submitted attempt 2 on Lab Quiz". */
export function activityLine(
  row: Pick<ActivityRow, "kind" | "assignmentTitle" | "detail">
): string {
  const d = row.detail;
  const on = row.assignmentTitle ? ` on ${row.assignmentTitle}` : "";
  const test = row.assignmentTitle ?? "a test";
  const n = d.attemptNumber ? ` ${d.attemptNumber}` : "";
  switch (row.kind) {
    case "login":
      return "Logged in";
    case "class_joined":
      return d.className ? `Joined ${d.className}` : "Joined a class";
    case "attempt_started":
      // Jon, Oct 13 2026 (dashboard plan build step 5): a second or later try reads as a retake.
      return d.attemptNumber && d.attemptNumber > 1
        ? `Started retake (try ${d.attemptNumber})${on}`
        : `Started attempt${n}${on}`;
    case "attempt_submitted":
      return `Submitted attempt${n}${on}`;
    case "corrections_submitted":
      return `Submitted corrections${on}${d.approved ? " (auto-approved)" : ""}`;
    case "practice_completed":
      return d.title ? `Finished practice set ${d.title}` : "Finished a practice set";
    case "activity_completed":
      return d.title ? `Completed ${d.title}` : "Completed an activity";
    case "retake_requested":
      return `Asked for attempt${n}${on}`;
    case "test_paused":
      return d.reason === "student"
        ? `Chose Finish later${on}`
        : d.reason === "idle"
          ? `Paused${on} after 10 idle minutes`
          : d.reason === "closed"
            ? `Paused${on} when it closed`
            : `Paused${on}`;
    case "resume_requested":
      return `Asked to finish ${test}`;
    case "resumed":
      return d.by === "teacher"
        ? `Resumed ${test} (you let them continue)`
        : `Resumed ${test} with the resume code`;
  }
}

const baseSelect = {
  id: schema.activityLog.id,
  userId: schema.activityLog.userId,
  firstName: schema.users.firstName,
  lastName: schema.users.lastName,
  kind: schema.activityLog.kind,
  assignmentId: schema.activityLog.assignmentId,
  assignmentTitle: schema.assessments.title,
  detail: schema.activityLog.detail,
  className: schema.classes.name,
  period: schema.classes.period,
  courseName: schema.courses.name,
  createdAt: schema.activityLog.createdAt,
};

const shape = ({
  className,
  period,
  courseName,
  ...r
}: {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  kind: string;
  assignmentId: string | null;
  assignmentTitle: string | null;
  detail: Record<string, unknown>;
  className: string | null;
  period: string | null;
  courseName: string | null;
  createdAt: Date;
}): ActivityRow => ({
  ...r,
  kind: r.kind as ActivityKind,
  detail: r.detail as ActivityDetail,
  place: className === null ? null : { className, period, courseName },
});

/** The log joined to each event's assignment, its assessment (the title) and its class (the place). */
function feedQuery() {
  return db
    .select(baseSelect)
    .from(schema.activityLog)
    .innerJoin(schema.users, eq(schema.activityLog.userId, schema.users.id))
    .leftJoin(schema.assignments, eq(schema.activityLog.assignmentId, schema.assignments.id))
    .leftJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .leftJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .leftJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id));
}

/**
 * Rule (Jon, Oct 13 2026; research notes, Design 2): an event belongs to a set of classes when
 * the student is enrolled in one of them AND the event is either on an assignment of one of them
 * or tied to no assignment at all (logins, practice, activities, joins). A student's work in
 * another class (or another teacher's) never shows. `classIds` is a list or a subquery of ids.
 */
function inClasses(classIds: string[] | SQL): SQL {
  const ids = (col: typeof schema.enrollments.classId | typeof schema.assignments.classId) =>
    Array.isArray(classIds) ? inArray(col, classIds) : sql`${col} in ${classIds}`;
  return and(
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.enrollments)
        .where(
          and(
            ids(schema.enrollments.classId),
            eq(schema.enrollments.studentId, schema.activityLog.userId)
          )
        )
    ),
    or(isNull(schema.activityLog.assignmentId), ids(schema.assignments.classId))
  )!;
}

/**
 * The kind filter in SQL, mirroring `activityGroup`: attempt starts and submits are Tests on try
 * 1 and Retakes after; every other kind has one group (`KIND_GROUP`). Undefined = every kind.
 */
function inGroups(groups: readonly FeedGroup[] | undefined): SQL | undefined {
  if (!groups) return undefined;
  if (groups.length === 0) return sql`false`;
  const tryNumber = sql`coalesce((${schema.activityLog.detail}->>'attemptNumber')::int, 1)`;
  const attempt = inArray(schema.activityLog.kind, [...ATTEMPT_KINDS]);
  return or(
    ...groups.map((g) => {
      const kinds = Object.entries(KIND_GROUP)
        .filter(([, group]) => group === g)
        .map(([kind]) => kind);
      return or(
        kinds.length ? inArray(schema.activityLog.kind, kinds) : undefined,
        g === "tests" ? and(attempt, sql`${tryNumber} <= 1`) : undefined,
        g === "retakes" ? and(attempt, sql`${tryNumber} > 1`) : undefined
      );
    })
  );
}

export type ActivityReadOptions = {
  /** Only events at or after this moment. */
  since?: Date | null;
  /** Only these groups (`feedGroups`); undefined = every kind. */
  groups?: readonly FeedGroup[];
  limit?: number;
};

/**
 * Events of one class, newest first; optionally one student (Jon, Oct 1 2026). "This class" means
 * its own assignments plus its students' class-less events (`inClasses`), not what those students
 * did in their other classes (Oct 13 2026). Callers pass requireOwner first.
 */
export async function listClassActivity(
  classId: string,
  opts: ActivityReadOptions & { studentId?: string | null } = {}
): Promise<ActivityRow[]> {
  const rows = await feedQuery()
    .where(
      and(
        inClasses([classId]),
        opts.studentId ? eq(schema.activityLog.userId, opts.studentId) : undefined,
        opts.since ? gte(schema.activityLog.createdAt, opts.since) : undefined,
        inGroups(opts.groups)
      )
    )
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(opts.limit ?? 200);
  return rows.map(shape);
}

/**
 * Events across every class the teacher owns, newest first: the last `hours` (24 by default)
 * unless `since` is given. Same class rule as `listClassActivity`, over all the teacher's classes.
 */
export async function listRecentActivity(
  teacherId: string,
  opts: ActivityReadOptions & { hours?: number } = {}
): Promise<ActivityRow[]> {
  const since = opts.since ?? new Date(Date.now() - (opts.hours ?? 24) * 3_600_000);
  const teacherClasses = sql`(select c.id from ${schema.classes} c where c.owner_id = ${teacherId})`;
  const rows = await feedQuery()
    .where(
      and(
        gte(schema.activityLog.createdAt, since),
        inClasses(teacherClasses),
        inGroups(opts.groups)
      )
    )
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(opts.limit ?? 30);
  return rows.map(shape);
}

/**
 * When the newest event the Dashboard's Recent activity would show happened (epoch ms; 0 when
 * none), for the live stamp: the same class rule (`inClasses`, one class or all the teacher's),
 * the same `since` and the same kind groups as the feed, so a login with Logins off, an event in
 * another class, or a student's work for another teacher never forces a refresh (Oct 13 2026).
 */
export async function newestActivityAt(
  where: { classId: string } | { teacherId: string },
  opts: Pick<ActivityReadOptions, "since" | "groups">
): Promise<number> {
  const classes =
    "classId" in where
      ? [where.classId]
      : sql`(select c.id from ${schema.classes} c where c.owner_id = ${where.teacherId})`;
  const [row] = await db
    .select({ at: sql<Date | string | null>`max(${schema.activityLog.createdAt})` })
    .from(schema.activityLog)
    .leftJoin(schema.assignments, eq(schema.activityLog.assignmentId, schema.assignments.id))
    .where(
      and(
        inClasses(classes),
        opts.since ? gte(schema.activityLog.createdAt, opts.since) : undefined,
        inGroups(opts.groups)
      )
    );
  return row?.at ? new Date(row.at).getTime() : 0;
}
