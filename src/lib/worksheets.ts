/**
 * Apps Script worksheet integration (PLAN.md §3.7a, Appendix B; Ticket 1.14).
 *
 * A worksheet's Code.gs POSTs to /api/integrations/worksheet on every final
 * submit. Bloom upserts the worksheet by script id (creating an unregistered
 * entry the teacher finishes tagging), stores the event idempotently on
 * (worksheet, email, at), matches the email to a student, and, once the
 * worksheet is registered, records a completion on the practice set and/or
 * activity it counts as, crediting targets by the section → target map. Every
 * completion recomputes the student's retake gates.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { recomputeGatesForStudent } from "@/lib/gates";
import { creditedTargets, normalizeStudentUrl, pendingScriptId } from "@/lib/worksheet-rules";

export * from "@/lib/worksheet-rules";

// ---------------------------------------------------------------------------
// Server: events and completions
// ---------------------------------------------------------------------------

export type WorksheetPayload = {
  scriptId: string;
  worksheet?: string | null;
  url?: string | null;
  email: string;
  at: Date;
  event: "submit" | "progress";
  score?: number | null;
  sectionScores?: Record<string, number> | null;
  cardsCorrect?: number | null;
  totalCards?: number | null;
  totalChecks?: number | null;
};

export type RecordResult = {
  worksheetId: string;
  eventId: string | null;
  duplicate: boolean;
  matched: boolean;
  registered: boolean;
  completed: boolean;
};

async function findStudentByEmail(email: string) {
  return db.query.users.findFirst({
    columns: { id: true },
    where: and(sql`lower(${schema.users.email}) = ${email}`, eq(schema.users.role, "student")),
  });
}

/** Webhook entry point. Idempotent on (worksheet, email, at). */
export async function recordWorksheetEvent(p: WorksheetPayload): Promise<RecordResult> {
  const email = p.email.trim().toLowerCase();
  const url = p.url ? normalizeStudentUrl(p.url) : null;
  let ws = await db.query.worksheets.findFirst({
    where: eq(schema.worksheets.scriptId, p.scriptId),
  });
  if (!ws && url) {
    // Registered by its student link before any webhook: adopt the real script id now.
    const pending = await db.query.worksheets.findFirst({
      where: eq(schema.worksheets.scriptId, pendingScriptId(url)),
    });
    if (pending) {
      [ws] = await db
        .update(schema.worksheets)
        .set({ scriptId: p.scriptId, title: pending.title ?? p.worksheet ?? null })
        .where(eq(schema.worksheets.id, pending.id))
        .returning();
    }
  }
  if (!ws) {
    [ws] = await db
      .insert(schema.worksheets)
      .values({
        scriptId: p.scriptId,
        title: p.worksheet ?? null,
        studentUrl: url,
        registered: false,
      })
      .returning();
  } else {
    const patch: { title?: string; studentUrl?: string } = {};
    if (!ws.title && p.worksheet) patch.title = p.worksheet;
    if (!ws.studentUrl && url) patch.studentUrl = url;
    if (Object.keys(patch).length) {
      await db.update(schema.worksheets).set(patch).where(eq(schema.worksheets.id, ws.id));
      if (patch.studentUrl)
        await db
          .update(schema.relearningActivities)
          .set({ url: patch.studentUrl })
          .where(eq(schema.relearningActivities.worksheetId, ws.id));
    }
  }
  const student = await findStudentByEmail(email);
  const inserted = await db
    .insert(schema.worksheetEvents)
    .values({
      worksheetId: ws.id,
      studentId: student?.id ?? null,
      email,
      event: p.event,
      score: p.score ?? null,
      sectionScores: p.sectionScores ?? null,
      cardsCorrect: p.cardsCorrect ?? null,
      totalCards: p.totalCards ?? null,
      totalChecks: p.totalChecks ?? null,
      occurredAt: p.at,
    })
    .onConflictDoNothing()
    .returning({ id: schema.worksheetEvents.id });
  const base = { worksheetId: ws.id, matched: !!student, registered: ws.registered };
  if (inserted.length === 0) return { ...base, eventId: null, duplicate: true, completed: false };
  let completed = false;
  if (student && p.event === "submit" && ws.registered)
    completed = await applyEventCompletion(inserted[0].id);
  return { ...base, eventId: inserted[0].id, duplicate: false, completed };
}

/** Targets the worksheet is tagged with: the union over its linked practice set and activity. */
export async function worksheetTargetIds(worksheetId: string): Promise<string[]> {
  const viaSets = await db
    .select({ id: schema.practiceSetTargets.learningTargetId })
    .from(schema.practiceSetTargets)
    .innerJoin(
      schema.practiceSets,
      eq(schema.practiceSetTargets.practiceSetId, schema.practiceSets.id)
    )
    .where(eq(schema.practiceSets.worksheetId, worksheetId));
  const viaActs = await db
    .select({ id: schema.activityTargets.learningTargetId })
    .from(schema.activityTargets)
    .innerJoin(
      schema.relearningActivities,
      eq(schema.activityTargets.activityId, schema.relearningActivities.id)
    )
    .where(eq(schema.relearningActivities.worksheetId, worksheetId));
  return [...new Set([...viaSets, ...viaActs].map((r) => r.id))];
}

