/**
 * Seed (Ticket 0.9). Idempotent: safe to run twice.
 *
 *   npm run db:seed          (reads .env.local; needs DATABASE_URL)
 *
 * Creates:
 *   - organization "Cadott High School"
 *   - two teachers from SEED_TEACHER_* and SEED_COLLEAGUE_* env vars
 *   - one course each (Biology for the first teacher, Physical Science for the colleague)
 *   - a "Physical Science" question bank owned by the first teacher, shared co_edit
 *     with the colleague, plus a private "Biology" bank to prove sharing is scoped
 *   - one class per teacher with three demo students each
 *     (demo password: SEED_DEMO_PASSWORD or "bloom-demo-1234")
 */
import { and, eq, sql } from "drizzle-orm";
import { db, dbDriver, schema } from "../src/db";
import { hashPassword } from "../src/lib/password";

function env(name: string, fallback?: string): string {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing ${name} in .env.local (see .env.example).`);
}

const ORG_NAME = "Cadott High School";
const teacherEmail = env("SEED_TEACHER_EMAIL").toLowerCase();
const teacherPassword = env("SEED_TEACHER_PASSWORD");
const colleagueEmail = env("SEED_COLLEAGUE_EMAIL").toLowerCase();
const colleaguePassword = env("SEED_COLLEAGUE_PASSWORD");
const demoPassword = env("SEED_DEMO_PASSWORD", "bloom-demo-1234");

const log = (msg: string) => console.log(`[seed] ${msg}`);

async function upsertOrganization() {
  const found = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, ORG_NAME),
  });
  if (found) return found;
  const [row] = await db.insert(schema.organizations).values({ name: ORG_NAME }).returning();
  log(`created organization "${ORG_NAME}"`);
  return row;
}

async function upsertUser(input: {
  email: string;
  password: string;
  role: "teacher" | "student";
  firstName: string;
  lastName: string;
  organizationId: string;
  mustChangePassword?: boolean;
}) {
  const found = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = ${input.email}`,
  });
  if (found) {
    // Keep existing passwords: re-running the seed must not lock anyone out.
    if (found.organizationId !== input.organizationId) {
      await db
        .update(schema.users)
        .set({ organizationId: input.organizationId })
        .where(eq(schema.users.id, found.id));
    }
    return { ...found, created: false };
  }
  const [row] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      organizationId: input.organizationId,
      mustChangePassword: input.mustChangePassword ?? false,
    })
    .returning();
  log(`created ${input.role} ${input.email}`);
  return { ...row, created: true };
}

async function upsertCourse(ownerId: string, organizationId: string, name: string) {
  const found = await db.query.courses.findFirst({
    where: and(eq(schema.courses.ownerId, ownerId), eq(schema.courses.name, name)),
  });
  if (found) return found;
  const [row] = await db
    .insert(schema.courses)
    .values({ ownerId, organizationId, name })
    .returning();
  log(`created course "${name}"`);
  return row;
}

async function upsertBank(
  ownerId: string,
  courseId: string | null,
  name: string,
  description: string
) {
  const found = await db.query.questionBanks.findFirst({
    where: and(eq(schema.questionBanks.ownerId, ownerId), eq(schema.questionBanks.name, name)),
  });
  if (found) return found;
  const [row] = await db
    .insert(schema.questionBanks)
    .values({ ownerId, courseId, name, description })
    .returning();
  log(`created question bank "${name}"`);
  return row;
}

async function upsertShare(
  resourceType: "question_bank" | "assessment",
  resourceId: string,
  ownerId: string,
  sharedWithUserId: string,
  permission: "view" | "copy" | "co_edit"
) {
  const found = await db.query.shares.findFirst({
    where: and(
      eq(schema.shares.resourceType, resourceType),
      eq(schema.shares.resourceId, resourceId),
      eq(schema.shares.sharedWithUserId, sharedWithUserId)
    ),
  });
  if (found) {
    if (found.permission !== permission) {
      await db.update(schema.shares).set({ permission }).where(eq(schema.shares.id, found.id));
      log(`updated share to ${permission}`);
    }
    return found;
  }
  const [row] = await db
    .insert(schema.shares)
    .values({ resourceType, resourceId, ownerId, sharedWithUserId, permission })
    .returning();
  log(`shared ${resourceType} with ${sharedWithUserId} (${permission})`);
  return row;
}

