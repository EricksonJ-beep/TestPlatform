/**
 * The step path (Jon, Nov 3–4 2026: "make the UI a lot more visually appealing and help guide
 * those students"; docs/relearning-revamp-plan.md "Student view", ticket R5). Pure: a student's
 * relearning path as lines of connected steps (Corrections · Relearn · Practice check · 80% earned
 * · Retake), one Next step with one button, and a quiz's end choice (Keep my 80% / Take the
 * retake). Built from the path rule (`pathFor`) and the card's cycle (`pathCycle`), the same state
 * the teacher's gradebook cell reads, so the two always agree.
 */
import type { CycleState } from "@/lib/retakes";
import { nextCheck, type PathState, type PathTargetState } from "@/lib/relearning-path";

export type PathStepKind = "corrections" | "relearn" | "practice" | "earned" | "retake";

export type PathStep = {
  kind: PathStepKind;
  label: string;
  state: "done" | "waiting" | "current" | "locked";
  /** Locked: why, in one line. Waiting: what it waits for. */
  note: string | null;
};

export type PathLine = {
  key: string;
  /** The line's target, e.g. "U3.LT1"; null for a single quiz path or the step before an attempt. */
  code: string | null;
  title: string | null;
  steps: PathStep[];
};

export type NextStepAction =
  | { kind: "corrections"; label: string; href: string }
  | { kind: "relearn"; label: string; href: string }
  | { kind: "check"; label: string; checkKind: "path" | "attempt"; bundleId: string | null }
  | { kind: "retake"; label: string }
  | { kind: "ask"; label: string }
  | { kind: "none" };

export type NextStep = {
  headline: string;
  /** "About 10 minutes"; null where it doesn't apply. */
  minutes: number | null;
  action: NextStepAction;
  /** "todo" counts on the home page; "waiting" is on the teacher; "higher" is optional. */
  group: "todo" | "waiting" | "higher";
};

export type StepPathView = {
  lines: PathLine[];
  /** Under several lines: "Retake unlocks when every line is ✓". */
  footer: string | null;
  next: NextStep | null;
  /** A quiz at the end of its path (decision 28): keep the raised score or take the retake. */
  endChoice: { percent: number } | null;
  /** The student kept the raised score for now (decision 28). */
  kept: boolean;
  /** A quiz's 80%+ targets and what the student has chosen for them (Q2). */
  optional: { id: string; code: string; percent: number; correcting: boolean; added: boolean }[];
};

export type StepPathInput = {
  path: PathState;
  assignmentId: string;
  type: "formative" | "summative";
  /** The attempt whose corrections the path reads (attempt 1); null before any. */
  correctionsAttemptId: string | null;
  cycle: CycleState | null;
  attemptsUsed: number;
  attemptsAllowed: number | null;
  /** The retake has to be asked for (closed, the window passed, or "Retakes need my OK"). */
  mustAsk: boolean;
  /** The wait between attempts, if one is running. */
  nextAttemptAt: Date | null;
  /** "Keep my 80%" was chosen after the latest attempt (decision 28). */
  kept: boolean;
};

const LOCKED = {
  relearn: "Opens after your corrections",
  practice: "Opens after your relearning",
  earned: "Opens after your practice check",
  retake: "Opens when your path is done",
};

/** "U3.LT1", "U3.LT1 and U3.LT2", "U3.LT1, U3.LT2 and U3.LT3". */
function list(codes: string[]): string {
  return codes.length <= 1
    ? (codes[0] ?? "")
    : `${codes.slice(0, -1).join(", ")} and ${codes.at(-1)}`;
}

function correctionsStep(t: PathTargetState): PathStep | null {
  if (t.corrections === null) return null;
  const returned = t.correctionsState === "returned";
  return {
    kind: "corrections",
    label: "Corrections",
    state: t.corrections,
    note:
      t.corrections === "waiting"
        ? "Turned in, waiting for your teacher's OK"
        : returned
          ? "Sent back: fix them and turn them in"
          : null,
  };
}

/** A target's relearning step: one already under way counts as current even before its corrections are in. */
function relearnStep(t: PathTargetState): PathStep {
  const state = t.relearn === "locked" && t.bundleId ? "current" : (t.relearn ?? "locked");
  return {
    kind: "relearn",
    label: "Relearn",
    state,
    note: state === "locked" ? LOCKED.relearn : null,
  };
}

function practiceStep(t: PathTargetState): PathStep {
  const state = t.practice ?? "locked";
  return {
    kind: "practice",
    label: "Practice check",
    state,
    note: state === "locked" ? LOCKED.practice : null,
  };
}

