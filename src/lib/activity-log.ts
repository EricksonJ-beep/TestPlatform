/**
 * Student activity log (Jon, Oct 1 2026): milestones only, so a teacher can
 * see when a student was active and what they did. Writes never throw: a
 * logging failure must not break the action that produced it.
 */
import { and, desc, eq, exists, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type ActivityKind =
  | "login"
  | "class_joined"
  | "attempt_started"
  | "attempt_submitted"
  | "corrections_submitted"
  | "practice_completed"
  | "activity_completed"
  | "retake_requested";

export type ActivityDetail = {
  attemptNumber?: number;
  percent?: number | null;
  title?: string;
  className?: string;
  approved?: boolean;
};

export async function logActivity(entry: {
  userId: string;
  kind: ActivityKind;
  assignmentId?: string | null;
  detail?: ActivityDetail;
}): Promise<void> {
  try {
    await db.insert(schema.activityLog).values({
      userId: entry.userId,
      kind: entry.kind,
      assignmentId: entry.assignmentId ?? null,
      detail: entry.detail ?? {},
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
  createdAt: Date;
};

/** Plain-language line for one event, e.g. "Submitted attempt 2 on Lab Quiz · 80%". */
export function describeActivity(
  row: Pick<ActivityRow, "kind" | "assignmentTitle" | "detail">
): string {
  const d = row.detail;
  const on = row.assignmentTitle ? ` on ${row.assignmentTitle}` : "";
  const n = d.attemptNumber ? ` ${d.attemptNumber}` : "";
  switch (row.kind) {
    case "login":
      return "Logged in";
    case "class_joined":
      return d.className ? `Joined ${d.className}` : "Joined a class";
    case "attempt_started":
      return `Started attempt${n}${on}`;
    case "attempt_submitted":
      return `Submitted attempt${n}${on}${
        d.percent !== null && d.percent !== undefined ? ` · ${Math.round(d.percent)}%` : ""
      }`;
    case "corrections_submitted":
      return `Submitted corrections${on}${d.approved ? " (auto-approved)" : ""}`;
    case "practice_completed":
      return d.title ? `Finished practice set ${d.title}` : "Finished a practice set";
    case "activity_completed":
      return d.title ? `Completed ${d.title}` : "Completed an activity";
    case "retake_requested":
      return `Asked for attempt${n}${on}`;
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
  createdAt: schema.activityLog.createdAt,
};

const shape = (r: {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  kind: string;
  assignmentId: string | null;
  assignmentTitle: string | null;
  detail: Record<string, unknown>;
  createdAt: Date;
}): ActivityRow => ({
  ...r,
  kind: r.kind as ActivityKind,
  detail: r.detail as ActivityDetail,
});

/** Events for one class's students, newest first; optionally one student. Callers pass requireOwner first. */
export async function listClassActivity(
  classId: string,
  opts: { studentId?: string | null; limit?: number } = {}
): Promise<ActivityRow[]> {
  const rows = await db
    .select(baseSelect)
    .from(schema.activityLog)
    .innerJoin(schema.users, eq(schema.activityLog.userId, schema.users.id))
    .leftJoin(schema.assignments, eq(schema.activityLog.assignmentId, schema.assignments.id))
    .leftJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(
      and(
        exists(
          db
            .select({ one: sql`1` })
            .from(schema.enrollments)
            .where(
              and(
                eq(schema.enrollments.classId, classId),
                eq(schema.enrollments.studentId, schema.activityLog.userId)
              )
            )
        ),
        opts.studentId ? eq(schema.activityLog.userId, opts.studentId) : undefined
      )
    )
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(opts.limit ?? 200);
  return rows.map(shape);
}

/** Events across every class the teacher owns within the last `hours`, newest first. */
export async function listRecentActivity(
  teacherId: string,
  opts: { hours?: number; limit?: number } = {}
): Promise<ActivityRow[]> {
  const since = new Date(Date.now() - (opts.hours ?? 24) * 3_600_000);
  const rows = await db
    .select(baseSelect)
    .from(schema.activityLog)
    .innerJoin(schema.users, eq(schema.activityLog.userId, schema.users.id))
    .leftJoin(schema.assignments, eq(schema.activityLog.assignmentId, schema.assignments.id))
    .leftJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(
      and(
        gte(schema.activityLog.createdAt, since),
        exists(
          db
            .select({ one: sql`1` })
            .from(schema.enrollments)
            .innerJoin(schema.classes, eq(schema.enrollments.classId, schema.classes.id))
            .where(
              and(
                eq(schema.classes.ownerId, teacherId),
                eq(schema.enrollments.studentId, schema.activityLog.userId)
              )
            )
        )
      )
    )
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(opts.limit ?? 30);
  return rows.map(shape);
}
