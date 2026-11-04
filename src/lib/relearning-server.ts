/**
 * Server-only Read · Watch · Do (ticket R4; the rules are `src/lib/relearning.ts`, the path is
 * `src/lib/relearning-path.ts`). Starts a student's relearning on the targets the path says
 * (a quiz: one stitched bundle of its required targets plus any added, Q3; a test: one bundle per
 * required target, S2), lets them switch modes until they finish (A4), records progress (each
 * write one atomic statement, so a video's ticks and a quick check never overwrite each other),
 * finishes a row when every section is done (A3) and recomputes the final score so the practice
 * check opens. Also the teacher's check-off where nothing is built (A5) and the "won't play"
 * flags (A6). Callers pass the guards first. Nothing here writes a score.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { RelearningProgress } from "@/db/schema";
import { recomputeFinalScore } from "@/lib/attempts";
import { setOptIns } from "@/lib/gates";
import { getPathState, type PathContext } from "@/lib/queries/relearning-path";
import {
  gradeCheck,
  MODES,
  modeChoices,
  optionFor,
  rowDone,
  sectionDone,
  sectionsFor,
  servesExtension,
  type ModeChoice,
  type OptionInfo,
  type RelearningMode,
  type SectionInfo,
} from "@/lib/relearning";

/** A refusal the student sees, with its HTTP status. */
export class RelearningError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409
  ) {
    super(message);
    this.name = "RelearningError";
  }
}

const SHORT_ANSWER_MAX = 2000;

/** The teacher's options for these targets with their sections (published ones only, unless asked). */
export async function loadOptions(
  ownerId: string,
  targetIds: string[],
  { publishedOnly = true }: { publishedOnly?: boolean } = {}
): Promise<Map<string, OptionInfo[]>> {
  const out = new Map<string, OptionInfo[]>(targetIds.map((t) => [t, []]));
  if (targetIds.length === 0) return out;
  const options = await db
    .select({
      id: schema.relearningOptions.id,
      learningTargetId: schema.relearningOptions.learningTargetId,
      mode: schema.relearningOptions.mode,
      title: schema.relearningOptions.title,
      description: schema.relearningOptions.description,
    })
    .from(schema.relearningOptions)
    .where(
      and(
        eq(schema.relearningOptions.ownerId, ownerId),
        inArray(schema.relearningOptions.learningTargetId, targetIds),
        publishedOnly ? eq(schema.relearningOptions.isPublished, true) : undefined
      )
    );
  if (options.length === 0) return out;
  const sections = await loadSections({ optionIds: options.map((o) => o.id) });
  for (const o of options) {
    out.get(o.learningTargetId)?.push({
      ...o,
      sections: sections.filter((s) => s.optionId === o.id),
    });
  }
  return out;
}

async function loadSections(
  where: { optionIds: string[] } | { ids: string[] }
): Promise<(SectionInfo & { optionId: string })[]> {
  const ids = "ids" in where ? where.ids : where.optionIds;
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: schema.relearningSections.id,
      optionId: schema.relearningSections.optionId,
      part: schema.relearningSections.part,
      sortOrder: schema.relearningSections.sortOrder,
      title: schema.relearningSections.title,
      body: schema.relearningSections.body,
      checks: schema.relearningSections.checks,
      shortAnswerPrompt: schema.relearningSections.shortAnswerPrompt,
      estMinutes: schema.relearningSections.estMinutes,
      mediaAssetId: schema.relearningSections.mediaAssetId,
    })
    .from(schema.relearningSections)
    .where(
      "ids" in where
        ? inArray(schema.relearningSections.id, ids)
        : inArray(schema.relearningSections.optionId, ids)
    )
    .orderBy(asc(schema.relearningSections.part), asc(schema.relearningSections.sortOrder));
  return rows.map((r) => ({ ...r, checks: r.checks ?? [] }));
}

