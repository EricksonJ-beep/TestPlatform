/**
 * The relearning path (Jon, Nov 2–4 2026; docs/relearning-revamp-plan.md, rules Q1–Q8 and S1–S6,
 * ticket R2). Pure: the query module (`src/lib/queries/relearning-path.ts`) reads the rows, this
 * decides each target's steps (corrections → relearn → practice check), what the path raises a
 * quiz target to, the counting score, and whether the next attempt may start. The student card,
 * `startAttempt` / `requestRetake`, the final score, a test's retake gates, the class gradebook
 * and Needs you all read it, so they agree. It applies only from the course's
 * `relearning_path_from` (`usesPathRules`); before that, and in a CVTC course, the v2 rules stand.
 */
import type { CorrectionsState } from "@/lib/corrections";
import type { CorrectionsRule, CycleState, RetakePlan } from "@/lib/retakes";

/** Questions in a practice check (P4: the size is fixed). */
export const CHECK_SIZE = 5;
/** Q2: corrections alone raise an at/above-threshold quiz target to this, or keep a higher score. */
export const CORRECTIONS_RAISE = 90;

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (earned: number, possible: number) =>
  possible > 0 ? round2((earned / possible) * 100) : 0;

/**
 * Rule (decision 26, L1): the path applies to a quiz or test whose attempt 1 was turned in at or
 * after its course's switch-on moment. Null switch = the v2 rules (Anatomy stays null), and CVTC
 * rules always win (corrections earn no credit there). Practice never has a path.
 */
export function usesPathRules(input: {
  type: "practice" | "formative" | "summative";
  cvtcRules: boolean | null | undefined;
  relearningPathFrom: Date | null | undefined;
  firstSubmittedAt: Date | null | undefined;
}): boolean {
  return (
    input.type !== "practice" &&
    !input.cvtcRules &&
    !!input.relearningPathFrom &&
    !!input.firstSubmittedAt &&
    input.firstSubmittedAt.getTime() >= input.relearningPathFrom.getTime()
  );
}

/**
 * Which targets' missed questions are in corrections scope on the path (S1, decision 31): the
 * targets below the threshold plus the 80%+ ones the student opted into. A quiz with nothing
 * below the threshold has every missed question open (corrections → 90%, Q2), so a one-target
 * quiz needs no opt-in. Only attempt 1 has corrections on the path (decision 32).
 */
export function pathCorrectionTargets(input: {
  type: "formative" | "summative";
  attemptNumber: number;
  targetPercents: Record<string, number>;
  threshold: number;
  optedInTargetIds: string[];
}): "all" | Set<string> {
  if (input.attemptNumber > 1) return new Set();
  const below = Object.entries(input.targetPercents)
    .filter(([, p]) => p < input.threshold)
    .map(([id]) => id);
  if (input.type === "formative" && below.length === 0) return "all";
  return new Set([...below, ...input.optedInTargetIds]);
}

/**
 * How a practice check's 5 questions split across the targets it covers (decision 10, Q4): evenly,
 * the extra going to the weakest (1 target: 5; 2: 3 + 2; 3: 2 + 2 + 1). Ties go in course order.
 * Past five targets the strongest get none, so the check stays 5 questions.
 */