/**
 * A quiz target's raise (Q1, Q2): required → the threshold once the path is done and corrections
 * approved; added → 100; corrections only → 90. Waiting while the path is done but the teacher
 * hasn't approved the corrections (Q7).
 */
function earnedStep(t: PathTargetState, threshold: number): PathStep | null {
  const target =
    t.role === "required"
      ? threshold
      : t.onPath
        ? 100
        : t.optedIn && t.firstPercent < 90
          ? 90
          : null;
  if (target === null) return null;
  const label = target === 100 ? "100%" : `${target}% earned`;
  if (t.counting >= target) return { kind: "earned", label, state: "done", note: null };
  const pathDone = t.onPath ? t.relearn === "done" && t.practice === "done" : true;
  const correctionsIn = t.corrections === "done" || t.corrections === "waiting";
  if (pathDone && correctionsIn && t.corrections === "waiting")
    return { kind: "earned", label, state: "waiting", note: "Waiting for your teacher's OK" };
  return {
    kind: "earned",
    label,
    state: "locked",
    note: t.onPath ? LOCKED.earned : "Opens after your corrections",
  };
}

/**
 * Rule (R5): a test shows one line per required target (Corrections · Relearn · Practice check)
 * and one per target added to a custom retake (Corrections), with "Retake unlocks when every line
 * is ✓" under them. A quiz shows a single path (its one target's steps, then 80% earned and the
 * retake) unless more than one target has work to do; then a line per target. After a retake, a
 * fresh check owed before the next attempt (Q6) is a line of its own. The Next step is the first
 * thing the student can do: corrections (sent back first), relearning (also while corrections
 * wait for the teacher, Q7), the practice check, the check before the next attempt, then the
 * retake; otherwise what they're waiting on.
 */