const rowColumns = {
  id: schema.relearningPaths.id,
  learningTargetId: schema.relearningPaths.learningTargetId,
  bundleId: schema.relearningPaths.bundleId,
  mode: schema.relearningPaths.mode,
  optionId: schema.relearningPaths.optionId,
  added: schema.relearningPaths.added,
  servedSectionIds: schema.relearningPaths.servedSectionIds,
  progress: schema.relearningPaths.progress,
  startedAt: schema.relearningPaths.startedAt,
  finishedAt: schema.relearningPaths.finishedAt,
  checkedOffBy: schema.relearningPaths.checkedOffBy,
};

export type RelearningRow = {
  id: string;
  learningTargetId: string;
  bundleId: string;
  mode: RelearningMode | null;
  optionId: string | null;
  added: boolean;
  servedSectionIds: string[];
  progress: RelearningProgress;
  startedAt: Date;
  finishedAt: Date | null;
  checkedOffBy: string | null;
};

async function loadRows(assignmentId: string, studentId: string): Promise<RelearningRow[]> {
  return db
    .select(rowColumns)
    .from(schema.relearningPaths)
    .where(
      and(
        eq(schema.relearningPaths.assignmentId, assignmentId),
        eq(schema.relearningPaths.studentId, studentId)
      )
    )
    .orderBy(asc(schema.relearningPaths.startedAt));
}

export type RelearnBundle = {
  /** Null until the student picks a mode. */
  bundleId: string | null;
  /** In course order. */
  targetIds: string[];
  /** Quiz, not started yet: 80%+ targets the student may tick to add for 100% (Q2). */
  addable: string[];
  mode: RelearningMode | null;
  /** Corrections are in (submitted or approved, Q7), so it can start; or it has started. */
  open: boolean;
  finished: boolean;
  rows: RelearningRow[];
};

export type RelearnPlan = {
  ctx: PathContext;
  ownerId: string;
  bundles: RelearnBundle[];
};

/**
 * What the student can relearn on an assignment: a quiz has one bundle (its required targets, plus
 * any it adds), a test one per required target (S2). A started bundle is whatever its rows say; a
 * bundle not yet started is open once its targets' corrections are in. Null off the path.
 */
export async function relearningPlan(
  assignmentId: string,
  studentId: string
): Promise<RelearnPlan | null> {
  const ctx = await getPathState(assignmentId, studentId);
  if (!ctx) return null;
  const [asg] = await db
    .select({ ownerId: schema.assignments.ownerId })
    .from(schema.assignments)
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!asg) return null;
  const rows = await loadRows(assignmentId, studentId);
  const targets = ctx.state.targets;
  const order = new Map(targets.map((t, i) => [t.id, i]));
  const byOrder = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  const started = new Map<string, RelearningRow[]>();
  for (const r of rows) {
    const list = started.get(r.bundleId);
    if (list) list.push(r);
    else started.set(r.bundleId, [r]);
  }
  const bundles: RelearnBundle[] = [...started.entries()].map(([bundleId, list]) => ({
    bundleId,
    targetIds: list.map((r) => r.learningTargetId).sort(byOrder),
    addable: [],
    mode: list.find((r) => r.mode)?.mode ?? null,
    open: true,
    finished: list.every((r) => r.finishedAt !== null),
    rows: list,
  }));
  const hasRow = new Set(rows.map((r) => r.learningTargetId));
  const correctionsIn = (id: string) => {
    const t = targets.find((x) => x.id === id);
    return t?.corrections === "done" || t?.corrections === "waiting";
  };
  const required = targets.filter((t) => t.role === "required" && !hasRow.has(t.id));
  if (ctx.state.type === "summative") {
    for (const t of required)
      bundles.push({
        bundleId: null,
        targetIds: [t.id],
        addable: [],
        mode: null,
        open: correctionsIn(t.id),
        finished: false,
        rows: [],
      });
  } else if (!bundles.some((b) => !b.finished) && (required.length || bundles.length === 0)) {
    // A quiz: its required targets not yet relearned, with the 80%+ ones it could add.
    const addable = targets
      .filter((t) => t.role === "optional" && !hasRow.has(t.id))
      .map((t) => t.id);
    if (required.length || addable.length)
      bundles.push({
        bundleId: null,
        targetIds: required.map((t) => t.id),
        addable,
        mode: null,
        // Required targets' corrections in; with none required, the targets added are checked at start.
        open: required.every((t) => correctionsIn(t.id)),
        finished: false,
        rows: [],
      });
  }
  bundles.sort((a, b) => byOrder(a.targetIds[0] ?? "", b.targetIds[0] ?? ""));
  return { ctx, ownerId: asg.ownerId, bundles };
}