async function upsertClass(
  ownerId: string,
  courseId: string,
  name: string,
  period: string,
  term: string
) {
  const found = await db.query.classes.findFirst({
    where: and(eq(schema.classes.ownerId, ownerId), eq(schema.classes.name, name)),
  });
  if (found) return found;
  const [row] = await db
    .insert(schema.classes)
    .values({ ownerId, courseId, name, period, term })
    .returning();
  log(`created class "${name}"`);
  return row;
}

async function ensureEnrolled(classId: string, studentId: string) {
  const found = await db.query.enrollments.findFirst({
    where: and(
      eq(schema.enrollments.classId, classId),
      eq(schema.enrollments.studentId, studentId)
    ),
  });
  if (found) return;
  await db.insert(schema.enrollments).values({ classId, studentId });
}

const DEMO_STUDENTS = {
  biology: [
    ["Maya", "Rivera"],
    ["Dylan", "Kowalski"],
    ["Ava", "Peterson"],
  ],
  physsci: [
    ["Liam", "Weber"],
    ["Sofia", "Ortiz"],
    ["Carter", "Meyer"],
  ],
} as const;

async function main() {
  log(`database driver: ${dbDriver}`);
  const org = await upsertOrganization();

  const jon = await upsertUser({
    email: teacherEmail,
    password: teacherPassword,
    role: "teacher",
    firstName: "Jon",
    lastName: "Erickson",
    organizationId: org.id,
  });
  const colleague = await upsertUser({
    email: colleagueEmail,
    password: colleaguePassword,
    role: "teacher",
    firstName: "Physical Science",
    lastName: "Colleague",
    organizationId: org.id,
  });

  const biology = await upsertCourse(jon.id, org.id, "Biology");
  const physSci = await upsertCourse(colleague.id, org.id, "Physical Science");

  const sharedBank = await upsertBank(
    jon.id,
    null,
    "Physical Science",
    "Shared bank for the physical science team."
  );
  await upsertBank(jon.id, biology.id, "Biology", "Jon's private biology bank.");
  await upsertShare("question_bank", sharedBank.id, jon.id, colleague.id, "co_edit");

  const bioClass = await upsertClass(jon.id, biology.id, "Biology · Period 3", "3", "Fall 2026");
  const psClass = await upsertClass(
    colleague.id,
    physSci.id,
    "Physical Science · Period 1",
    "1",
    "Fall 2026"
  );

  const enroll = async (classId: string, list: readonly (readonly [string, string])[]) => {
    for (const [first, last] of list) {
      const student = await upsertUser({
        email: `${first}.${last}@example.com`.toLowerCase(),
        password: demoPassword,
        role: "student",
        firstName: first,
        lastName: last,
        organizationId: org.id,
        mustChangePassword: true,
      });
      await ensureEnrolled(classId, student.id);
    }
  };
  await enroll(bioClass.id, DEMO_STUDENTS.biology);
  await enroll(psClass.id, DEMO_STUDENTS.physsci);

  log("done.");
  console.log(`
  Teacher:    ${teacherEmail}
  Colleague:  ${colleagueEmail}
  Students:   maya.rivera@example.com, dylan.kowalski@example.com, ava.peterson@example.com (Biology · Period 3)
              liam.weber@example.com, sofia.ortiz@example.com, carter.meyer@example.com (Physical Science · Period 1)
  Demo student password: ${demoPassword}
  Teacher passwords come from .env.local (unchanged if the accounts already existed).
`);
}

await main();
process.exit(0);
