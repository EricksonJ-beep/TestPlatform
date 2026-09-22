/**
 * Course structure reads: courses, units, learning targets, pools.
 * Callers must have passed requireTeacher() / requireOwner() first.
 */
import { asc, count, countDistinct, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type CourseSummary = {
  id: string;
  name: string;
  description: string | null;
  units: number;
  targets: number;
  pools: number;
  classes: number;
};

export async function listCourses(teacherId: string): Promise<CourseSummary[]> {
  return db
    .select({
      id: schema.courses.id,
      name: schema.courses.name,
      description: schema.courses.description,
      units: countDistinct(schema.units.id),
      targets: countDistinct(schema.learningTargets.id),
      pools: countDistinct(schema.questionPools.id),
      classes: countDistinct(schema.classes.id),
    })
    .from(schema.courses)
    .leftJoin(schema.units, eq(schema.units.courseId, schema.courses.id))
    .leftJoin(schema.learningTargets, eq(schema.learningTargets.courseId, schema.courses.id))
    .leftJoin(schema.questionPools, eq(schema.questionPools.courseId, schema.courses.id))
    .leftJoin(schema.classes, eq(schema.classes.courseId, schema.courses.id))
    .where(eq(schema.courses.ownerId, teacherId))
    .groupBy(schema.courses.id)
    .orderBy(asc(schema.courses.name));
}

export type UnitRow = { id: string; name: string; sortOrder: number; targets: number };
export type TargetRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  unitId: string | null;
  sortOrder: number;
  questions: number;
};
export type PoolRow = {
  id: string;
  name: string;
  description: string | null;
  questions: number;
  targetIds: string[];
};

export async function getCourseDetail(courseId: string) {
  const course = await db.query.courses.findFirst({ where: eq(schema.courses.id, courseId) });
  if (!course) return null;

  const units: UnitRow[] = await db
    .select({
      id: schema.units.id,
      name: schema.units.name,
      sortOrder: schema.units.sortOrder,
      targets: count(schema.learningTargets.id),
    })
    .from(schema.units)
    .leftJoin(schema.learningTargets, eq(schema.learningTargets.unitId, schema.units.id))
    .where(eq(schema.units.courseId, courseId))
    .groupBy(schema.units.id)
    .orderBy(asc(schema.units.sortOrder), asc(schema.units.name));

  const targets: TargetRow[] = await db
    .select({
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
      description: schema.learningTargets.description,
      unitId: schema.learningTargets.unitId,
      sortOrder: schema.learningTargets.sortOrder,
      questions: count(schema.questionTargets.questionId),
    })
    .from(schema.learningTargets)
    .leftJoin(
      schema.questionTargets,
      eq(schema.questionTargets.learningTargetId, schema.learningTargets.id)
    )
    .where(eq(schema.learningTargets.courseId, courseId))
    .groupBy(schema.learningTargets.id)
    .orderBy(asc(schema.learningTargets.sortOrder), asc(schema.learningTargets.code));

  const poolRows = await db
    .select({
      id: schema.questionPools.id,
      name: schema.questionPools.name,
      description: schema.questionPools.description,
      questions: countDistinct(schema.poolQuestions.questionId),
      targetIds: sql<
        string[]
      >`coalesce(array_agg(distinct ${schema.poolTargets.learningTargetId}) filter (where ${schema.poolTargets.learningTargetId} is not null), '{}')`,
    })
    .from(schema.questionPools)
    .leftJoin(schema.poolQuestions, eq(schema.poolQuestions.poolId, schema.questionPools.id))
    .leftJoin(schema.poolTargets, eq(schema.poolTargets.poolId, schema.questionPools.id))
    .where(eq(schema.questionPools.courseId, courseId))
    .groupBy(schema.questionPools.id)
    .orderBy(asc(schema.questionPools.name));
  const pools: PoolRow[] = poolRows.map((p) => ({ ...p, targetIds: p.targetIds ?? [] }));

  return { ...course, units, targets, pools };
}

/** Lightweight target list for pickers and chips. */
export async function listTargets(courseId: string) {
  return db
    .select({
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
    })
    .from(schema.learningTargets)
    .where(eq(schema.learningTargets.courseId, courseId))
    .orderBy(asc(schema.learningTargets.sortOrder), asc(schema.learningTargets.code));
}