/** The bundle a start or switch acts on: a test's by target; a quiz's open one. */
function pickBundle(plan: RelearnPlan, targetId: string | null): RelearnBundle {
  const bundle =
    plan.ctx.state.type === "summative"
      ? plan.bundles.find((b) => !!targetId && b.targetIds.includes(targetId))
      : (plan.bundles.find((b) => b.bundleId && !b.finished) ??
        plan.bundles.find((b) => !b.bundleId) ??
        plan.bundles.at(-1));
  if (!bundle) throw new RelearningError("There's nothing to relearn here right now.", 404);
  return bundle;
}

/** Each target's option and served sections for a mode (one target: core + extension). */
function serve(options: Map<string, OptionInfo[]>, targetIds: string[], mode: RelearningMode) {
  const withExtension = servesExtension(targetIds.length);
  return targetIds.map((t) => {
    const opt = optionFor(options.get(t) ?? [], mode);
    return {
      learningTargetId: t,
      optionId: opt?.id ?? null,
      servedSectionIds: opt ? sectionsFor(opt, withExtension).map((s) => s.id) : [],
    };
  });
}

/**
 * Start relearning in a mode, or switch an unfinished bundle to another (A4). A quiz may add 80%+
 * targets as it starts (Q2: they join the same activity and check, and their corrections come
 * into scope); a test starts one required target at a time.
 */
export async function startRelearning(input: {
  assignmentId: string;
  studentId: string;
  mode: RelearningMode;
  targetId?: string | null;
  add?: string[];
}): Promise<{ bundleId: string; switched: boolean }> {
  if (!MODES.includes(input.mode)) throw new RelearningError("Pick Read, Watch or Do.", 400);
  const plan = await relearningPlan(input.assignmentId, input.studentId);
  if (!plan) throw new RelearningError("There's no relearning on this assignment.", 404);
  const bundle = pickBundle(plan, input.targetId ?? null);
  if (bundle.finished) throw new RelearningError("You've finished this relearning.", 409);

  if (bundle.bundleId) {
    // A4: switch until finished. Progress keys are section ids, so nothing done is lost.
    const live = bundle.rows.filter((r) => !r.finishedAt && !r.checkedOffBy);
    const options = await loadOptions(plan.ownerId, bundle.targetIds);
    if (!modeChoices(options, bundle.targetIds).choices.some((c) => c.mode === input.mode))
      throw new RelearningError("That one isn't ready yet. Pick another.", 409);
    const served = new Map(
      serve(options, bundle.targetIds, input.mode).map((s) => [s.learningTargetId, s])
    );
    for (const r of live) {
      const s = served.get(r.learningTargetId)!;
      await db
        .update(schema.relearningPaths)
        .set({ mode: input.mode, optionId: s.optionId, servedSectionIds: s.servedSectionIds })
        .where(and(eq(schema.relearningPaths.id, r.id), isNull(schema.relearningPaths.finishedAt)));
    }
    return { bundleId: bundle.bundleId, switched: true };
  }

  const add = [...new Set(input.add ?? [])];
  for (const id of add)
    if (!bundle.addable.includes(id))
      throw new RelearningError("That target can't be added to this relearning.", 400);
  const targetIds = [...bundle.targetIds, ...add];
  if (targetIds.length === 0) throw new RelearningError("Pick a target to work on.", 400);
  const state = plan.ctx.state;
  const correctionsIn = (id: string) => {
    const t = state.targets.find((x) => x.id === id);
    // An added target's corrections come into scope now; its relearning can start alongside (Q7).
    return add.includes(id) || t?.corrections === "done" || t?.corrections === "waiting";
  };
  if (!bundle.open || !targetIds.every(correctionsIn))
    throw new RelearningError("Turn in your corrections first.", 403);

  const options = await loadOptions(plan.ownerId, targetIds);
  const { choices } = modeChoices(options, targetIds);
  if (choices.length === 0)
    throw new RelearningError("Your teacher will give you a relearning activity.", 409);
  if (!choices.some((c) => c.mode === input.mode))
    throw new RelearningError("That one isn't ready yet. Pick another.", 409);

  if (add.length) await setOptIns(input.assignmentId, input.studentId, add, true);
  const bundleId = crypto.randomUUID();
  await db
    .insert(schema.relearningPaths)
    .values(
      serve(options, targetIds, input.mode).map((s) => ({
        assignmentId: input.assignmentId,
        studentId: input.studentId,
        learningTargetId: s.learningTargetId,
        bundleId,
        mode: input.mode,
        optionId: s.optionId,
        added: add.includes(s.learningTargetId),
        servedSectionIds: s.servedSectionIds,
      }))
    )
    .onConflictDoNothing();
  await recomputeFinalScore(input.assignmentId, input.studentId);
  return { bundleId, switched: false };
}

