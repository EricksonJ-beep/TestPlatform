/**
 * Upsert a teacher's course structure: courses, ordered units, learning targets,
 * and one pool per target (PLAN.md §3.4: summatives draw per target). Idempotent:
 * matches courses by name, units by name, targets by code, pools by name, and
 * updates titles/descriptions in place, so it is safe to re-run after edits.
 *
 *   npm run db:seed:courses                      (owner = SEED_TEACHER_EMAIL, all definition files)
 *   npm run db:seed:courses -- --owner you@school.org biology
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";

export type TargetDefinition = { code: string; title: string; description?: string };
export type UnitDefinition = { name: string; targets: TargetDefinition[] };
export type CourseDefinition = { name: string; description?: string; units: UnitDefinition[] };

const log = (msg: string) => console.log(`[seed:courses] ${msg}`);

async function main() {
  const args = process.argv.slice(2);
  const ownerFlag = args.indexOf("--owner");
  const ownerEmail = (
    ownerFlag >= 0 ? args[ownerFlag + 1] : process.env.SEED_TEACHER_EMAIL
  )?.toLowerCase();
  if (!ownerEmail) throw new Error("Pass --owner <email> or set SEED_TEACHER_EMAIL.");
  const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--owner");
  const names = files.length ? files : ["biology"];

  const owner = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(schema.users.email, ownerEmail),
  });
  if (!owner) throw new Error(`No user with email ${ownerEmail}.`);

  for (const name of names) {
    const mod = (await import(`./courses/${name}.ts`)) as { courses: CourseDefinition[] };
    for (const def of mod.courses) await upsertCourse(owner.id, def);
  }
}

async function upsertCourse(ownerId: string, def: CourseDefinition) {
  let course = await db.query.courses.findFirst({
    where: and(
      eq(schema.courses.ownerId, ownerId),
      sql`lower(${schema.courses.name}) = ${def.name.toLowerCase()}`
    ),
  });
  if (course) {
    if (def.description && course.description !== def.description) {
      await db
        .update(schema.courses)
        .set({ description: def.description })
        .where(eq(schema.courses.id, course.id));
    }
    log(`course "${def.name}" exists`);
  } else {
    [course] = await db
      .insert(schema.courses)
      .values({ ownerId, name: def.name, description: def.description ?? null })
      .returning();
    log(`created course "${def.name}"`);
  }

  let targetOrder = 0;
  for (const [unitIndex, unitDef] of def.units.entries()) {
    let unit = await db.query.units.findFirst({
      where: and(
        eq(schema.units.courseId, course.id),
        sql`lower(${schema.units.name}) = ${unitDef.name.toLowerCase()}`
      ),
    });
    if (unit) {
      if (unit.sortOrder !== unitIndex)
        await db
          .update(schema.units)
          .set({ sortOrder: unitIndex })
          .where(eq(schema.units.id, unit.id));
    } else {
      [unit] = await db
        .insert(schema.units)
        .values({ courseId: course.id, name: unitDef.name, sortOrder: unitIndex })
        .returning();
      log(`  created unit "${unitDef.name}"`);
    }

    for (const t of unitDef.targets) {
      targetOrder++;
      const values = {
        title: t.title,
        description: t.description ?? null,
        unitId: unit.id,
        sortOrder: targetOrder,
      };
      let target = await db.query.learningTargets.findFirst({
        where: and(
          eq(schema.learningTargets.courseId, course.id),
          sql`lower(${schema.learningTargets.code}) = ${t.code.toLowerCase()}`
        ),
      });
      if (target) {
        await db
          .update(schema.learningTargets)
          .set(values)
          .where(eq(schema.learningTargets.id, target.id));
      } else {
        [target] = await db
          .insert(schema.learningTargets)
          .values({ courseId: course.id, code: t.code, ...values })
          .returning();
        log(`    created target ${t.code} · ${t.title}`);
      }

      const poolName = `Pool ${t.code}`;
      let pool = await db.query.questionPools.findFirst({
        where: and(
          eq(schema.questionPools.courseId, course.id),
          sql`lower(${schema.questionPools.name}) = ${poolName.toLowerCase()}`
        ),
      });
      if (!pool) {
        [pool] = await db
          .insert(schema.questionPools)
          .values({
            ownerId,
            courseId: course.id,
            name: poolName,
            description: `Questions for ${t.code} · ${t.title}`,
          })
          .returning();
      }
      await db
        .insert(schema.poolTargets)
        .values({ poolId: pool.id, learningTargetId: target.id })
        .onConflictDoNothing();
    }
  }
  const counts = {
    units: await db.$count(schema.units, eq(schema.units.courseId, course.id)),
    targets: await db.$count(
      schema.learningTargets,
      eq(schema.learningTargets.courseId, course.id)
    ),
    pools: await db.$count(schema.questionPools, eq(schema.questionPools.courseId, course.id)),
  };
  log(`"${def.name}": ${counts.units} units · ${counts.targets} targets · ${counts.pools} pools`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
