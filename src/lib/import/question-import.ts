/**
 * Server side of the Appendix A importer: resolves each parsed row against the
 * bank's course (targets, pools, units, standards, stimuli, existing
 * external_ids) and, on commit, writes questions. Callers must already have
 * passed requireShared(bank, "co_edit").
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionError } from "@/lib/authz";
import { splitTargetName, statusOf, type ParsedRow } from "./question-csv";

export type RowAction = "insert" | "update" | "skip";

export type PlannedRow = {
  line: number;
  status: ParsedRow["status"];
  action: RowAction;
  issues: ParsedRow["issues"];
  type: ParsedRow["type"];
  stem: string;
  externalId: string | null;
  learningTarget: string;
  pool: string | null;
  stimulusRef: string | null;
};

export type ImportPlan = {
  rows: PlannedRow[];
  willCreate: {
    targets: string[];
    pools: string[];
    units: string[];
    stimuli: string[];
    standards: string[];
  };
  counts: { insert: number; update: number; skip: number; error: number };
};

export type ImportResult = {
  rows: {
    line: number;
    action: "inserted" | "updated" | "skipped";
    questionId?: string;
    error?: string;
  }[];
  created: { targets: number; pools: number; units: number; stimuli: number; standards: number };
  counts: { inserted: number; updated: number; skipped: number };
};

type Ctx = {
  bank: { id: string; ownerId: string; courseId: string; courseName: string };
  targets: Map<string, string>;
  pools: Map<string, string>;
  units: Map<string, string>;
  stimuli: Map<string, string>;
  standards: Map<string, string>;
  existing: Map<string, { id: string; version: number }>;
  targetCount: number;
};

const key = (s: string) => s.trim().toLowerCase();

/** media_assets row id for a URL the app minted (uploads), else null. */
async function assetIdForUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const row = await db.query.mediaAssets.findFirst({
    columns: { id: true },
    where: eq(schema.mediaAssets.url, url),
  });
  return row?.id ?? null;
}

async function loadContext(bankId: string): Promise<Ctx> {
  const [bank] = await db
    .select({
      id: schema.questionBanks.id,
      ownerId: schema.questionBanks.ownerId,
      courseId: schema.questionBanks.courseId,
      courseName: schema.courses.name,
    })
    .from(schema.questionBanks)
    .leftJoin(schema.courses, eq(schema.questionBanks.courseId, schema.courses.id))
    .where(eq(schema.questionBanks.id, bankId))
    .limit(1);
  if (!bank) throw new ActionError("Bank not found.", 404);
  if (!bank.courseId || !bank.courseName) {
    throw new ActionError(
      "Give this bank a course before importing; targets and pools live on the course.",
      400
    );
  }
  const courseId = bank.courseId;

  const targets = new Map<string, string>();
  const targetRows = await db
    .select({
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
    })
    .from(schema.learningTargets)
    .where(eq(schema.learningTargets.courseId, courseId));
  for (const t of targetRows) {
    targets.set(key(t.code), t.id);
    targets.set(key(t.title), t.id);
    targets.set(key(`${t.code} ${t.title}`), t.id);
  }

  const pools = new Map(
    (
      await db
        .select({ id: schema.questionPools.id, name: schema.questionPools.name })
        .from(schema.questionPools)
        .where(eq(schema.questionPools.courseId, courseId))
    ).map((p) => [key(p.name), p.id])
  );
  const units = new Map(
    (
      await db
        .select({ id: schema.units.id, name: schema.units.name })
        .from(schema.units)
        .where(eq(schema.units.courseId, courseId))
    ).map((u) => [key(u.name), u.id])
  );
  const stimuli = new Map(
    (
      await db
        .select({ id: schema.stimuli.id, ref: schema.stimuli.ref })
        .from(schema.stimuli)
        .where(eq(schema.stimuli.courseId, courseId))
    )
      .filter((s) => s.ref)
      .map((s) => [key(s.ref!), s.id])
  );
  const standards = new Map(
    (
      await db
        .select({ id: schema.standards.id, code: schema.standards.code })
        .from(schema.standards)
    ).map((s) => [key(s.code), s.id])
  );
  const existing = new Map(
    (
      await db
        .select({
          id: schema.questions.id,
          externalId: schema.questions.externalId,
          version: schema.questions.version,
        })
        .from(schema.questions)
        .where(and(eq(schema.questions.bankId, bankId), eq(schema.questions.isArchived, false)))
    )
      .filter((q) => q.externalId)
      .map((q) => [key(q.externalId!), { id: q.id, version: q.version }])
  );

  return {
    bank: { id: bank.id, ownerId: bank.ownerId, courseId, courseName: bank.courseName },
    targets,
    pools,
    units,
    stimuli,
    standards,
    existing,
    targetCount: targetRows.length,
  };
}

