/**
 * Server-only master codes (Jon, Nov 20 2026; the rule is in src/lib/master-code.ts): read,
 * issue, end and check a teacher's master code. Nothing here checks who is asking; the
 * actions do.
 */
import { and, desc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { codesMatch } from "@/lib/assignments";
import { generateMasterCode, masterCodeEnd } from "@/lib/master-code";

/** The teacher's master code that is still good, if any. */
export async function currentMasterCode(
  teacherId: string,
  now = new Date()
): Promise<{ code: string; expiresAt: Date } | null> {
  const row = await db.query.masterCodes.findFirst({
    columns: { code: true, expiresAt: true },
    where: and(eq(schema.masterCodes.teacherId, teacherId), gt(schema.masterCodes.expiresAt, now)),
    orderBy: [desc(schema.masterCodes.expiresAt)],
  });
  return row ?? null;
}

/** Stop the teacher's running master code now. */
export async function endMasterCode(teacherId: string, now = new Date()): Promise<void> {
  await db
    .update(schema.masterCodes)
    .set({ expiresAt: now })
    .where(and(eq(schema.masterCodes.teacherId, teacherId), gt(schema.masterCodes.expiresAt, now)));
}

/** A fresh master code, good until 3:30 PM school time; the earlier one stops working. */
export async function issueMasterCode(
  teacherId: string,
  now = new Date()
): Promise<{ code: string; expiresAt: Date }> {
  await endMasterCode(teacherId, now);
  const code = generateMasterCode();
  const expiresAt = masterCodeEnd(now);
  await db.insert(schema.masterCodes).values({ teacherId, code, expiresAt });
  return { code, expiresAt };
}

/** Whether `given` is the teacher's master code right now. */
export async function masterCodeValid(
  teacherId: string,
  given: string,
  now = new Date()
): Promise<boolean> {
  if (!given.trim()) return false;
  const current = await currentMasterCode(teacherId, now);
  return !!current && codesMatch(given, current.code);
}
