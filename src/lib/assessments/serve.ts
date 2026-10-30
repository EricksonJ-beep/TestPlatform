/**
 * Builds the exact question set an attempt serves (PLAN.md §3.4, §8): fixed
 * questions plus "draw N from pool" instructions, optional randomization, and
 * stimulus groups kept contiguous. Pure and seedable so tests are exact.
 */
import type { ServedQuestion } from "@/db/schema";

export type PoolQuestion = {
  questionId: string;
  points: number;
  stimulusId: string | null;
  targetIds: string[];
};

export type BuilderItem =
  | {
      kind: "question";
      id: string;
      questionId: string;
      points: number;
      stimulusId: string | null;
      sortOrder: number;
    }
  | {
      kind: "pool";
      id: string;
      poolId: string;
      drawCount: number;
      drawStimulusGroups: boolean;
      questions: PoolQuestion[];
      sortOrder: number;
    };

export type BuilderSection = {
  id: string;
  learningTargetId: string | null;
  sortOrder: number;
  items: BuilderItem[];
  /** A targeted retake of this section draws `drawCount` fresh questions from this pool instead of `items`. */
  retake?: {
    poolId: string;
    drawCount: number;
    drawStimulusGroups: boolean;
    questions: (PoolQuestion & { difficulty: number })[];
  } | null;
};

export type ServeOptions = {
  randomizeQuestions: boolean;
  /** Learning-target ids to serve (targeted retake); null = every section. */
  scope?: string[] | null;
  /** Deterministic RNG in [0,1); defaults to Math.random. */
  rng?: () => number;
  /** Questions already served to this student on earlier attempts; a pool draw avoids them when it can. */
  avoidQuestionIds?: Set<string>;
};

/** mulberry32: small seeded RNG for tests and reproducible previews. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Keep questions that share a stimulus next to each other, preserving first appearance. */
function groupContiguous<T extends { stimulusId: string | null }>(list: T[]): T[] {
  const out: T[] = [];
  const seen = new Map<string, number>(); // stimulusId → index in out after which to insert
  for (const item of list) {
    if (!item.stimulusId) {
      out.push(item);
      continue;
    }
    const at = seen.get(item.stimulusId);
    if (at === undefined) {
      out.push(item);
      seen.set(item.stimulusId, out.length - 1);
    } else {
      out.splice(at + 1, 0, item);
      for (const [k, v] of seen) if (v > at) seen.set(k, v + 1);
      seen.set(item.stimulusId, at + 1);
    }
  }
  return out;
}

/**
 * Draw `count` questions from a pool. With `drawStimulusGroups`, picking any member of a
 * stimulus group pulls the whole group (the draw may then exceed `count` by the group's size).
 * Prefers questions the student hasn't seen before.
 */
export function drawFromPool(
  pool: PoolQuestion[],
  count: number,
  opts: { drawStimulusGroups: boolean; rng: () => number; avoid?: Set<string> }
): PoolQuestion[] {
  if (count <= 0 || pool.length === 0) return [];
  const avoid = opts.avoid ?? new Set<string>();
  const fresh = pool.filter((q) => !avoid.has(q.questionId));
  const ordered = [
    ...shuffle(fresh, opts.rng),
    ...shuffle(
      pool.filter((q) => avoid.has(q.questionId)),
      opts.rng
    ),
  ];
  const chosen: PoolQuestion[] = [];
  const taken = new Set<string>();
  for (const q of ordered) {
    if (chosen.length >= count) break;
    if (taken.has(q.questionId)) continue;
    if (opts.drawStimulusGroups && q.stimulusId) {
      for (const g of pool.filter((x) => x.stimulusId === q.stimulusId)) {
        if (!taken.has(g.questionId)) {
          chosen.push(g);
          taken.add(g.questionId);
        }
      }
    } else {
      chosen.push(q);
      taken.add(q.questionId);
    }
  }
  return chosen;
}

/** Difficulty bands for a practice deal: 1–2 easy, 3 medium, 4–5 hard. */
export type DifficultyBand = "easy" | "medium" | "hard";

export function difficultyBand(difficulty: number): DifficultyBand {
  return difficulty <= 2 ? "easy" : difficulty >= 4 ? "hard" : "medium";
}

/** Share of a practice deal per band (Jon, Oct 13 2026: about 15 easy, 20 medium, 15 hard of 50). */
export const DEAL_MIX: Record<DifficultyBand, number> = { easy: 0.3, medium: 0.4, hard: 0.3 };
const BANDS: DifficultyBand[] = ["easy", "medium", "hard"];

/**
 * A practice deal across difficulty bands. Rule: split `count` by DEAL_MIX
 * (10 → 3 easy, 4 medium, 3 hard), draw each band fresh-first like
 * drawFromPool, fill any band's shortfall from what is left (fresh first),
 * then serve easy → medium → hard so each set warms up and ends with a
 * stretch. A pool that keeps stimulus groups together draws as one band.
 */