/**
 * Quiz, after starting (Q2, decision 31): tick an 80%+ target to fold it into the unfinished
 * activity (cores only from then on), or untick it again before finishing. Once the activity is
 * finished, an added target gets an activity of its own. Its corrections come into scope.
 */
export async function setQuizTargetAdded(input: {
  assignmentId: string;
  studentId: string;
  targetId: string;
  added: boolean;
}): Promise<{ bundleId: string | null }> {
  const plan = await relearningPlan(input.assignmentId, input.studentId);
  if (!plan || plan.ctx.state.type !== "formative")
    throw new RelearningError("Only a quiz's targets can be added.", 409);
  const target = plan.ctx.state.targets.find((t) => t.id === input.targetId);
  if (!target || target.role !== "optional")
    throw new RelearningError("That target can't be added.", 400);
  const startedBundles = plan.bundles.filter((b) => b.bundleId);
  const row = startedBundles.flatMap((b) => b.rows).find((r) => r.learningTargetId === target.id);
  if (startedBundles.length === 0)
    throw new RelearningError("Pick Read, Watch or Do first; your pick can include it.", 409);

  if (input.added) {
    if (row) return { bundleId: row.bundleId };
    await setOptIns(input.assignmentId, input.studentId, [target.id], true);
    const open = startedBundles.find((b) => !b.finished);
    const latest = startedBundles.at(-1)!;
    const bundleId = open?.bundleId ?? crypto.randomUUID();
    const mode = (open ?? latest).mode ?? "read";
    const members = open ? [...open.targetIds, target.id] : [target.id];
    const options = await loadOptions(plan.ownerId, members);
    const served = serve(options, members, mode);
    const mine = served.find((s) => s.learningTargetId === target.id)!;
    await db
      .insert(schema.relearningPaths)
      .values({
        assignmentId: input.assignmentId,
        studentId: input.studentId,
        learningTargetId: target.id,
        bundleId,
        mode,
        added: true,
        optionId: mine.optionId,
        servedSectionIds: mine.servedSectionIds,
      })
      .onConflictDoNothing();
    if (open) await reserve(open, served);
    await recomputeFinalScore(input.assignmentId, input.studentId);
    return { bundleId };
  }

  if (!row || !row.added) throw new RelearningError("That target isn't added.", 409);
  const bundle = startedBundles.find((b) => b.bundleId === row.bundleId)!;
  if (row.finishedAt || bundle.finished)
    throw new RelearningError("You've finished that relearning, so it stays.", 409);
  await db.delete(schema.relearningPaths).where(eq(schema.relearningPaths.id, row.id));
  const rest = bundle.targetIds.filter((t) => t !== target.id);
  if (rest.length && bundle.mode) {
    const options = await loadOptions(plan.ownerId, rest);
    await reserve(
      { ...bundle, rows: bundle.rows.filter((r) => r.id !== row.id) },
      serve(options, rest, bundle.mode)
    );
  }
  await recomputeFinalScore(input.assignmentId, input.studentId);
  return { bundleId: rest.length ? bundle.bundleId : null };
}