/**
 * Turn one matched submit into completions on the worksheet's linked practice
 * set (one completed attempt per submit) and activity (one row per student,
 * credit accumulating across submits). Idempotent per event.
 */
export async function applyEventCompletion(eventId: string): Promise<boolean> {
  const ev = await db.query.worksheetEvents.findFirst({
    where: eq(schema.worksheetEvents.id, eventId),
  });
  if (!ev || !ev.studentId || ev.event !== "submit") return false;
  const ws = await db.query.worksheets.findFirst({
    where: eq(schema.worksheets.id, ev.worksheetId),
  });
  if (!ws || !ws.registered) return false;
  const sets = await db.query.practiceSets.findMany({
    columns: { id: true },
    where: eq(schema.practiceSets.worksheetId, ws.id),
  });
  const acts = await db.query.relearningActivities.findMany({
    columns: { id: true },
    where: eq(schema.relearningActivities.worksheetId, ws.id),
  });
  const targetIds = await worksheetTargetIds(ws.id);
  const credited = creditedTargets({
    sectionTargetMap: ws.sectionTargetMap ?? null,
    sectionScores: ev.sectionScores ?? null,
    targetIds,
  });
  const percent =
    ev.score ??
    (ev.totalCards ? Math.round((1000 * (ev.cardsCorrect ?? 0)) / ev.totalCards) / 10 : null);
  let did = false;
  for (const s of sets) {
    const exists = await db.$count(
      schema.practiceAttempts,
      and(
        eq(schema.practiceAttempts.practiceSetId, s.id),
        eq(schema.practiceAttempts.studentId, ev.studentId),
        sql`${schema.practiceAttempts.answers}->'_worksheet'->>'eventId' = ${eventId}`
      )
    );
    if (exists) continue;
    await db.insert(schema.practiceAttempts).values({
      studentId: ev.studentId,
      practiceSetId: s.id,
      questionSet: [],
      answers: {
        _worksheet: {
          eventId,
          creditedTargetIds: credited ?? undefined,
          cardsCorrect: ev.cardsCorrect,
          totalCards: ev.totalCards,
          totalChecks: ev.totalChecks,
        },
      },
      score: ev.cardsCorrect,
      maxScore: ev.totalCards,
      percent,
      startedAt: ev.occurredAt,
      completedAt: ev.occurredAt,
    });
    did = true;
  }
  for (const a of acts) {
    const prior = await db.query.activityCompletions.findFirst({
      columns: { evidence: true },
      where: and(
        eq(schema.activityCompletions.activityId, a.id),
        eq(schema.activityCompletions.studentId, ev.studentId)
      ),
    });
    const priorCredited = prior?.evidence?.creditedTargetIds;
    const merged =
      credited === null || !Array.isArray(priorCredited)
        ? (credited ?? undefined)
        : [...new Set([...priorCredited, ...credited])];
    const evidence = { worksheetEventId: eventId, creditedTargetIds: merged };
    await db
      .insert(schema.activityCompletions)
      .values({ studentId: ev.studentId, activityId: a.id, completedAt: ev.occurredAt, evidence })
      .onConflictDoUpdate({
        target: [schema.activityCompletions.studentId, schema.activityCompletions.activityId],
        set: { completedAt: ev.occurredAt, evidence },
      });
    did = true;
  }
  if (did) await recomputeGatesForStudent(ev.studentId);
  return did;
}

/** After registration, a map change, or a new student email: match what can be matched and apply every submit. */
export async function reprocessWorksheet(
  worksheetId: string
): Promise<{ matched: number; applied: number }> {
  const events = await db.query.worksheetEvents.findMany({
    where: eq(schema.worksheetEvents.worksheetId, worksheetId),
  });
  let matched = 0;
  let applied = 0;
  for (const ev of events) {
    let studentId = ev.studentId;
    if (!studentId) {
      const s = await findStudentByEmail(ev.email);
      if (!s) continue;
      studentId = s.id;
      await db
        .update(schema.worksheetEvents)
        .set({ studentId })
        .where(eq(schema.worksheetEvents.id, ev.id));
      matched++;
    }
    if (ev.event === "submit" && (await applyEventCompletion(ev.id))) applied++;
  }
  return { matched, applied };
}

