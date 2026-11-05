/**
 * Bank health reads (relearning revamp "Teacher side"; the rule is `src/lib/bank-health.ts`): for
 * a set of banks, their live questions with the learning targets they're tagged to, and the
 * course targets to count them against. Two queries for any number of banks. Reads only; callers
 * pass the guards first.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { bankHealth, type BankHealth, type HealthQuestion } from "@/lib/bank-health";

export async function loadBankHealth(
  banks: { id: string; courseId: string | null }[]
): Promise<Map<string, BankHealth>> {
  const out = new Map<string, BankHealth>();
  if (banks.length === 0) return out;
  const courseIds = [...new Set(banks.map((b) => b.courseId).filter((c): c is string => !!c))];
  const [rows, targets] = await Promise.all([
    db
      .select({
        bankId: schema.questions.bankId,
        questionId: schema.questions.id,
        difficulty: schema.questions.difficulty,
        type: schema.questions.type,
        grading: schema.questions.grading,
        targetId: schema.questionTargets.learningTargetId,
      })
      .from(schema.questions)
      .leftJoin(schema.questionTargets, eq(schema.questionTargets.questionId, schema.questions.id))
      .where(
        and(
          inArray(
            schema.questions.bankId,
            banks.map((b) => b.id)
          ),
          eq(schema.questions.isArchived, false)
        )
      ),
    courseIds.length
      ? db
          .select({
            id: schema.learningTargets.id,
            code: schema.learningTargets.code,
            title: schema.learningTargets.title,
            courseId: schema.learningTargets.courseId,
          })
          .from(schema.learningTargets)
          .where(inArray(schema.learningTargets.courseId, courseIds))
          .orderBy(asc(schema.learningTargets.sortOrder), asc(schema.learningTargets.code))
      : Promise.resolve([]),
  ]);
  const byBank = new Map<string, Map<string, HealthQuestion>>();
  for (const r of rows) {
    const qs = byBank.get(r.bankId) ?? new Map<string, HealthQuestion>();
    const q = qs.get(r.questionId) ?? {
      difficulty: r.difficulty,
      type: r.type,
      grading: r.grading,
      targetIds: [],
    };
    if (r.targetId) q.targetIds.push(r.targetId);
    qs.set(r.questionId, q);
    byBank.set(r.bankId, qs);
  }
  for (const b of banks) {
    // The dealer only draws a bank for its own course's targets.
    const courseTargets = targets
      .filter((t) => t.courseId === b.courseId)
      .map((t) => ({ id: t.id, code: t.code, title: t.title }));
    out.set(b.id, bankHealth([...(byBank.get(b.id)?.values() ?? [])], courseTargets));
  }
  return out;
}