/** A bundle's membership changed: each unfinished row serves what the new size calls for (Q3). */
async function reserve(
  bundle: RelearnBundle,
  served: { learningTargetId: string; optionId: string | null; servedSectionIds: string[] }[]
) {
  const by = new Map(served.map((s) => [s.learningTargetId, s]));
  for (const r of bundle.rows) {
    const s = by.get(r.learningTargetId);
    if (!s || r.finishedAt || r.checkedOffBy) continue;
    await db
      .update(schema.relearningPaths)
      .set({ optionId: s.optionId, servedSectionIds: s.servedSectionIds })
      .where(and(eq(schema.relearningPaths.id, r.id), isNull(schema.relearningPaths.finishedAt)));
  }
}

type RowRef = { id: string; studentId: string; assignmentId: string; bundleId: string };

/** The row and the section a progress event names, refusing a section the row didn't serve. */
async function rowSection(rowRef: RowRef, sectionId: string) {
  const [row] = await db
    .select(rowColumns)
    .from(schema.relearningPaths)
    .where(eq(schema.relearningPaths.id, rowRef.id))
    .limit(1);
  if (!row) throw new RelearningError("Not found.", 404);
  if (!row.servedSectionIds.includes(sectionId))
    throw new RelearningError("That part isn't in your relearning.", 404);
  const [section] = await loadSections({ ids: [sectionId] });
  if (!section) throw new RelearningError("That part was removed. Reload the page.", 404);
  return { row, section };
}

export type ProgressResult = { rowFinished: boolean; bundleFinished: boolean };

/** After a progress write: finish the row once every section is done, and say whether the bundle is. */
async function finishIfDone(rowRef: RowRef): Promise<ProgressResult> {
  const [row] = await db
    .select(rowColumns)
    .from(schema.relearningPaths)
    .where(eq(schema.relearningPaths.id, rowRef.id))
    .limit(1);
  if (!row) return { rowFinished: false, bundleFinished: false };
  let finished = row.finishedAt !== null;
  if (!finished) {
    const sections = await loadSections({ ids: row.servedSectionIds });
    if (rowDone(row, new Map(sections.map((s) => [s.id, s])), row.progress ?? {})) {
      const done = await db
        .update(schema.relearningPaths)
        .set({ finishedAt: new Date() })
        .where(
          and(eq(schema.relearningPaths.id, row.id), isNull(schema.relearningPaths.finishedAt))
        )
        .returning({ id: schema.relearningPaths.id });
      finished = true;
      // The practice check opens once the bundle is done (P5); a test's gates follow.
      if (done.length) await recomputeFinalScore(rowRef.assignmentId, rowRef.studentId);
    }
  }
  const open = await db.$count(
    schema.relearningPaths,
    and(
      eq(schema.relearningPaths.bundleId, rowRef.bundleId),
      isNull(schema.relearningPaths.finishedAt)
    )
  );
  return { rowFinished: finished, bundleFinished: finished && open === 0 };
}

/**
 * A3: a quick check, graded here; unlimited tries, and a right answer stays right. The explanation
 * comes back only with a right answer, so a wrong try can't read it off.
 */