export function splitCheck(
  targets: { id: string; percent: number; sortOrder?: number }[],
  size = CHECK_SIZE
): Map<string, number> {
  const order = [...targets].sort(
    (a, b) =>
      a.percent - b.percent || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id)
  );
  const out = new Map<string, number>();
  if (order.length === 0) return out;
  const base = Math.floor(size / order.length);
  let extra = size - base * order.length;
  for (const t of order) {
    out.set(t.id, base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra--;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The path
// ---------------------------------------------------------------------------

export type PathTargetInfo = { id: string; code: string; title: string; sortOrder: number };

/** A finished attempt: its total, and per learning target what it earned of what it served. */
export type PathAttempt = {
  id: string;
  number: number;
  earned: number;
  possible: number;
  perTarget: Record<string, { earned: number; possible: number }>;
};

/** A `relearning_paths` row, as far as the rule reads it. */
export type PathRelearning = {
  learningTargetId: string;
  bundleId: string;
  /** Finished, or checked off by the teacher (A5). */
  finished: boolean;
  added: boolean;
  /** When it was finished (or checked off), for the step path's date. */
  finishedAt?: Date | null;
};

/** A `practice_checks` row: passed once any round reached its pass mark. */
export type PathCheck = {
  purpose: "path" | "attempt";
  targetIds: string[];
  bundleId: string | null;
  unlocksAttemptNumber: number | null;
  passed: boolean;
  /** When it passed, for the step path's date. */
  passedAt?: Date | null;
};

export type PathInput = {
  type: "formative" | "summative";
  threshold: number;
  /**
   * Formatives: the path raises the score (Q1, Q2) where the assignment's corrections cap is on;
   * with it off, the path only unlocks the retake. Summatives never raise (S5).
   */
  raises: boolean;
  /** Names and course order for the targets on the attempts. */
  targets: PathTargetInfo[];
  /** Finished attempts, any order; attempt 1 must be among them. */
  attempts: PathAttempt[];
  /** Attempt 1's corrections per target, over that target's missed questions (in scope or not). */
  corrections: Record<string, CorrectionsState>;
  /** 80%+ targets the student chose to work on (`retake_gates.opted_in`). */
  optedIn: string[];
  relearning: PathRelearning[];
  checks: PathCheck[];
  /** When each target's corrections were all approved (the last approval), for the step path's date. */
  correctionsDoneAt?: Record<string, Date | null>;
  /** Right first answers out of 5 that pass a practice check (P4); 4 when absent. */
  passMark?: number;
};

/** done · waiting (the student's part is in, the teacher's OK is not) · current · locked. */
export type StepState = "done" | "waiting" | "current" | "locked";

export type PathTargetState = PathTargetInfo & {
  firstPercent: number;
  /** Below the threshold on attempt 1, at or above it with points missed, or full marks. */
  role: "required" | "optional" | "full";
  /** An optional target whose missed questions are in corrections scope. */
  optedIn: boolean;
  /** On the relearning path: required, or (quizzes) optional and added for 100% (Q2). */
  onPath: boolean;
  /** Attempt 1's corrections on this target. */
  correctionsState: CorrectionsState;
  /** Null where corrections aren't in play (full marks, or an optional target not opted into). */
  corrections: StepState | null;
  /** Null when the target isn't on the path. */
  relearn: StepState | null;
  practice: StepState | null;
  bundleId: string | null;
  /** Quizzes: what the path has raised the target to (80, 90 or 100); null when nothing yet. */
  raisedTo: number | null;
  raisedBy: "relearning_path" | "corrections_to_90" | null;
  /** The target's counting percent: the highest of attempt 1, the raise and later attempts. */
  counting: number;
  /** The attempt the counting percent came from. */
  countingFrom: string;
  /** When each done step was finished; null when not done or the date isn't known. */
  doneAt: { corrections: Date | null; relearn: Date | null; practice: Date | null };
};

export type PathBlocker =
  | { kind: "at_full" }
  | { kind: "corrections_returned"; targetIds: string[] }
  | { kind: "corrections"; targetIds: string[] }
  | { kind: "no_retake" }
  | { kind: "relearning"; targetIds: string[] }
  | { kind: "check"; targetIds: string[] }
  | { kind: "approval"; targetIds: string[] }
  | { kind: "attempt_check"; targetIds: string[]; attemptNumber: number };

export type PathFinal = {
  totalEarned: number;
  totalPossible: number;
  percent: number;
  perTarget: Record<
    string,
    { pointsEarned: number; pointsPossible: number; percent: number; fromAttemptId: string }
  >;
  bestAttemptId: string;
  basis: "best_attempt" | "retake" | "relearning_path" | "corrections_to_90";
};

export type PathState = {
  type: "formative" | "summative";
  threshold: number;
  raises: boolean;
  /** The assignment's practice-check pass mark (P4). */
  passMark: number;
  targets: PathTargetState[];
  /** Below the threshold on attempt 1, in course order. */
  required: string[];
  /** Every required target has done its corrections (approved), relearning and practice check. */
  complete: boolean;
  /** Targets below the threshold on the latest retake: a fresh check comes before the next attempt (Q6). */
  attemptCheck: { attemptNumber: number; targetIds: string[]; passed: boolean } | null;
  /** Why the next attempt can't start yet, first things first; empty = ready as far as the path goes. */
  blockers: PathBlocker[];
  retakeReady: boolean;
  /** Quizzes: the counting score the path gives (`assignment_final_scores`); null on tests. */
  final: PathFinal | null;
};

function correctionStep(state: CorrectionsState): StepState {
  if (state === "none" || state === "approved") return "done";
  if (state === "submitted") return "waiting";
  return "current";
}

/**
 * Whose corrections hold the next attempt: every required target; an opted-in test target (S3);
 * and, where the corrections cap is off so corrections earn nothing, every opted-in quiz target
 * too (PLAN.md principle 4: no retake until corrections are done). Otherwise a quiz's optional
 * targets never hold its retake (decision 31).
 */
function holdsRetake(
  t: Pick<PathTargetState, "role" | "optedIn">,
  type: "formative" | "summative",
  raises: boolean
): boolean {
  return t.role === "required" || (t.optedIn && (type === "summative" || !raises));
}

/**
 * Rules Q1–Q8 and S1–S6, on one student's work on one quiz or test. Targets are the ones attempt 1
 * served, in course order.
 *   Required (below the threshold): corrections, then relearning (open once corrections are
 *   submitted, Q7), then the practice check (open once the relearning of every target in its
 *   bundle is finished). Complete when the check passed and the corrections are approved.
 *   Optional (at or above): on a quiz, corrections approved → 90 (or the score kept if higher);
 *   added to the path and finished → 100. On a test, corrections only, and only when opted in (S3).
 *   Quiz raises: required → the threshold once complete; never on a test (S5).
 *   Next attempt: a quiz with nothing required has no retake (decision 18); a quiz at 100% has
 *   nothing to retake; otherwise every required target complete, the opted-in test targets'
 *   corrections approved, and after a retake a fresh passed check on its targets still below the
 *   threshold (Q6). Attempts left, windows and the teacher's OK are checked elsewhere.
 */
export function pathFor(input: PathInput): PathState {
  const attempts = [...input.attempts].sort((a, b) => a.number - b.number);
  const first = attempts[0];
  if (!first) throw new Error("pathFor needs attempt 1");
  const info = new Map(input.targets.map((t) => [t.id, t]));
  const ids = Object.keys(first.perTarget).sort((a, b) => {
    const x = info.get(a);
    const y = info.get(b);
    return (
      (x?.sortOrder ?? 0) - (y?.sortOrder ?? 0) ||
      (x?.code ?? a).localeCompare(y?.code ?? b, undefined, { numeric: true })
    );
  });
  const relBy = new Map(input.relearning.map((r) => [r.learningTargetId, r]));
  const bundleDone = (bundleId: string) =>
    input.relearning.filter((r) => r.bundleId === bundleId).every((r) => r.finished);
  const pathPassed = (id: string) =>
    input.checks.some((c) => c.purpose === "path" && c.passed && c.targetIds.includes(id));
  const firstPct = (id: string) => pct(first.perTarget[id].earned, first.perTarget[id].possible);
  const anyRequired = ids.some((id) => firstPct(id) < input.threshold);
  // A quiz with nothing below the line has every missed question open (no opt-in, Q2).
  const autoOptIn = input.type === "formative" && !anyRequired;
  const opted = new Set(input.optedIn);

  const targets: PathTargetState[] = ids.map((id) => {
    const t = info.get(id) ?? { id, code: id, title: id, sortOrder: 0 };
    const firstPercent = firstPct(id);
    const role: PathTargetState["role"] =
      firstPercent < input.threshold ? "required" : firstPercent >= 100 ? "full" : "optional";
    const optedIn = role === "optional" && (autoOptIn || opted.has(id));
    const rel = relBy.get(id) ?? null;
    const onPath =
      role === "required" || (input.type === "formative" && role === "optional" && !!rel);
    const correctionsState = input.corrections[id] ?? "none";
    const corrections =
      role === "required" || optedIn || onPath ? correctionStep(correctionsState) : null;
    const correctionsIn = corrections === "done" || corrections === "waiting";
    const relearn: StepState | null = !onPath
      ? null
      : rel?.finished
        ? "done"
        : correctionsIn
          ? "current"
          : "locked";
    const practice: StepState | null = !onPath
      ? null
      : pathPassed(id)
        ? "done"
        : rel && bundleDone(rel.bundleId)
          ? "current"
          : "locked";
    const approved = corrections === "done";
    const pathDone = relearn === "done" && practice === "done";

    let raisedTo: number | null = null;
    let raisedBy: PathTargetState["raisedBy"] = null;
    if (input.type === "formative" && input.raises) {
      if (role === "required" && pathDone && approved) {
        raisedTo = input.threshold;
        raisedBy = "relearning_path";
      } else if (role === "optional" && onPath && pathDone && approved) {
        raisedTo = 100;
        raisedBy = "relearning_path";
      } else if (
        role === "optional" &&
        optedIn &&
        correctionsState === "approved" &&
        firstPercent < CORRECTIONS_RAISE
      ) {
        raisedTo = CORRECTIONS_RAISE;
        raisedBy = "corrections_to_90";
      }
    }

    // Counting: the highest of attempt 1, the raise, and every later attempt that served it.
    let counting = firstPercent;
    let countingFrom = first.id;
    if (raisedTo !== null && raisedTo > counting) counting = raisedTo;
    for (const a of attempts.slice(1)) {
      const on = a.perTarget[id];
      if (!on) continue;
      const p = pct(on.earned, on.possible);
      if (p > counting) {
        counting = p;
        countingFrom = a.id;
      }
    }

    const passedAt = input.checks
      .filter((c) => c.purpose === "path" && c.passed && c.targetIds.includes(id) && c.passedAt)
      .map((c) => c.passedAt!.getTime());
    const doneAt = {
      corrections:
        corrections === "done" && correctionsState === "approved"
          ? (input.correctionsDoneAt?.[id] ?? null)
          : null,
      relearn: relearn === "done" ? (rel?.finishedAt ?? null) : null,
      practice: practice === "done" && passedAt.length ? new Date(Math.min(...passedAt)) : null,
    };

    return {
      ...t,
      firstPercent,
      role,
      optedIn,
      onPath,
      correctionsState,
      corrections,
      relearn,
      practice,
      bundleId: rel?.bundleId ?? null,
      raisedTo,
      raisedBy,
      counting,
      countingFrom,
      doneAt,
    };
  });

  const required = targets.filter((t) => t.role === "required");
  const complete = required.every(
    (t) => t.corrections === "done" && t.relearn === "done" && t.practice === "done"
  );

  // After a retake (Q6): its targets still below the threshold need a fresh passed check first.
  const latest = attempts.at(-1)!;
  let attemptCheck: PathState["attemptCheck"] = null;
  if (latest.number >= 2) {
    const below = ids.filter((id) => {
      const on = latest.perTarget[id];
      return !!on && pct(on.earned, on.possible) < input.threshold;
    });
    if (below.length) {
      const next = latest.number + 1;
      attemptCheck = {
        attemptNumber: next,
        targetIds: below,
        passed: input.checks.some(
          (c) => c.purpose === "attempt" && c.unlocksAttemptNumber === next && c.passed
        ),
      };
    }
  }

  const final = input.type === "formative" ? quizFinal(first, attempts, targets) : null;

  const blockers: PathBlocker[] = [];
  const idsOf = (list: PathTargetState[]) => list.map((t) => t.id);
  const holds = targets.filter((t) => holdsRetake(t, input.type, input.raises));
  if (final && final.percent >= 100) blockers.push({ kind: "at_full" });
  const returned = holds.filter((t) => t.correctionsState === "returned");
  if (returned.length) blockers.push({ kind: "corrections_returned", targetIds: idsOf(returned) });
  const owed = holds.filter((t) => t.correctionsState === "needed");
  if (owed.length) blockers.push({ kind: "corrections", targetIds: idsOf(owed) });
  if (input.type === "formative" && input.raises && required.length === 0)
    blockers.push({ kind: "no_retake" });
  const relearnOwed = required.filter((t) => t.relearn !== "done");
  if (relearnOwed.length) blockers.push({ kind: "relearning", targetIds: idsOf(relearnOwed) });
  const checkOwed = required.filter((t) => t.practice !== "done");
  if (checkOwed.length) blockers.push({ kind: "check", targetIds: idsOf(checkOwed) });
  const waiting = holds.filter((t) => t.correctionsState === "submitted");
  if (waiting.length) blockers.push({ kind: "approval", targetIds: idsOf(waiting) });
  if (attemptCheck && !attemptCheck.passed)
    blockers.push({
      kind: "attempt_check",
      targetIds: attemptCheck.targetIds,
      attemptNumber: attemptCheck.attemptNumber,
    });

  return {
    type: input.type,
    threshold: input.threshold,
    raises: input.raises,
    passMark: input.passMark ?? 4,
    targets,
    required: idsOf(required),
    complete,
    attemptCheck,
    blockers,
    retakeReady: blockers.length === 0,
    final,
  };
}

/**
 * A quiz's counting score on the path (decision 25: per target): each target at its counting
 * percent, weighted by the points it had on attempt 1, plus any untagged questions at their best
 * attempt. The basis names the strongest route used: a retake, then the path, then corrections.
 */
function quizFinal(
  first: PathAttempt,
  attempts: PathAttempt[],
  targets: PathTargetState[]
): PathFinal {
  const perTarget: PathFinal["perTarget"] = {};
  let earned = 0;
  let targetPossible = 0;
  for (const t of targets) {
    const weight = first.perTarget[t.id].possible;
    const points = round2((t.counting / 100) * weight);
    perTarget[t.id] = {
      pointsEarned: points,
      pointsPossible: weight,
      percent: t.counting,
      fromAttemptId: t.countingFrom,
    };
    earned += points;
    targetPossible += weight;
  }
  // Untagged questions: their best share across attempts, at attempt 1's weight.
  const untagged = Math.max(0, first.possible - targetPossible);
  if (untagged > 0) {
    let best = 0;
    for (const a of attempts) {
      const e = a.earned - Object.values(a.perTarget).reduce((s, x) => s + x.earned, 0);
      const p = a.possible - Object.values(a.perTarget).reduce((s, x) => s + x.possible, 0);
      if (p > 0) best = Math.max(best, e / p);
    }
    earned += untagged * best;
  }
  const fromRetake = targets.some((t) => t.countingFrom !== first.id);
  const byPath = targets.some(
    (t) =>
      t.raisedBy === "relearning_path" && t.countingFrom === first.id && t.counting > t.firstPercent
  );
  const by90 = targets.some(
    (t) =>
      t.raisedBy === "corrections_to_90" &&
      t.countingFrom === first.id &&
      t.counting > t.firstPercent
  );
  const basis: PathFinal["basis"] = fromRetake
    ? "retake"
    : byPath
      ? "relearning_path"
      : by90
        ? "corrections_to_90"
        : "best_attempt";
  const retakes = attempts.slice(1);
  const bestRetake = retakes.length
    ? retakes.reduce((a, b) => (pct(b.earned, b.possible) >= pct(a.earned, a.possible) ? b : a))
    : null;
  return {
    totalEarned: round2(earned),
    totalPossible: first.possible,
    percent: pct(earned, first.possible),
    perTarget,
    bestAttemptId: basis === "retake" && bestRetake ? bestRetake.id : first.id,
    basis,
  };
}

// ---------------------------------------------------------------------------
// What the card and the actions read
// ---------------------------------------------------------------------------

/**
 * What corrections do on the path, in the terms the v2 code reads (`CorrectionsRule`): a quiz with
 * nothing below the threshold has no retake and corrections are its way up (`to_full`, though on
 * the path they raise to 90%, and the path to 100%); everything else is `gate`.
 */
export function pathRule(state: PathState): CorrectionsRule {
  return state.type === "formative" && state.raises && state.required.length === 0
    ? "to_full"
    : "gate";
}

/**
 * The card's learning-cycle state on the path, in the v2 states every list already shows (the
 * step path itself is R5): corrections sent back, then corrections owed on a required target (or
 * an opted-in test target), then relearning while any required target's relearning or check is
 * open (also while its corrections wait for approval, Q7), then waiting on the teacher's OK, then
 * the retake. A quiz with nothing required shows its optional corrections (→ 90%) and is done
 * after them. After a retake, a fresh check owed (Q6) reads as relearning.
 */
export function pathCycle(
  state: PathState,
  input: { attemptsUsed: number; attemptsAllowed: number | null; plan: RetakePlan | null }
): CycleState {
  const t = state.targets;
  // Corrections sent back show whichever target they're on: the student has something to fix.
  if (t.some((x) => x.corrections !== null && x.correctionsState === "returned"))
    return "corrections_returned";
  const blocks = (x: PathTargetState) => holdsRetake(x, state.type, state.raises);
  if (t.some((x) => blocks(x) && x.correctionsState === "needed")) return "corrections_needed";
  const pathOpen = (x: PathTargetState) =>
    x.onPath && (x.relearn !== "done" || x.practice !== "done");
  const attemptsLeft = input.attemptsAllowed === null || input.attemptsUsed < input.attemptsAllowed;
  const attemptCheckOwed = !!state.attemptCheck && !state.attemptCheck.passed;

  if (state.type === "formative") {
    if (state.raises && state.required.length === 0) {
      if (t.some((x) => x.optedIn && x.correctionsState === "needed")) return "corrections_to_full";
      if (t.some((x) => pathOpen(x) && x.relearn !== "locked")) return "relearning";
      if (t.some((x) => x.optedIn && x.correctionsState === "submitted"))
        return "corrections_submitted";
      return "done";
    }
    if (t.some((x) => x.role === "required" && pathOpen(x))) return "relearning";
    if (t.some((x) => x.role === "required" && x.correctionsState === "submitted"))
      return "corrections_submitted";
    if (!attemptsLeft) return "done";
    if (state.final && state.final.percent >= 100) return "done";
    if (attemptCheckOwed) return "relearning";
    return "retake_available";
  }

  if (t.some((x) => x.role === "required" && pathOpen(x))) return "relearning";
  if (t.some((x) => blocks(x) && x.correctionsState === "submitted"))
    return "corrections_submitted";
  if (!attemptsLeft) return "done";
  if (attemptCheckOwed) return "relearning";
  const plan = input.plan;
  if (!plan) return "done";
  if (plan.selected.length && plan.locked.length) return "relearning";
  if (plan.required.length) return "retake_required";
  if (plan.optional.length) return "retake_available";
  return "done";
}

/**
 * A test's retake gates on the path (S2–S3), as `retake_gates` stores them so the retake plan,
 * the card and the gradebook read the path unchanged: a required target's corrections approved,
 * its relearning finished, its practice check passed (and after a retake, the fresh check when the
 * target is still below the line, Q6); an optional target needs its corrections only.
 */
export function pathGates(
  state: PathState
): Map<string, { correctionsOk: boolean; activityOk: boolean; practiceOk: boolean }> {
  const fresh = state.attemptCheck && !state.attemptCheck.passed ? state.attemptCheck : null;
  return new Map(
    state.targets.map((t) => {
      const correctionsOk = t.corrections === null || t.corrections === "done";
      if (t.role !== "required")
        return [
          t.id,
          { correctionsOk, activityOk: true, practiceOk: !fresh?.targetIds.includes(t.id) },
        ];
      return [
        t.id,
        {
          correctionsOk,
          activityOk: t.relearn === "done",
          practiceOk: t.practice === "done" && !fresh?.targetIds.includes(t.id),
        },
      ];
    })
  );
}

/**
 * The practice check the student can take now (P5): a relearning bundle whose relearning is all
 * finished and whose check hasn't passed, else the fresh check before the next attempt (Q6) once
 * the path itself is done. Null when no check is waiting.
 */
export function nextCheck(
  state: PathState
):
  | { kind: "path"; bundleId: string; targetIds: string[] }
  | { kind: "attempt"; attemptNumber: number; targetIds: string[] }
  | null {
  const ready = state.targets.find((t) => t.onPath && t.bundleId && t.practice === "current");
  if (ready?.bundleId)
    return {
      kind: "path",
      bundleId: ready.bundleId,
      targetIds: state.targets.filter((t) => t.bundleId === ready.bundleId).map((t) => t.id),
    };
  if (state.complete && state.attemptCheck && !state.attemptCheck.passed)
    return {
      kind: "attempt",
      attemptNumber: state.attemptCheck.attemptNumber,
      targetIds: state.attemptCheck.targetIds,
    };
  return null;
}

/** "U3.LT1", "U3.LT1 and U3.LT2", "U3.LT1, U3.LT2 and U3.LT3". */
function list(codes: string[]): string {
  return codes.length <= 1
    ? (codes[0] ?? "")
    : `${codes.slice(0, -1).join(", ")} and ${codes.at(-1)}`;
}

/** Why the next attempt can't start, in the student's words (the first blocker). */
export function pathBlockerText(state: PathState, passMark: number): string | null {
  const b = state.blockers[0];
  if (!b) return null;
  const code = new Map(state.targets.map((t) => [t.id, t.code]));
  const codes = (ids: string[]) => list(ids.map((id) => code.get(id) ?? id));
  switch (b.kind) {
    case "at_full":
      return "You already have 100% on this quiz. There's nothing to retake.";
    case "corrections_returned":
      return "Your teacher sent your corrections back. Fix them and turn them in first.";
    case "corrections":
      return `Finish your corrections on ${codes(b.targetIds)} first.`;
    case "no_retake":
      return "There's no retake at your score. Your corrections raise it to 90%, and the relearning path to 100%.";
    case "relearning":
      return `Do your relearning on ${codes(b.targetIds)} first.`;
    case "check":
      return `Pass the practice check on ${codes(b.targetIds)} first: ${passMark} of ${CHECK_SIZE} right.`;
    case "approval":
      return "Your corrections are waiting for your teacher's OK.";
    case "attempt_check":
      return `Pass a new practice check on ${codes(b.targetIds)} before attempt ${b.attemptNumber}: ${passMark} of ${CHECK_SIZE} right.`;
  }
}
