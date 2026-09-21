/**
 * Server-side authorization layer (PLAN.md §7, §3.12; PHASE0 Ticket 0.5).
 *
 * Every server action and route handler that touches data calls one of the
 * `require*` guards first. Each guard resolves the current session, checks the
 * rule written above it, and throws an AuthzError that `withAuthz` /
 * `withAuthzRoute` convert to a 401/403/404 result. The ESLint rule
 * `bloom/require-authz` fails the build when a "use server" export or an API
 * route handler has no guard.
 *
 * Roles: teachers own things; students are enrolled in things. Admin is
 * reserved (treated as a teacher for now). Scores are written only by server
 * code — no guard hands a client the ability to set them.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SharePermission } from "@/db/types";
import { getCurrentSession, type Session } from "@/lib/session";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type AuthzCode = "unauthenticated" | "forbidden" | "not_found";

export class AuthzError extends Error {
  readonly status: 401 | 403 | 404;
  constructor(
    readonly code: AuthzCode,
    message?: string
  ) {
    super(message ?? defaultMessage[code]);
    this.name = "AuthzError";
    this.status = code === "unauthenticated" ? 401 : code === "not_found" ? 404 : 403;
  }
}

const defaultMessage: Record<AuthzCode, string> = {
  unauthenticated: "Please log in.",
  forbidden: "You don't have access to that.",
  not_found: "That item doesn't exist.",
};

export function isAuthzError(err: unknown): err is AuthzError {
  return err instanceof AuthzError;
}

const forbidden = (msg?: string) => new AuthzError("forbidden", msg);
const notFound = (msg?: string) => new AuthzError("not_found", msg);

// ---------------------------------------------------------------------------
// Session + role guards
// ---------------------------------------------------------------------------

// Rule: every data request must carry a valid session; anonymous requests get 401.
export async function requireSession(): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) throw new AuthzError("unauthenticated");
  return session;
}

// Rule: teacher surfaces (banks, assessments, classes, assignments, results) need role=teacher (admin counts).
export async function requireTeacher(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "teacher" && session.role !== "admin") {
    throw forbidden("Teachers only.");
  }
  return session;
}

// Rule: student surfaces need role=student; a teacher cannot act as a student.
export async function requireStudent(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "student") throw forbidden("Students only.");
  return session;
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

export type OwnedResourceType =
  | "course"
  | "question_bank"
  | "question_pool"
  | "question"
  | "stimulus"
  | "question_template"
  | "assessment"
  | "class"
  | "assignment"
  | "practice_set"
  | "relearning_activity"
  | "worksheet";

export type ResourceRef = { type: OwnedResourceType; id: string };

/** Every ownable table has `id` and `owner_id`; this maps the public type name to its table. */
const ownerTables = {
  course: schema.courses,
  question_bank: schema.questionBanks,
  question_pool: schema.questionPools,
  question: schema.questions,
  stimulus: schema.stimuli,
  question_template: schema.questionTemplates,
  assessment: schema.assessments,
  class: schema.classes,
  assignment: schema.assignments,
  practice_set: schema.practiceSets,
  relearning_activity: schema.relearningActivities,
  worksheet: schema.worksheets,
} satisfies Record<OwnedResourceType, unknown>;

/** undefined = row does not exist; null = row exists but has no owner. */
async function ownerOf(ref: ResourceRef): Promise<string | null | undefined> {
  // All tables in the map share the `id` / `ownerId` column shape, so one query serves them all.
  const table = ownerTables[ref.type] as typeof schema.classes;
  const rows = await db
    .select({ ownerId: table.ownerId })
    .from(table)
    .where(eq(table.id, ref.id))
    .limit(1);
  return rows.length === 0 ? undefined : rows[0].ownerId;
}