export async function answerRelearningCheck(
  rowRef: RowRef,
  sectionId: string,
  checkId: string,
  answer: string
): Promise<ProgressResult & { correct: boolean; explanation: string | null }> {
  const { section } = await rowSection(rowRef, sectionId);
  const check = section.checks.find((c) => c.id === checkId);
  if (!check) throw new RelearningError("That question isn't here.", 404);
  const correct = gradeCheck(check, String(answer ?? ""));
  const now = new Date().toISOString();
  await db
    .update(schema.relearningPaths)
    .set({
      progress: sql`jsonb_set(
        coalesce(${schema.relearningPaths.progress}, '{}'::jsonb)
          || jsonb_build_object('checks', coalesce(${schema.relearningPaths.progress}->'checks', '{}'::jsonb)),
        array['checks', ${checkId}::text],
        jsonb_build_object(
          'correct', coalesce((${schema.relearningPaths.progress}->'checks'->${checkId}::text->>'correct')::boolean, false) or ${correct},
          'tries', coalesce((${schema.relearningPaths.progress}->'checks'->${checkId}::text->>'tries')::int, 0) + 1,
          'at', ${now}::text
        )
      )`,
    })
    .where(eq(schema.relearningPaths.id, rowRef.id));
  const result = await finishIfDone(rowRef);
  return { ...result, correct, explanation: correct ? (check.explanation ?? null) : null };
}

/**
 * A3: a section's own part, as the browser reports it: read to the end, a video's watched share
 * (it only ever goes up), or a Do page / deck / worked problem gone through.
 */
export async function markRelearningSection(
  rowRef: RowRef,
  sectionId: string,
  patch: { scrolledToEnd?: boolean; watchPercent?: number; completed?: boolean }
): Promise<ProgressResult> {
  const { section } = await rowSection(rowRef, sectionId);
  const type = section.body.type;
  const pct = Number(patch.watchPercent);
  const watch = type === "video" && Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null;
  const scrolled = type === "text" && patch.scrolledToEnd === true;
  const completed =
    (type === "interactive" || type === "flashcards" || type === "worked_steps") &&
    patch.completed === true;
  if (watch === null && !scrolled && !completed)
    throw new RelearningError("Nothing to save for this part.", 400);
  const current = sql`coalesce(${schema.relearningPaths.progress}->'sections'->${sectionId}::text, '{}'::jsonb)`;
  const next =
    watch !== null
      ? sql`${current} || jsonb_build_object('watchPercent', greatest(coalesce((${current}->>'watchPercent')::float8, 0), ${watch}::float8))`
      : scrolled
        ? sql`${current} || '{"scrolledToEnd": true}'::jsonb`
        : sql`${current} || '{"completed": true}'::jsonb`;
  await db
    .update(schema.relearningPaths)
    .set({
      progress: sql`jsonb_set(
        coalesce(${schema.relearningPaths.progress}, '{}'::jsonb)
          || jsonb_build_object('sections', coalesce(${schema.relearningPaths.progress}->'sections', '{}'::jsonb)),
        array['sections', ${sectionId}::text],
        ${next}
      )`,
    })
    .where(eq(schema.relearningPaths.id, rowRef.id));
  return finishIfDone(rowRef);
}

/** The extension's one short answer (decision 7). */
export async function saveRelearningShortAnswer(
  rowRef: RowRef,
  sectionId: string,
  text: string
): Promise<ProgressResult> {
  const { section } = await rowSection(rowRef, sectionId);
  if (!section.shortAnswerPrompt) throw new RelearningError("This part has no question.", 400);
  const value = String(text ?? "").slice(0, SHORT_ANSWER_MAX);
  await db
    .update(schema.relearningPaths)
    .set({
      progress: sql`jsonb_set(
        coalesce(${schema.relearningPaths.progress}, '{}'::jsonb)
          || jsonb_build_object('shortAnswers', coalesce(${schema.relearningPaths.progress}->'shortAnswers', '{}'::jsonb)),
        array['shortAnswers', ${sectionId}::text],
        to_jsonb(${value}::text)
      )`,
    })
    .where(eq(schema.relearningPaths.id, rowRef.id));
  return finishIfDone(rowRef);
}

