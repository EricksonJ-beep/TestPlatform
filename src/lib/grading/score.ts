/**
 * Attempt scoring and the "highest counts" final score (PLAN.md §2, §4, §3.11).
 * Pure functions; the server actions in later tickets persist the results.
 */
import type { AttemptScore, ResponseRecord, ServedItem, TargetScore } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (earned: number, possible: number) =>
  possible > 0 ? round2((earned / possible) * 100) : 0;

/**
 * Score one attempt from its served items and responses. A manual score, when
 * present, overrides the auto score. Items with no score yet count as pending
 * (and contribute 0 to the total until graded).
 */
export function scoreAttempt(
  items: ServedItem[],
  responses: Map<string, ResponseRecord>
): AttemptScore {
  let totalEarned = 0;
  let totalPossible = 0;
  let pendingManual = 0;
  const targets = new Map<string, { earned: number; possible: number }>();

  for (const item of items) {
    const r = responses.get(item.questionId);
    const score = r ? (r.manualScore ?? r.autoScore) : 0;
    const earned = score ?? 0;
    if (r && r.autoScore === null && r.manualScore === null) pendingManual++;
    totalEarned += earned;
    totalPossible += item.points;
    if (item.learningTargetId) {
      const t = targets.get(item.learningTargetId) ?? { earned: 0, possible: 0 };
      t.earned += earned;
      t.possible += item.points;
      targets.set(item.learningTargetId, t);
    }
  }

  const perTarget: TargetScore[] = [...targets.entries()].map(([learningTargetId, t]) => ({
    learningTargetId,
    pointsEarned: round2(t.earned),
    pointsPossible: round2(t.possible),
    percent: pct(t.earned, t.possible),
  }));
  return {
    totalEarned: round2(totalEarned),
    totalPossible: round2(totalPossible),
    percent: pct(totalEarned, totalPossible),
    perTarget,
    pendingManual,
  };
}

export type AttemptSummary = {
  attemptId: string;
  number: number;
  totalEarned: number;
  totalPossible: number;
  perTarget: TargetScore[];
};

export type FinalScore = {
  totalEarned: number;
  totalPossible: number;
  percent: number;
  /** Summative only: each target's best across attempts, with the attempt it came from. */
  perTarget: Record<
    string,
    { pointsEarned: number; pointsPossible: number; percent: number; fromAttemptId: string }
  >;
  /** Formative/practice: the attempt that counts. */
  bestAttemptId: string | null;
  targetsBelowThreshold: string[];
  /** 1 proficient · 2 targeted relearning · 3 needs intervention (summative only, else null). */
  tier: 1 | 2 | 3 | null;
};

/** Tier from how many targets sit below the threshold (PLAN.md §3.11). */
export function tierFor(belowCount: number, tier2Max = 2): 1 | 2 | 3 {
  if (belowCount === 0) return 1;
  return belowCount <= tier2Max ? 2 : 3;
}

/**
 * Highest counts, always.
 *   summative → per target: max across attempts, then summed; tiers from targets below threshold
 *   formative / practice → the single best attempt by total
 */
export function computeFinalScore(
  type: "practice" | "formative" | "summative",
  attempts: AttemptSummary[],
  opts: { threshold: number; tier2Max?: number }
): FinalScore {
  const empty: FinalScore = {
    totalEarned: 0,
    totalPossible: 0,
    percent: 0,
    perTarget: {},
    bestAttemptId: null,
    targetsBelowThreshold: [],
    tier: null,
  };
  if (attempts.length === 0) return empty;

  if (type !== "summative") {
    const best = attempts.reduce((a, b) =>
      b.totalEarned > a.totalEarned || (b.totalEarned === a.totalEarned && b.number > a.number)
        ? b
        : a
    );
    return {
      ...empty,
      totalEarned: best.totalEarned,
      totalPossible: best.totalPossible,
      percent: pct(best.totalEarned, best.totalPossible),
      bestAttemptId: best.attemptId,
    };
  }

  const perTarget: FinalScore["perTarget"] = {};
  for (const att of attempts) {
    for (const t of att.perTarget) {
      const cur = perTarget[t.learningTargetId];
      if (!cur || t.pointsEarned > cur.pointsEarned) {
        perTarget[t.learningTargetId] = {
          pointsEarned: t.pointsEarned,
          pointsPossible: t.pointsPossible,
          percent: t.percent,
          fromAttemptId: att.attemptId,
        };
      }
    }
  }
  const targets = Object.values(perTarget);
  const totalEarned = round2(targets.reduce((s, t) => s + t.pointsEarned, 0));
  const totalPossible = round2(targets.reduce((s, t) => s + t.pointsPossible, 0));
  const below = Object.entries(perTarget)
    .filter(([, t]) => t.percent < opts.threshold)
    .map(([id]) => id);
  return {
    totalEarned,
    totalPossible,
    percent: pct(totalEarned, totalPossible),
    perTarget,
    bestAttemptId: null,
    targetsBelowThreshold: below,
    tier: tierFor(below.length, opts.tier2Max ?? 2),
  };
}

/** Which targets a summative retake must cover (required) and may cover (optional). */
export function retakeTargets(
  final: FinalScore,
  threshold: number
): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];
  for (const [id, t] of Object.entries(final.perTarget))
    (t.percent < threshold ? required : optional).push(id);
  return { required, optional };
}