/** Dry run: what would happen to each row, and what would be created. */
export async function planImport(bankId: string, rows: ParsedRow[]): Promise<ImportPlan> {
  const ctx = await loadContext(bankId);
  const willCreate = {
    targets: new Set<string>(),
    pools: new Set<string>(),
    units: new Set<string>(),
    stimuli: new Set<string>(),
    standards: new Set<string>(),
  };
  const planned: PlannedRow[] = [];

  for (const row of rows) {
    const issues = [...row.issues];
    let action: RowAction = "insert";
    if (row.status === "error") {
      action = "skip";
    } else {
      if (key(row.course) !== key(ctx.bank.courseName)) {
        issues.push({
          level: "error",
          field: "course",
          message: `Row is for course "${row.course}" but this bank belongs to "${ctx.bank.courseName}".`,
        });
        action = "skip";
      }
      if (!ctx.targets.has(key(row.learningTarget))) {
        willCreate.targets.add(row.learningTarget.trim());
        issues.push({
          level: "info",
          field: "learning_target",
          message: `Will create learning target "${row.learningTarget.trim()}".`,
        });
      }
      if (row.pool && !ctx.pools.has(key(row.pool))) {
        willCreate.pools.add(row.pool.trim());
        issues.push({
          level: "info",
          field: "pool",
          message: `Will create pool "${row.pool.trim()}".`,
        });
      }
      if (row.unit && !ctx.units.has(key(row.unit))) willCreate.units.add(row.unit.trim());
      if (row.stimulus && !ctx.stimuli.has(key(row.stimulus.ref)))
        willCreate.stimuli.add(row.stimulus.ref.trim());
      if (row.standard && !ctx.standards.has(key(row.standard)))
        willCreate.standards.add(row.standard.trim());
      if (action !== "skip" && row.externalId && ctx.existing.has(key(row.externalId))) {
        action = "update";
        issues.push({
          level: "info",
          field: "external_id",
          message: `Updates the existing question with external_id "${row.externalId}" (new version).`,
        });
      }
    }
    planned.push({
      line: row.line,
      status: statusOf(issues),
      action,
      issues,
      type: row.type,
      stem: row.stem,
      externalId: row.externalId,
      learningTarget: row.learningTarget,
      pool: row.pool,
      stimulusRef: row.stimulus?.ref ?? null,
    });
  }

  const counts = { insert: 0, update: 0, skip: 0, error: 0 };
  for (const p of planned) {
    counts[p.action]++;
    if (p.status === "error") counts.error++;
  }
  return {
    rows: planned,
    willCreate: {
      targets: [...willCreate.targets],
      pools: [...willCreate.pools],
      units: [...willCreate.units],
      stimuli: [...willCreate.stimuli],
      standards: [...willCreate.standards],
    },
    counts,
  };
}

