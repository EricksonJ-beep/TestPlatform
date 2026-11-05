/**
 * The step path (docs/relearning-revamp-plan.md "Student view", ticket R5): lines, the Next step
 * and the quiz end choice, over the path rule's own states (the "Done when" walk: a 40% quiz, a
 * 40/90 mixed quiz, a two-target test).
 */
import { describe, expect, it } from "vitest";
import {
  pathCycle,
  pathFor,
  type PathAttempt,
  type PathCheck,
  type PathInput,
  type PathRelearning,
} from "./relearning-path";
import { buildStepPath, type StepPathInput } from "./step-path";

const target = (n: number) => ({
  id: `lt${n}`,
  code: `LT${n}`,
  title: `Target ${n}`,
  sortOrder: n,
});
function attempt(
  id: string,
  number: number,
  scores: Record<string, [number, number]>
): PathAttempt {
  const perTarget = Object.fromEntries(
    Object.entries(scores).map(([t, [earned, possible]]) => [t, { earned, possible }])
  );
  const earned = Object.values(scores).reduce((s, [e]) => s + e, 0);
  const possible = Object.values(scores).reduce((s, [, p]) => s + p, 0);
  return { id, number, earned, possible, perTarget };
}
const rel = (lt: string, bundleId: string, finished = true, added = false): PathRelearning => ({
  learningTargetId: lt,
  bundleId,
  finished,
  added,
});
const passed = (targetIds: string[], bundleId: string): PathCheck => ({
  purpose: "path",
  targetIds,
  bundleId,
  unlocksAttemptNumber: null,
  passed: true,
});

function view(
  input: Partial<PathInput> & Pick<PathInput, "attempts">,
  over: Partial<StepPathInput> = {}
) {
  const state = pathFor({
    type: "formative",
    threshold: 80,
    raises: true,
    targets: [target(1), target(2), target(3), target(4)],
    corrections: {},
    optedIn: [],
    relearning: [],
    checks: [],
    ...input,
  });
  const attemptsUsed = input.attempts.length;
  return buildStepPath({
    path: state,
    assignmentId: "a1",
    type: state.type,
    correctionsAttemptId: "att1",
    cycle: pathCycle(state, { attemptsUsed, attemptsAllowed: 3, plan: null }),
    attemptsUsed,
    attemptsAllowed: 3,
    mustAsk: false,
    nextAttemptAt: null,
    kept: false,
    ...over,
  });
}
const states = (v: ReturnType<typeof view>, line = 0) =>
  v.lines[line].steps.map((s) => `${s.label}:${s.state}`);

describe("a 40% quiz: one path, one next step at a time", () => {
  const first = attempt("att1", 1, { lt1: [2, 5] });
  it("starts at corrections, everything after it locked with its reason", () => {
    const v = view({ attempts: [first], corrections: { lt1: "needed" } });
    expect(v.lines).toHaveLength(1);
    expect(states(v)).toEqual([
      "Corrections:current",
      "Relearn:locked",
      "Practice check:locked",
      "80% earned:locked",
      "Retake:locked",
    ]);
    expect(v.lines[0].steps[1].note).toBe("Opens after your corrections");
    expect(v.next).toMatchObject({
      headline: "Do your corrections on LT1.",
      action: { kind: "corrections", href: "/student/corrections/att1" },
      group: "todo",
    });
  });

  it("while the teacher checks the corrections, the relearning goes ahead (Q7)", () => {
    const v = view({ attempts: [first], corrections: { lt1: "submitted" } });
    expect(states(v).slice(0, 2)).toEqual(["Corrections:waiting", "Relearn:current"]);
    expect(v.lines[0].steps[0].note).toBe("Turned in, waiting for your teacher's OK");
    expect(v.next).toMatchObject({
      headline: "Start your relearning while you wait for your teacher's OK.",
      minutes: 10,
      action: { kind: "relearn", href: "/student/relearning/a1", label: "Start relearning" },
    });
  });

  it("then the practice check, then 80% earned and the end choice (decision 28)", () => {
    const check = view({
      attempts: [first],
      corrections: { lt1: "approved" },
      relearning: [rel("lt1", "b1")],
    });
    expect(check.next).toMatchObject({
      action: { kind: "check", checkKind: "path", bundleId: "b1" },
      minutes: 5,
    });
    const done = view({
      attempts: [first],
      corrections: { lt1: "approved" },
      relearning: [rel("lt1", "b1")],
      checks: [passed(["lt1"], "b1")],
    });
    expect(states(done)).toEqual([
      "Corrections:done",
      "Relearn:done",
      "Practice check:done",
      "80% earned:done",
      "Retake:current",
    ]);
    expect(done.endChoice).toEqual({ percent: 80 });
    expect(done.next).toMatchObject({ action: { kind: "retake" }, group: "higher" });
    // Keep my 80%: done for now, no end choice; the retake stays offered.
    const kept = view(
      {
        attempts: [first],
        corrections: { lt1: "approved" },
        relearning: [rel("lt1", "b1")],
        checks: [passed(["lt1"], "b1")],
      },
      { kept: true }
    );
    expect(kept.endChoice).toBeNull();
    expect(kept.next?.headline).toMatch(/^Done for now: you kept your 80%/);
  });

  it("a closed quiz asks to retake instead of starting one (Q8)", () => {
    const v = view(
      {
        attempts: [first],
        corrections: { lt1: "approved" },
        relearning: [rel("lt1", "b1")],
        checks: [passed(["lt1"], "b1")],
      },
      { mustAsk: true }
    );
    expect(v.next?.action).toEqual({ kind: "ask", label: "Ask to retake" });
  });
});