export function buildStepPath(input: StepPathInput): StepPathView {
  const { path } = input;
  const quiz = input.type === "formative";
  const t = path.targets;
  const required = t.filter((x) => x.role === "required");
  const withWork = t.filter((x) => x.role === "required" || x.optedIn || x.onPath);
  const attemptsLeft = input.attemptsAllowed === null || input.attemptsUsed < input.attemptsAllowed;
  const retakeTaken = input.attemptsUsed >= 2;

  // --- Lines ---
  const lines: PathLine[] = [];
  const lineFor = (x: PathTargetState, withRetake: boolean): PathLine => {
    const steps: PathStep[] = [];
    const c = correctionsStep(x);
    if (c) steps.push(c);
    if (x.role === "required" || x.onPath) steps.push(relearnStep(x), practiceStep(x));
    if (quiz && path.raises) {
      const e = earnedStep(x, path.threshold);
      if (e) steps.push(e);
    }
    if (withRetake) steps.push(retakeStep());
    return { key: x.id, code: x.code, title: x.title, steps };
  };
  const retakeStep = (): PathStep => {
    const available = input.cycle === "retake_available" || input.cycle === "retake_required";
    return {
      kind: "retake",
      label: "Retake",
      state: available ? "current" : retakeTaken && input.cycle === "done" ? "done" : "locked",
      note: available ? null : !attemptsLeft ? "No retakes left" : LOCKED.retake,
    };
  };
  if (quiz) {
    if (withWork.length <= 1) {
      const only = withWork[0];
      if (only) lines.push({ ...lineFor(only, required.length > 0 && attemptsLeft), code: null });
    } else for (const x of withWork) lines.push(lineFor(x, false));
  } else {
    for (const x of required) lines.push(lineFor(x, false));
    for (const x of t.filter((y) => y.role !== "required" && y.optedIn))
      lines.push(lineFor(x, false));
  }
  const check = path.attemptCheck;
  if (check && !check.passed)
    lines.push({
      key: "attempt-check",
      code: null,
      title: `Before attempt ${check.attemptNumber}`,
      steps: [{ kind: "practice", label: "Practice check", state: "current", note: null }],
    });
  const footer =
    !quiz && lines.length > 1
      ? "Retake unlocks when every line is ✓"
      : quiz && lines.length > 1 && required.length > 0
        ? "When every line is ✓, you can keep your score or retake the quiz"
        : null;

  // --- Next step ---
  const href = (p: string) => `/student/${p}`;
  const codes = (xs: PathTargetState[]) => list(xs.map((x) => x.code));
  const correctionsHref = input.correctionsAttemptId
    ? href(`corrections/${input.correctionsAttemptId}`)
    : href(`assignments/${input.assignmentId}`);
  const returned = t.filter((x) => x.corrections !== null && x.correctionsState === "returned");
  const owed = t.filter(
    (x) =>
      x.corrections === "current" &&
      x.correctionsState === "needed" &&
      (x.role === "required" || x.optedIn || x.onPath)
  );
  const relearnNow = t.filter(
    (x) => (x.role === "required" || x.onPath) && relearnStep(x).state === "current"
  );
  const waitingOk = t.some((x) => x.corrections === "waiting");
  const pending = nextCheck(path);
  let next: NextStep | null = null;
  if (returned.length) {
    next = {
      headline: "Your teacher sent your corrections back. Fix them and turn them in.",
      minutes: null,
      action: { kind: "corrections", label: "Revise corrections", href: correctionsHref },
      group: "todo",
    };
  } else if (owed.length && !(waitingOk && relearnNow.length)) {
    const optionalOnly = owed.every((x) => x.role !== "required") && quiz && path.raises;
    next = {
      headline: `Do your corrections on ${codes(owed)}.${
        optionalOnly ? " They raise it to 90%." : ""
      }`,
      minutes: null,
      action: { kind: "corrections", label: "Do corrections", href: correctionsHref },
      group: optionalOnly ? "higher" : "todo",
    };
  } else if (relearnNow.length) {
    const started = relearnNow.some((x) => x.bundleId);
    const first = relearnNow[0];
    const minutes = quiz && relearnNow.length > 1 ? 4 * relearnNow.length : 10;
    next = {
      headline: waitingOk
        ? "Start your relearning while you wait for your teacher's OK."
        : started
          ? `Keep going on your relearning for ${codes(relearnNow)}.`
          : `Relearn ${quiz ? codes(relearnNow) : first.code}: pick Read, Watch or Do.`,
      minutes,
      action: {
        kind: "relearn",
        label: started ? "Keep relearning" : "Start relearning",
        href: href(`relearning/${input.assignmentId}${quiz ? "" : `?target=${first.id}`}`),
      },
      group: required.length || !quiz ? "todo" : "higher",
    };
  } else if (pending?.kind === "path") {
    next = {
      headline: `Practice check on ${list(
        pending.targetIds.map((id) => t.find((x) => x.id === id)?.code ?? "")
      )}: get ${path.passMark} of 5 right. Your first answer counts.`,
      minutes: 5,
      action: {
        kind: "check",
        label: "Start practice check",
        checkKind: "path",
        bundleId: pending.bundleId,
      },
      group: "todo",
    };
  } else if (pending?.kind === "attempt") {
    next = {
      headline: `Before attempt ${pending.attemptNumber}, pass a new practice check on ${list(
        pending.targetIds.map((id) => t.find((x) => x.id === id)?.code ?? "")
      )}: ${path.passMark} of 5 right.`,
      minutes: 5,
      action: {
        kind: "check",
        label: "Start practice check",
        checkKind: "attempt",
        bundleId: null,
      },
      group: "todo",
    };
  } else if (input.cycle === "corrections_submitted" || (waitingOk && !path.retakeReady)) {
    next = {
      headline: "Your corrections are in. Your teacher is checking them.",
      minutes: null,
      action: { kind: "none" },
      group: "waiting",
    };
  } else if (input.cycle === "retake_required" || input.cycle === "retake_available") {
    const optional = input.cycle === "retake_available";
    const raised = quiz && path.raises && required.length > 0;
    const percent = Math.round(path.final?.percent ?? 0);
    const action: NextStepAction = input.mustAsk
      ? { kind: "ask", label: "Ask to retake" }
      : { kind: "retake", label: "Take the retake" };
    next = {
      headline: input.nextAttemptAt
        ? "You can start the retake after the wait."
        : raised
          ? input.kept
            ? `Done for now: you kept your ${percent}%. You can still retake it to go higher.`
            : `You earned ${percent}%. Keep it, or retake the quiz to go higher. Your highest score counts.`
          : quiz
            ? "Retake it to raise your score. Your highest score counts."
            : optional
              ? "You can retake to go higher. Your best score on each target counts."
              : `Retake ${codes(required.filter((x) => x.counting < path.threshold)) || "the test"}. Your best score on each target counts.`,
      minutes: null,
      action: input.nextAttemptAt ? { kind: "none" } : action,
      group: optional ? "higher" : "todo",
    };
  }

  const endChoice =
    quiz &&
    path.raises &&
    required.length > 0 &&
    input.cycle === "retake_available" &&
    !input.kept &&
    !input.nextAttemptAt
      ? { percent: Math.round(path.final?.percent ?? path.threshold) }
      : null;

  const optional = quiz
    ? t
        .filter((x) => x.role === "optional")
        .map((x) => ({
          id: x.id,
          code: x.code,
          percent: Math.round(x.firstPercent),
          correcting: x.optedIn,
          added: x.onPath,
        }))
    : [];

  return { lines, footer, next, endChoice, kept: input.kept, optional };
}