/** Write the rows. Rows with errors (or excluded lines) are skipped; the rest are inserted or updated one by one. */
export async function commitImport(
  bankId: string,
  rows: ParsedRow[],
  options: { skipLines?: number[] } = {}
): Promise<ImportResult> {
  const ctx = await loadContext(bankId);
  const skip = new Set(options.skipLines ?? []);
  const created = { targets: 0, pools: 0, units: 0, stimuli: 0, standards: 0 };
  const results: ImportResult["rows"] = [];

  const ensureUnit = async (name: string) => {
    const k = key(name);
    const found = ctx.units.get(k);
    if (found) return found;
    const [u] = await db
      .insert(schema.units)
      .values({ courseId: ctx.bank.courseId, name: name.trim(), sortOrder: ctx.units.size })
      .returning({ id: schema.units.id });
    ctx.units.set(k, u.id);
    created.units++;
    return u.id;
  };
  const ensureTarget = async (name: string, unitId: string | null) => {
    const k = key(name);
    const found = ctx.targets.get(k);
    if (found) return found;
    ctx.targetCount++;
    const split = splitTargetName(name, ctx.targetCount);
    const title = split.title;
    let code = split.code;
    // Codes are unique per course; bump if the split produced a clash.
    let n = 1;
    while (ctx.targets.has(key(code)) && ctx.targets.get(key(code)) !== undefined) {
      n++;
      code = `${code.replace(/-\d+$/, "")}-${n}`;
    }
    const [t] = await db
      .insert(schema.learningTargets)
      .values({ courseId: ctx.bank.courseId, code, title, unitId, sortOrder: ctx.targetCount })
      .returning({ id: schema.learningTargets.id });
    ctx.targets.set(k, t.id);
    ctx.targets.set(key(code), t.id);
    ctx.targets.set(key(title), t.id);
    created.targets++;
    return t.id;
  };
  const ensurePool = async (name: string, targetId: string) => {
    const k = key(name);
    let id = ctx.pools.get(k);
    if (!id) {
      const [p] = await db
        .insert(schema.questionPools)
        .values({ ownerId: ctx.bank.ownerId, courseId: ctx.bank.courseId, name: name.trim() })
        .returning({ id: schema.questionPools.id });
      id = p.id;
      ctx.pools.set(k, id);
      created.pools++;
    }
    await db
      .insert(schema.poolTargets)
      .values({ poolId: id, learningTargetId: targetId })
      .onConflictDoNothing();
    return id;
  };
  const ensureStimulus = async (s: NonNullable<ParsedRow["stimulus"]>) => {
    const k = key(s.ref);
    const found = ctx.stimuli.get(k);
    if (found) return found;
    const kind = s.videoUrl ? "video" : s.imageUrl ? "image" : "text";
    const [row] = await db
      .insert(schema.stimuli)
      .values({
        ownerId: ctx.bank.ownerId,
        courseId: ctx.bank.courseId,
        kind,
        ref: s.ref.trim(),
        title: s.ref.trim(),
        content: s.text,
        mediaUrl: s.imageUrl ?? s.videoUrl ?? null,
        mediaAssetId: await assetIdForUrl(s.imageUrl ?? s.videoUrl ?? null),
      })
      .returning({ id: schema.stimuli.id });
    ctx.stimuli.set(k, row.id);
    created.stimuli++;
    return row.id;
  };
  const ensureStandard = async (code: string) => {
    const k = key(code);
    const found = ctx.standards.get(k);
    if (found) return found;
    const framework = /^(HS|MS|K|[1-5])-/i.test(code.trim()) ? "NGSS" : "Other";
    const [s] = await db
      .insert(schema.standards)
      .values({ framework, code: code.trim() })
      .returning({ id: schema.standards.id });
    ctx.standards.set(k, s.id);
    created.standards++;
    return s.id;
  };

  for (const row of rows) {
    if (
      row.status === "error" ||
      skip.has(row.line) ||
      key(row.course) !== key(ctx.bank.courseName)
    ) {
      results.push({
        line: row.line,
        action: "skipped",
        error:
          row.status === "error"
            ? "Row has errors."
            : skip.has(row.line)
              ? "Skipped by you."
              : "Wrong course.",
      });
      continue;
    }
    try {
      const unitId = row.unit ? await ensureUnit(row.unit) : null;
      const targetId = await ensureTarget(row.learningTarget, unitId);
      const stimulusId = row.stimulus ? await ensureStimulus(row.stimulus) : null;
      const standardId = row.standard ? await ensureStandard(row.standard) : null;

      const prior = row.externalId ? ctx.existing.get(key(row.externalId)) : undefined;
      if (prior) {
        // New version: the old row is archived and loses the external_id so the unique index stays clean.
        await db
          .update(schema.questions)
          .set({ isArchived: true, externalId: null })
          .where(eq(schema.questions.id, prior.id));
      }

      const [q] = await db
        .insert(schema.questions)
        .values({
          bankId: ctx.bank.id,
          ownerId: ctx.bank.ownerId,
          unitId,
          type: row.type,
          stem: row.stem,
          explanation: row.explanation,
          points: row.points,
          difficulty: row.difficulty,
          bloom: row.bloom,
          grading: row.grading,
          gradingConfig: row.gradingConfig,
          topic: row.topic,
          tags: row.tags,
          mediaUrl: row.imageUrl,
          mediaAssetId: await assetIdForUrl(row.imageUrl),
          videoUrl: row.videoUrl,
          stimulusId,
          externalId: row.externalId,
          version: prior ? prior.version + 1 : 1,
          previousVersionId: prior?.id ?? null,
        })
        .returning({ id: schema.questions.id });

      if (row.options.length) {
        await db.insert(schema.questionOptions).values(
          row.options.map((o, i) => ({
            questionId: q.id,
            content: o.content,
            isCorrect: o.isCorrect,
            matchText: o.matchText,
            correctPosition: o.correctPosition,
            sortOrder: i,
          }))
        );
      }
      await db
        .insert(schema.questionTargets)
        .values({ questionId: q.id, learningTargetId: targetId });
      if (standardId)
        await db.insert(schema.questionStandards).values({ questionId: q.id, standardId });
      if (row.pool) {
        const poolId = await ensurePool(row.pool, targetId);
        await db
          .insert(schema.poolQuestions)
          .values({ poolId, questionId: q.id })
          .onConflictDoNothing();
        if (prior) {
          await db
            .delete(schema.poolQuestions)
            .where(
              and(
                eq(schema.poolQuestions.poolId, poolId),
                eq(schema.poolQuestions.questionId, prior.id)
              )
            );
        }
      }
      if (row.externalId)
        ctx.existing.set(key(row.externalId), { id: q.id, version: prior ? prior.version + 1 : 1 });
      results.push({ line: row.line, action: prior ? "updated" : "inserted", questionId: q.id });
    } catch (err) {
      results.push({
        line: row.line,
        action: "skipped",
        error: err instanceof Error ? err.message : "Could not write this row.",
      });
    }
  }

  const counts = { inserted: 0, updated: 0, skipped: 0 };
  for (const r of results) counts[r.action]++;
  return { rows: results, created, counts };
}

/** Questions in this bank whose external_id matches, for the update path's tests and tools. */
export async function findByExternalIds(bankId: string, externalIds: string[]) {
  if (externalIds.length === 0) return [];
  return db
    .select({
      id: schema.questions.id,
      externalId: schema.questions.externalId,
      version: schema.questions.version,
      isArchived: schema.questions.isArchived,
    })
    .from(schema.questions)
    .where(
      and(
        eq(schema.questions.bankId, bankId),
        inArray(
          sql`lower(${schema.questions.externalId})`,
          externalIds.map((e) => e.toLowerCase())
        ),
        isNull(schema.questions.previousVersionId)
      )
    );
}