/**
 * A6: a video that won't play for this student (the player's error, e.g. Restricted Mode) is
 * flagged for the teacher's Needs you; a repeat counts a hit and reopens a resolved flag. The
 * student can switch to Read or Do (A4 already allows it before finishing).
 */
export async function flagRelearningVideo(
  rowRef: RowRef,
  sectionId: string,
  errorCode: string | null
): Promise<void> {
  const { section } = await rowSection(rowRef, sectionId);
  if (section.body.type !== "video") throw new RelearningError("That part isn't a video.", 400);
  const code = errorCode ? String(errorCode).slice(0, 20) : null;
  const now = new Date();
  await db
    .insert(schema.relearningVideoFlags)
    .values({
      sectionId,
      studentId: rowRef.studentId,
      assignmentId: rowRef.assignmentId,
      errorCode: code,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.relearningVideoFlags.sectionId, schema.relearningVideoFlags.studentId],
      set: {
        hits: sql`${schema.relearningVideoFlags.hits} + 1`,
        errorCode: code,
        assignmentId: rowRef.assignmentId,
        lastSeenAt: now,
        resolvedAt: null,
        resolvedBy: null,
      },
    });
}

/** The teacher fixed or swapped a video (A6): its open flags close. */
export async function resolveVideoFlags(sectionId: string, teacherId: string): Promise<number> {
  const rows = await db
    .update(schema.relearningVideoFlags)
    .set({ resolvedAt: new Date(), resolvedBy: teacherId })
    .where(
      and(
        eq(schema.relearningVideoFlags.sectionId, sectionId),
        isNull(schema.relearningVideoFlags.resolvedAt)
      )
    )
    .returning({ id: schema.relearningVideoFlags.id });
  return rows.length;
}

/**
 * A5: the teacher checks the relearning off (nothing was built for it, or it was done another
 * way). A test target's own; a quiz's whole activity, since it is one stitched activity (Q3).
 */