// Rule: a teacher may read or write a resource only if owner_id is their own user id.
export async function requireOwner(ref: ResourceRef): Promise<Session> {
  const session = await requireTeacher();
  const owner = await ownerOf(ref);
  if (owner === undefined) throw notFound();
  if (owner !== session.userId) throw forbidden("Only the owner can do that.");
  return session;
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

const permissionRank: Record<SharePermission, number> = { view: 0, copy: 1, co_edit: 2 };

export type SharedResourceRef = { type: "question_bank" | "assessment"; id: string };
export type SharedAccess = Session & { access: "owner" | SharePermission };

// Rule: a bank or assessment may be used by a non-owner only through a `shares` row at or above the needed permission (view < copy < co_edit). Owners always pass.
export async function requireShared(
  ref: SharedResourceRef,
  permission: SharePermission
): Promise<SharedAccess> {
  const session = await requireTeacher();
  const owner = await ownerOf(ref);
  if (owner === undefined) throw notFound();
  if (owner === session.userId) return { ...session, access: "owner" };

  const share = await db.query.shares.findFirst({
    columns: { permission: true },
    where: and(
      eq(schema.shares.resourceType, ref.type),
      eq(schema.shares.resourceId, ref.id),
      eq(schema.shares.sharedWithUserId, session.userId)
    ),
  });
  if (!share) throw forbidden("This isn't shared with you.");
  if (permissionRank[share.permission] < permissionRank[permission]) {
    throw forbidden(`You have ${share.permission} access; ${permission} is required.`);
  }
  return { ...session, access: share.permission };
}

// ---------------------------------------------------------------------------
// Students: enrollment, assignments, attempts
// ---------------------------------------------------------------------------

// Rule: a student sees a class (its assignments and practice) only while enrolled in it.
export async function requireEnrolled(classId: string): Promise<Session> {
  const session = await requireStudent();
  const enrollment = await db.query.enrollments.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.enrollments.classId, classId),
      eq(schema.enrollments.studentId, session.userId)
    ),
  });
  if (!enrollment) throw forbidden("You're not in this class.");
  return session;
}

export type AssignmentAccess = Session & { as: "teacher" | "student"; classId: string };

// Rule: an assignment is visible to the teacher who owns it and to students enrolled in its class; nobody else.
export async function requireAssignmentAccess(assignmentId: string): Promise<AssignmentAccess> {
  const session = await requireSession();
  const assignment = await db.query.assignments.findFirst({
    columns: { ownerId: true, classId: true },
    where: eq(schema.assignments.id, assignmentId),
  });
  if (!assignment) throw notFound();

  if (session.role === "teacher" || session.role === "admin") {
    if (assignment.ownerId !== session.userId) throw forbidden();
    return { ...session, as: "teacher", classId: assignment.classId };
  }
  const enrollment = await db.query.enrollments.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.enrollments.classId, assignment.classId),
      eq(schema.enrollments.studentId, session.userId)
    ),
  });
  if (!enrollment) throw forbidden();
  return { ...session, as: "student", classId: assignment.classId };
}

export type AttemptAccess = Session & {
  as: "teacher" | "student";
  attempt: { id: string; studentId: string; assignmentId: string };
};

// Rule: an attempt and its responses/corrections belong to one student; only that student, or the teacher who owns the assignment, may touch it.
export async function requireAttemptAccess(attemptId: string): Promise<AttemptAccess> {
  const session = await requireSession();
  const attempt = await db.query.attempts.findFirst({
    columns: { id: true, studentId: true, assignmentId: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt) throw notFound();

  if (session.role === "student") {
    if (attempt.studentId !== session.userId) throw forbidden();
    return { ...session, as: "student", attempt };
  }
  const assignment = await db.query.assignments.findFirst({
    columns: { ownerId: true },
    where: eq(schema.assignments.id, attempt.assignmentId),
  });
  if (!assignment || assignment.ownerId !== session.userId) throw forbidden();
  return { ...session, as: "teacher", attempt };
}

// Rule: a student may create or change only their own attempts, responses, and corrections (the row's student_id must equal their own id).
export function assertOwnStudentRow(session: Session, row: { studentId: string }): void {
  if (session.role !== "student" || row.studentId !== session.userId) throw forbidden();
}

// ---------------------------------------------------------------------------
// Wrappers for server actions and route handlers
// ---------------------------------------------------------------------------

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; fieldErrors?: Record<string, string[]> };

export class ActionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = "ActionError";
  }
}

/**
 * Wrap a server action so authorization failures become `{ ok: false, status }`
 * instead of an unhandled error. The wrapped function must still call a guard.
 */
export function withAuthz<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<ActionResult<T>> {
  return async (...args: A) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      if (isAuthzError(err)) return { ok: false, status: err.status, error: err.message };
      if (err instanceof ActionError) {
        return { ok: false, status: err.status, error: err.message, fieldErrors: err.fieldErrors };
      }
      throw err;
    }
  };
}

type RouteHandler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

/** Wrap a route handler so AuthzError becomes a JSON 401/403/404 response. */
export function withAuthzRoute<Ctx = unknown>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (isAuthzError(err)) {
        return Response.json({ error: err.message, code: err.code }, { status: err.status });
      }
      throw err;
    }
  };
}

/** Marks a route handler as intentionally unauthenticated (health checks, webhooks with their own secret). */
export function publicRoute<Ctx = unknown>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return handler;
}