/** After a student gains an email: attach their unmatched events everywhere and apply the submits. */
export async function reprocessEmail(email: string): Promise<{ matched: number; applied: number }> {
  const lower = email.trim().toLowerCase();
  const student = await findStudentByEmail(lower);
  if (!student) return { matched: 0, applied: 0 };
  const events = await db.query.worksheetEvents.findMany({
    where: and(eq(schema.worksheetEvents.email, lower), isNull(schema.worksheetEvents.studentId)),
  });
  if (events.length === 0) return { matched: 0, applied: 0 };
  await db
    .update(schema.worksheetEvents)
    .set({ studentId: student.id })
    .where(
      inArray(
        schema.worksheetEvents.id,
        events.map((e) => e.id)
      )
    );
  let applied = 0;
  for (const ev of events)
    if (ev.event === "submit" && (await applyEventCompletion(ev.id))) applied++;
  return { matched: events.length, applied };
}

/**
 * Keep the worksheet's linked practice set and/or activity in step with how
 * it counts, its title, its link, its course, and its targets. Linked items
 * are always published: a registered worksheet is live content.
 */
export async function syncLinkedContent(worksheetId: string, targetIds: string[]): Promise<void> {
  const ws = await db.query.worksheets.findFirst({ where: eq(schema.worksheets.id, worksheetId) });
  if (!ws || !ws.ownerId) return;
  const title = ws.title ?? "Worksheet";
  const wantSet: boolean = ws.countsAs === "practice" || ws.countsAs === "both";
  const wantAct: boolean = ws.countsAs === "activity" || ws.countsAs === "both";

  const sets = await db.query.practiceSets.findMany({
    columns: { id: true },
    where: eq(schema.practiceSets.worksheetId, worksheetId),
  });
  if (wantSet) {
    let setId = sets[0]?.id;
    if (!setId) {
      const [{ last }] = await db
        .select({ last: sql<number | null>`max(${schema.practiceSets.sortOrder})` })
        .from(schema.practiceSets)
        .where(eq(schema.practiceSets.ownerId, ws.ownerId));
      const [row] = await db
        .insert(schema.practiceSets)
        .values({
          ownerId: ws.ownerId,
          courseId: ws.courseId,
          title,
          worksheetId,
          isPublished: true,
          sortOrder: (last ?? -1) + 1,
        })
        .returning({ id: schema.practiceSets.id });
      setId = row.id;
    }
    await db
      .update(schema.practiceSets)
      .set({ title, courseId: ws.courseId, isPublished: true, poolId: null, drawCount: null })
      .where(eq(schema.practiceSets.id, setId));
    await db
      .delete(schema.practiceSetTargets)
      .where(eq(schema.practiceSetTargets.practiceSetId, setId));
    if (targetIds.length)
      await db
        .insert(schema.practiceSetTargets)
        .values(targetIds.map((learningTargetId) => ({ practiceSetId: setId!, learningTargetId })));
    for (const extra of sets.slice(1))
      await db.delete(schema.practiceSets).where(eq(schema.practiceSets.id, extra.id));
  } else if (sets.length) {
    await db.delete(schema.practiceSets).where(
      inArray(
        schema.practiceSets.id,
        sets.map((s) => s.id)
      )
    );
  }

  const acts = await db.query.relearningActivities.findMany({
    columns: { id: true },
    where: eq(schema.relearningActivities.worksheetId, worksheetId),
  });
  if (wantAct) {
    let actId = acts[0]?.id;
    if (!actId) {
      const [{ last }] = await db
        .select({ last: sql<number | null>`max(${schema.relearningActivities.sortOrder})` })
        .from(schema.relearningActivities)
        .where(eq(schema.relearningActivities.ownerId, ws.ownerId));
      const [row] = await db
        .insert(schema.relearningActivities)
        .values({
          ownerId: ws.ownerId,
          courseId: ws.courseId,
          kind: "worksheet",
          title,
          url: ws.studentUrl,
          worksheetId,
          isPublished: true,
          sortOrder: (last ?? -1) + 1,
        })
        .returning({ id: schema.relearningActivities.id });
      actId = row.id;
    }
    await db
      .update(schema.relearningActivities)
      .set({ title, courseId: ws.courseId, url: ws.studentUrl, isPublished: true })
      .where(eq(schema.relearningActivities.id, actId));
    await db.delete(schema.activityTargets).where(eq(schema.activityTargets.activityId, actId));
    if (targetIds.length)
      await db
        .insert(schema.activityTargets)
        .values(targetIds.map((learningTargetId) => ({ activityId: actId!, learningTargetId })));
    for (const extra of acts.slice(1))
      await db
        .delete(schema.relearningActivities)
        .where(eq(schema.relearningActivities.id, extra.id));
  } else if (acts.length) {
    await db.delete(schema.relearningActivities).where(
      inArray(
        schema.relearningActivities.id,
        acts.map((a) => a.id)
      )
    );
  }
}