export async function checkOffRelearning(input: {
  assignmentId: string;
  studentId: string;
  targetId: string;
  teacherId: string;
}): Promise<{ checkedOff: number }> {
  const plan = await relearningPlan(input.assignmentId, input.studentId);
  if (!plan) throw new RelearningError("This student isn't on the relearning path here.", 404);
  const target = plan.ctx.state.targets.find((t) => t.id === input.targetId);
  if (!target || (target.role !== "required" && !target.onPath))
    throw new RelearningError("That target has no relearning to check off.", 409);
  const now = new Date();
  const bundle =
    plan.bundles.find((b) => b.targetIds.includes(target.id)) ??
    (plan.ctx.state.type === "formative" ? plan.bundles.find((b) => !b.finished) : undefined);
  if (bundle?.finished) throw new RelearningError("That relearning is already done.", 409);
  let count = 0;
  if (bundle?.bundleId) {
    const ids =
      plan.ctx.state.type === "summative"
        ? bundle.rows.filter((r) => r.learningTargetId === target.id).map((r) => r.id)
        : bundle.rows.map((r) => r.id);
    if (ids.length) {
      const done = await db
        .update(schema.relearningPaths)
        .set({ finishedAt: now, checkedOffBy: input.teacherId })
        .where(
          and(inArray(schema.relearningPaths.id, ids), isNull(schema.relearningPaths.finishedAt))
        )
        .returning({ id: schema.relearningPaths.id });
      count = done.length;
    }
  } else {
    const members =
      plan.ctx.state.type === "summative" ? [target.id] : (bundle?.targetIds ?? [target.id]);
    const ids = members.includes(target.id) ? members : [...members, target.id];
    const bundleId = crypto.randomUUID();
    const done = await db
      .insert(schema.relearningPaths)
      .values(
        ids.map((learningTargetId) => ({
          assignmentId: input.assignmentId,
          studentId: input.studentId,
          learningTargetId,
          bundleId,
          mode: null,
          finishedAt: now,
          checkedOffBy: input.teacherId,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: schema.relearningPaths.id });
    count = done.length;
  }
  if (count) await recomputeFinalScore(input.assignmentId, input.studentId);
  return { checkedOff: count };
}

/** What the student's relearning page shows for one bundle: its rows, sections and the picker. */
export type RelearningView = {
  plan: RelearnPlan;
  bundle: RelearnBundle;
  choices: ModeChoice[];
  unbuilt: string[];
  /** The sections each row serves, in order (keys stripped by the page before it renders). */
  sectionsByRow: Map<string, SectionInfo[]>;
};

export async function getRelearningView(
  assignmentId: string,
  studentId: string,
  targetId: string | null
): Promise<RelearningView | null> {
  const plan = await relearningPlan(assignmentId, studentId);
  if (!plan || plan.bundles.length === 0) return null;
  const bundle =
    (targetId ? plan.bundles.find((b) => b.targetIds.includes(targetId)) : null) ??
    plan.bundles.find((b) => b.bundleId && !b.finished) ??
    plan.bundles.find((b) => !b.bundleId && b.open) ??
    plan.bundles[0];
  const candidates = bundle.bundleId ? bundle.targetIds : [...bundle.targetIds, ...bundle.addable];
  const options = await loadOptions(plan.ownerId, candidates);
  const { choices, unbuilt } = modeChoices(
    options,
    bundle.targetIds.length ? bundle.targetIds : bundle.addable.slice(0, 1)
  );
  const sectionIds = bundle.rows.flatMap((r) => r.servedSectionIds);
  const sections = await loadSections({ ids: sectionIds });
  const byId = new Map(sections.map((s) => [s.id, s]));
  const sectionsByRow = new Map(
    bundle.rows.map((r) => [
      r.id,
      r.servedSectionIds
        .map((id) => byId.get(id))
        .filter((s): s is SectionInfo & { optionId: string } => !!s),
    ])
  );
  return { plan, bundle, choices, unbuilt, sectionsByRow };
}

/** One target's relearning as the teacher's relearning monitor shows it (A5). */
export type MonitorRelearningLine = {
  targetId: string;
  code: string;
  title: string;
  role: "required" | "optional" | "full";
  relearn: "done" | "waiting" | "current" | "locked" | null;
  practice: "done" | "waiting" | "current" | "locked" | null;
  mode: RelearningMode | null;
  parts: number;
  partsDone: number;
  finishedAt: Date | null;
  checkedOff: boolean;
};

/**
 * The relearning monitor's view (A5): each target on a student's path with its mode, how many of
 * its parts are done, and whether the teacher checked it off. Null off the path.
 */
export async function relearningForMonitor(
  assignmentId: string,
  studentId: string
): Promise<MonitorRelearningLine[] | null> {
  const plan = await relearningPlan(assignmentId, studentId);
  if (!plan) return null;
  const rows = plan.bundles.flatMap((b) => b.rows);
  const sections = await loadSections({ ids: rows.flatMap((r) => r.servedSectionIds) });
  const byId = new Map(sections.map((s) => [s.id, s]));
  return plan.ctx.state.targets
    .filter((t) => t.role === "required" || t.onPath)
    .map((t) => {
      const row = rows.find((r) => r.learningTargetId === t.id) ?? null;
      const served = (row?.servedSectionIds ?? [])
        .map((id) => byId.get(id))
        .filter((s): s is SectionInfo & { optionId: string } => !!s);
      return {
        targetId: t.id,
        code: t.code,
        title: t.title,
        role: t.role,
        relearn: t.relearn,
        practice: t.practice,
        mode: row?.mode ?? null,
        parts: served.length,
        partsDone: served.filter((s) => sectionDone(s, row?.progress ?? {})).length,
        finishedAt: row?.finishedAt ?? null,
        checkedOff: !!row?.checkedOffBy,
      };
    });
}