export function dealByDifficulty(
  pool: (PoolQuestion & { difficulty: number })[],
  count: number,
  opts: { drawStimulusGroups: boolean; rng: () => number; avoid?: Set<string> }
): PoolQuestion[] {
  if (opts.drawStimulusGroups) return drawFromPool(pool, count, opts);
  const n = Math.min(count, pool.length);
  if (n <= 0) return [];
  const easy = Math.round(n * DEAL_MIX.easy);
  const hard = Math.round(n * DEAL_MIX.hard);
  const want: Record<DifficultyBand, number> = { easy, medium: n - easy - hard, hard };
  const picked = new Map<DifficultyBand, (PoolQuestion & { difficulty: number })[]>();
  const taken = new Set<string>();
  for (const band of BANDS) {
    const drawn = drawFromPool(
      pool.filter((q) => difficultyBand(q.difficulty) === band),
      want[band],
      opts
    ) as (PoolQuestion & { difficulty: number })[];
    picked.set(band, drawn);
    for (const q of drawn) taken.add(q.questionId);
  }
  const short = n - taken.size;
  if (short > 0) {
    const fill = drawFromPool(
      pool.filter((q) => !taken.has(q.questionId)),
      short,
      opts
    ) as (PoolQuestion & { difficulty: number })[];
    for (const q of fill) picked.get(difficultyBand(q.difficulty))!.push(q);
  }
  return BANDS.flatMap((b) => shuffle(picked.get(b)!, opts.rng));
}

/** Resolve sections into the served list. Section order is kept; within a section, fixed items keep their order unless randomized. */
export function buildQuestionSet(sections: BuilderSection[], opts: ServeOptions): ServedQuestion[] {
  const rng = opts.rng ?? Math.random;
  const scope = opts.scope && opts.scope.length ? new Set(opts.scope) : null;
  const served: (ServedQuestion & { stimulusId: string | null })[] = [];
  const usedIds = new Set<string>();

  for (const section of [...sections].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (scope && (!section.learningTargetId || !scope.has(section.learningTargetId))) continue;
    let picked: { questionId: string; points: number; stimulusId: string | null }[] = [];
    // A targeted retake of a section with a retake pool: a fresh deal from the pool, balanced
    // easy → hard like a practice deal, avoiding questions the student has already seen.
    const retakePool = scope && section.retake?.questions.length ? section.retake : null;
    if (retakePool) {
      picked = dealByDifficulty(
        retakePool.questions.filter((q) => !usedIds.has(q.questionId)),
        retakePool.drawCount,
        {
          drawStimulusGroups: retakePool.drawStimulusGroups,
          rng,
          avoid: new Set([...usedIds, ...(opts.avoidQuestionIds ?? [])]),
        }
      ).map((q) => ({ questionId: q.questionId, points: q.points, stimulusId: q.stimulusId }));
      for (const p of picked) usedIds.add(p.questionId);
    }
    for (const item of retakePool
      ? []
      : [...section.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (item.kind === "question") {
        if (!usedIds.has(item.questionId))
          picked.push({
            questionId: item.questionId,
            points: item.points,
            stimulusId: item.stimulusId,
          });
      } else {
        const avoid = new Set([...usedIds, ...(opts.avoidQuestionIds ?? [])]);
        const drawn = drawFromPool(
          item.questions.filter((q) => !usedIds.has(q.questionId)),
          item.drawCount,
          { drawStimulusGroups: item.drawStimulusGroups, rng, avoid }
        );
        picked.push(
          ...drawn.map((q) => ({
            questionId: q.questionId,
            points: q.points,
            stimulusId: q.stimulusId,
          }))
        );
      }
      for (const p of picked) usedIds.add(p.questionId);
    }
    if (opts.randomizeQuestions) picked = shuffle(picked, rng);
    picked = groupContiguous(picked);
    for (const p of picked) {
      served.push({
        questionId: p.questionId,
        sectionId: section.id,
        learningTargetId: section.learningTargetId,
        points: p.points,
        order: served.length + 1,
        stimulusId: p.stimulusId,
      });
    }
  }
  return served.map(({ stimulusId: _s, ...q }) => q);
}

/** Total points a build would serve when every pool draw yields exactly its count (for the builder's totals). */
export function nominalPoints(sections: BuilderSection[]): number {
  let total = 0;
  for (const s of sections) {
    for (const it of s.items) {
      if (it.kind === "question") total += it.points;
      else {
        const pts = it.questions.map((q) => q.points);
        const avg = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 1;
        total += Math.min(it.drawCount, pts.length || it.drawCount) * avg;
      }
    }
  }
  return Math.round(total * 100) / 100;
}