describe("a 40/90 mixed quiz: a line per target once both have work (Q2, decision 31)", () => {
  const first = attempt("att1", 1, { lt1: [2, 5], lt2: [9, 10] });
  it("shows LT2 as an optional choice until the student opts in", () => {
    const v = view({ attempts: [first], corrections: { lt1: "approved", lt2: "needed" } });
    expect(v.lines).toHaveLength(1);
    expect(v.optional).toEqual([
      { id: "lt2", code: "LT2", percent: 90, correcting: false, added: false },
    ]);
  });

  it("with LT2 added to the relearning: two lines, LT2 to 100%", () => {
    const v = view({
      attempts: [first],
      corrections: { lt1: "approved", lt2: "approved" },
      optedIn: ["lt2"],
      relearning: [rel("lt1", "b1", false), rel("lt2", "b1", false, true)],
    });
    expect(v.lines.map((l) => l.code)).toEqual(["LT1", "LT2"]);
    expect(states(v, 1)).toEqual([
      "Corrections:done",
      "Relearn:current",
      "Practice check:locked",
      "100%:locked",
    ]);
    expect(v.footer).toBe("When every line is ✓, you can keep your score or retake the quiz");
    expect(v.next).toMatchObject({
      headline: "Keep going on your relearning for LT1 and LT2.",
      minutes: 8,
    });
  });
});

describe("a two-target test: one line per target, the retake after every line (S1–S3)", () => {
  const first = attempt("att1", 1, { lt1: [5, 5], lt2: [3, 5], lt3: [4, 5], lt4: [3, 5] });
  const test = (over: Partial<PathInput>) =>
    view({ type: "summative", attempts: [first], ...over }, { attemptsAllowed: 2 });
  it("lines for LT2 and LT4, each on its own step, with the footer", () => {
    const v = test({
      corrections: { lt2: "approved", lt4: "approved" },
      relearning: [rel("lt2", "b2")],
      checks: [passed(["lt2"], "b2")],
    });
    expect(v.lines.map((l) => l.code)).toEqual(["LT2", "LT4"]);
    expect(states(v, 0)).toEqual(["Corrections:done", "Relearn:done", "Practice check:done"]);
    expect(states(v, 1)).toEqual(["Corrections:done", "Relearn:current", "Practice check:locked"]);
    expect(v.footer).toBe("Retake unlocks when every line is ✓");
    expect(v.next).toMatchObject({
      headline: "Relearn LT4: pick Read, Watch or Do.",
      action: { href: "/student/relearning/a1?target=lt4" },
    });
    expect(v.endChoice).toBeNull();
  });

  it("an added 80% target asks for its corrections only (decision 29)", () => {
    const v = test({
      corrections: { lt2: "approved", lt4: "approved", lt3: "needed" },
      optedIn: ["lt3"],
    });
    expect(v.lines.map((l) => l.code)).toEqual(["LT2", "LT4", "LT3"]);
    expect(states(v, 2)).toEqual(["Corrections:current"]);
    expect(v.next).toMatchObject({ headline: "Do your corrections on LT3." });
  });
});

describe("dates on done steps", () => {
  it("shows the school-time date each step was finished; steps without a date show none", () => {
    const first = attempt("att1", 1, { lt1: [2, 5] });
    // 3:00 UTC on Nov 5 is still Nov 4 in Cadott (Central time).
    const v = view({
      attempts: [first],
      corrections: { lt1: "approved" },
      correctionsDoneAt: { lt1: new Date("2026-11-03T15:00:00Z") },
      relearning: [{ ...rel("lt1", "b1"), finishedAt: new Date("2026-11-05T03:00:00Z") }],
      checks: [{ ...passed(["lt1"], "b1"), passedAt: new Date("2026-11-05T16:00:00Z") }],
    });
    expect(v.lines[0].steps.slice(0, 3).map((s) => [s.label, s.state, s.note])).toEqual([
      ["Corrections", "done", "Done Nov 3"],
      ["Relearn", "done", "Done Nov 4"],
      ["Practice check", "done", "Done Nov 5"],
    ]);
    const undated = view({
      attempts: [first],
      corrections: { lt1: "approved" },
      relearning: [rel("lt1", "b1")],
      checks: [passed(["lt1"], "b1")],
    });
    expect(undated.lines[0].steps.slice(0, 3).map((s) => s.note)).toEqual([null, null, null]);
  });
});
