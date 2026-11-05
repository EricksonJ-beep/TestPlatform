/**
 * The relearning walkthrough (Jon, Nov 5 2026: "Test course walkthrough"): a practice course with
 * the relearning path switched on and one practice class, so Jon can take a quiz and a test as a
 * pretend student and click through corrections → relearn → practice check → retake before
 * switching his real courses on. The content comes from the `walkthrough-*` content packs; this
 * makes the course and class they need first. Runs before the packs on every deploy and does
 * nothing once both exist; it never changes them after creating them (Jon can rename, archive or
 * turn things off), and it never creates a student (Jon adds his own from the class page, so the
 * password is shown only to him).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type WalkthroughSetup = { teacherEmail: string; course: string; class: string };

export function readWalkthroughSetup(
  file = join(process.cwd(), "content", "walkthrough", "setup.json")
): WalkthroughSetup {
  return JSON.parse(readFileSync(file, "utf8")) as WalkthroughSetup;
}

export type WalkthroughOutcome =
  | { status: "skipped"; reason: string }
  | { status: "ready"; courseId: string; classId: string; created: ("course" | "class")[] };

/** Switched on an hour before it is made, so every attempt in it is on the path (decision 26). */
const SWITCH_LEAD_MS = 60 * 60 * 1000;

export async function ensureWalkthrough(
  setup: WalkthroughSetup,
  now = new Date()
): Promise<WalkthroughOutcome> {
  const teacher = await db.query.users.findFirst({
    columns: { id: true, organizationId: true },
    where: sql`lower(${schema.users.email}) = ${setup.teacherEmail.trim().toLowerCase()}`,
  });
  if (!teacher) return { status: "skipped", reason: `no teacher ${setup.teacherEmail}` };
  const created: ("course" | "class")[] = [];
  let course = await db.query.courses.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.courses.ownerId, teacher.id),
      sql`lower(${schema.courses.name}) = ${setup.course.toLowerCase()}`
    ),
  });
  if (!course) {
    [course] = await db
      .insert(schema.courses)
      .values({
        ownerId: teacher.id,
        organizationId: teacher.organizationId,
        name: setup.course,
        relearningPathFrom: new Date(now.getTime() - SWITCH_LEAD_MS),
      })
      .returning({ id: schema.courses.id });
    created.push("course");
  }
  let cls = await db.query.classes.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.classes.ownerId, teacher.id),
      sql`lower(${schema.classes.name}) = ${setup.class.toLowerCase()}`
    ),
  });
  if (!cls) {
    [cls] = await db
      .insert(schema.classes)
      .values({ ownerId: teacher.id, courseId: course.id, name: setup.class, joinOpen: false })
      .returning({ id: schema.classes.id });
    created.push("class");
  }
  return { status: "ready", courseId: course.id, classId: cls.id, created };
}
