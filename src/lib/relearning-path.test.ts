/**
 * The relearning path rule (docs/relearning-revamp-plan.md, ticket R2), one scenario per line of
 * the ticket's "Done when": quizzes at 40%, 85%, 95% and 100%, a mixed quiz, retakes and attempt 3,
 * teacher-approved corrections, a test with two targets below the line, and the course switch.
 */
import { describe, expect, it } from "vitest";
import type { CorrectionsState } from "@/lib/corrections";
import { pathRequestBlocker } from "@/lib/needs-you";
import type { RetakePlan } from "@/lib/retakes";
import {
  pathBlockerText,
  pathCorrectionTargets,
  pathCycle,
  pathFor,
  pathGates,
  pathRule,
  splitCheck,
  usesPathRules,
  type PathAttempt,
  type PathCheck,
  type PathInput,
  type PathRelearning,
} from "./relearning-path";

const target = (n: number) => ({
  id: `lt${n}`,
  code: `LT${n}`,
  title: `Target ${n}`,
  sortOrder: n,
});

/** An attempt from per-target [earned, possible] pairs. */
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
const pathCheck = (targetIds: string[], bundleId: string, passed = true): PathCheck => ({
  purpose: "path",
  targetIds,
  bundleId,
  unlocksAttemptNumber: null,
  passed,
});
const attemptCheck = (targetIds: string[], unlocks: number, passed = true): PathCheck => ({
  purpose: "attempt",
  targetIds,
  bundleId: null,
  unlocksAttemptNumber: unlocks,
  passed,
});

function quiz(over: Partial<PathInput>): PathInput {
  return {
    type: "formative",
    threshold: 80,
    raises: true,
    targets: [target(1), target(2), target(3), target(4)],
    attempts: [],
    corrections: {},
    optedIn: [],
    relearning: [],
    checks: [],
    ...over,
  };
}
const test = (over: Partial<PathInput>) => quiz({ type: "summative", raises: false, ...over });

const card = (
  input: PathInput,
  extra: { used?: number; allowed?: number | null; plan?: RetakePlan | null } = {}
) =>
  pathCycle(pathFor(input), {
    attemptsUsed: extra.used ?? input.attempts.length,
    attemptsAllowed: extra.allowed === undefined ? 3 : extra.allowed,
    plan: extra.plan ?? null,
  });

const kinds = (input: PathInput) => pathFor(input).blockers.map((b) => b.kind);
const corr = (state: CorrectionsState) => ({ lt1: state });

describe("usesPathRules (decision 26: the course switch)", () => {
  const from = new Date("2026-12-01T12:00:00Z");
  const base = { type: "formative" as const, cvtcRules: false, relearningPathFrom: from };
  it("applies from the switch-on moment, by attempt 1's turn-in time", () => {
    expect(usesPathRules({ ...base, firstSubmittedAt: new Date("2026-12-01T12:00:00Z") })).toBe(
      true
    );
    expect(usesPathRules({ ...base, firstSubmittedAt: new Date("2026-12-02T08:00:00Z") })).toBe(
      true
    );
  });
  it("keeps the old rules before it, with no switch, before attempt 1, in CVTC courses and on practice", () => {
    expect(usesPathRules({ ...base, firstSubmittedAt: new Date("2026-11-30T23:59:00Z") })).toBe(
      false
    );
    expect(usesPathRules({ ...base, relearningPathFrom: null, firstSubmittedAt: from })).toBe(
      false
    );
    expect(usesPathRules({ ...base, firstSubmittedAt: null })).toBe(false);
    expect(usesPathRules({ ...base, cvtcRules: true, firstSubmittedAt: from })).toBe(false);
    expect(usesPathRules({ ...base, type: "practice", firstSubmittedAt: from })).toBe(false);
  });
});

describe("pathCorrectionTargets (S1, decision 31)", () => {
  it("scopes the targets below the line plus the ones opted into", () => {
    const scope = pathCorrectionTargets({
      type: "formative",
      attemptNumber: 1,
      targetPercents: { lt1: 40, lt2: 90, lt3: 85 },
      threshold: 80,
      optedInTargetIds: ["lt3"],
    });
    expect(scope).toEqual(new Set(["lt1", "lt3"]));
  });
  it("opens every missed question on a quiz with nothing below the line", () => {
    expect(
      pathCorrectionTargets({
        type: "formative",
        attemptNumber: 1,
        targetPercents: { lt1: 85 },
        threshold: 80,
        optedInTargetIds: [],
      })
    ).toBe("all");
  });
  it("never opens a test's 80%+ targets without an opt-in, and nothing after attempt 1", () => {
    expect(
      pathCorrectionTargets({
        type: "summative",
        attemptNumber: 1,
        targetPercents: { lt1: 85 },
        threshold: 80,
        optedInTargetIds: [],
      })
    ).toEqual(new Set());
    expect(
      pathCorrectionTargets({
        type: "formative",
        attemptNumber: 2,
        targetPercents: { lt1: 40 },
        threshold: 80,
        optedInTargetIds: [],
      })
    ).toEqual(new Set());
  });
});

describe("splitCheck (decision 10, Q4)", () => {
  it("splits 5 questions evenly, the extra going to the weakest", () => {
    expect(splitCheck([{ id: "a", percent: 40 }])).toEqual(new Map([["a", 5]]));
    expect(
      splitCheck([
        { id: "strong", percent: 90 },
        { id: "weak", percent: 40 },
      ])
    ).toEqual(
      new Map([
        ["weak", 3],
        ["strong", 2],
      ])
    );
    const three = splitCheck([
      { id: "a", percent: 70 },
      { id: "b", percent: 30 },
      { id: "c", percent: 50 },
    ]);
    expect([three.get("b"), three.get("c"), three.get("a")]).toEqual([2, 2, 1]);
  });
});

describe("a quiz at 40% (Q1)", () => {
  const first = attempt("a1", 1, { lt1: [4, 10] });

  it("owes corrections first, and corrections alone raise nothing", () => {
    const owed = quiz({ attempts: [first], corrections: corr("needed") });
    const s = pathFor(owed);
    expect(s.targets[0]).toMatchObject({
      role: "required",
      corrections: "current",
      relearn: "locked",
      practice: "locked",
      raisedTo: null,
    });
    expect(s.blockers[0].kind).toBe("corrections");
    expect(card(owed)).toBe("corrections_needed");

    const corrected = quiz({ attempts: [first], corrections: corr("approved") });
    const c = pathFor(corrected);
    expect(c.final!.percent).toBe(40);
    expect(c.targets[0]).toMatchObject({
      corrections: "done",
      relearn: "current",
      practice: "locked",
    });
    expect(card(corrected)).toBe("relearning");
    expect(pathBlockerText(c, 4)).toBe("Do your relearning on LT1 first.");
  });

  it("opens the check after the relearning, and raises to 80 once it passes", () => {
    const relearned = quiz({
      attempts: [first],
      corrections: corr("approved"),
      relearning: [rel("lt1", "b1")],
    });
    const r = pathFor(relearned);
    expect(r.targets[0]).toMatchObject({ relearn: "done", practice: "current", raisedTo: null });
    expect(r.final!.percent).toBe(40);
    expect(pathBlockerText(r, 4)).toBe("Pass the practice check on LT1 first: 4 of 5 right.");

    const passed = quiz({ ...relearned, checks: [pathCheck(["lt1"], "b1")] });
    const p = pathFor(passed);
    expect(p.targets[0]).toMatchObject({
      practice: "done",
      raisedTo: 80,
      raisedBy: "relearning_path",
    });
    expect(p.final).toMatchObject({ percent: 80, basis: "relearning_path", bestAttemptId: "a1" });
    expect(p.complete).toBe(true);
    expect(p.retakeReady).toBe(true);
    expect(pathRule(p)).toBe("gate");
    expect(card(passed)).toBe("retake_available");
  });

  it("lets a retake take it higher: 40 → 80 → 95", () => {
    const retaken = quiz({
      attempts: [first, attempt("a2", 2, { lt1: [9.5, 10] })],
      corrections: corr("approved"),
      relearning: [rel("lt1", "b1")],
      checks: [pathCheck(["lt1"], "b1")],
    });
    const s = pathFor(retaken);
    expect(s.final).toMatchObject({ percent: 95, basis: "retake", bestAttemptId: "a2" });
    expect(s.targets[0].counting).toBe(95);
    expect(s.attemptCheck).toBeNull();
    expect(s.retakeReady).toBe(true);
    expect(card(retaken)).toBe("retake_available");
    expect(card(retaken, { allowed: 2 })).toBe("done");
  });
});

describe("a quiz at 80% or higher (Q2, decision 18)", () => {
  it("85% → 90 with corrections → 100 with the path, and never offers a retake", () => {
    const first = attempt("a1", 1, { lt1: [8.5, 10] });
    const owed = quiz({ attempts: [first], corrections: corr("needed") });
    const o = pathFor(owed);
    expect(o.targets[0]).toMatchObject({ role: "optional", optedIn: true, corrections: "current" });
    expect(pathRule(o)).toBe("to_full");
    expect(o.blockers.map((b) => b.kind)).toEqual(["no_retake"]);
    expect(card(owed)).toBe("corrections_to_full");

    const corrected = quiz({ attempts: [first], corrections: corr("approved") });
    const c = pathFor(corrected);
    expect(c.targets[0]).toMatchObject({ raisedTo: 90, raisedBy: "corrections_to_90" });
    expect(c.final).toMatchObject({ percent: 90, basis: "corrections_to_90" });
    expect(card(corrected)).toBe("done");

    const pathDone = quiz({
      attempts: [first],
      corrections: corr("approved"),
      relearning: [rel("lt1", "b1", true, true)],
      checks: [pathCheck(["lt1"], "b1")],
    });
    const p = pathFor(pathDone);
    expect(p.targets[0]).toMatchObject({
      onPath: true,
      raisedTo: 100,
      raisedBy: "relearning_path",
    });
    expect(p.final).toMatchObject({ percent: 100, basis: "relearning_path" });
    expect(kinds(pathDone)).toEqual(["at_full", "no_retake"]);
    expect(card(pathDone)).toBe("done");
  });

  it("keeps a 95% at 95 after corrections; the path still reaches 100", () => {
    const first = attempt("a1", 1, { lt1: [9.5, 10] });
    const corrected = pathFor(quiz({ attempts: [first], corrections: corr("approved") }));
    expect(corrected.targets[0].raisedTo).toBeNull();
    expect(corrected.final!.percent).toBe(95);
    const done = pathFor(
      quiz({
        attempts: [first],
        corrections: corr("approved"),
        relearning: [rel("lt1", "b1", true, true)],
        checks: [pathCheck(["lt1"], "b1")],
      })
    );
    expect(done.final!.percent).toBe(100);
  });

  it("has nothing to do at 100%", () => {
    const perfect = quiz({ attempts: [attempt("a1", 1, { lt1: [10, 10] })] });
    const s = pathFor(perfect);
    expect(s.targets[0]).toMatchObject({ role: "full", corrections: null, relearn: null });
    expect(s.blockers[0].kind).toBe("at_full");
    expect(card(perfect)).toBe("done");
  });
});

describe("a mixed quiz: LT1 at 40%, LT2 at 90% (decision 31)", () => {
  const first = attempt("a1", 1, { lt1: [4, 10], lt2: [9, 10] });

  it("requires LT1 and leaves LT2 optional until the student opts in", () => {
    const s = pathFor(quiz({ attempts: [first], corrections: { lt1: "approved", lt2: "needed" } }));
    expect(s.required).toEqual(["lt1"]);
    expect(s.targets[1]).toMatchObject({
      role: "optional",
      optedIn: false,
      corrections: null,
      onPath: false,
    });
  });

  it("raises an 85% LT2 to 90 with its corrections, without holding LT1's retake", () => {
    const input = quiz({
      attempts: [attempt("a1", 1, { lt1: [4, 10], lt2: [8.5, 10] })],
      optedIn: ["lt2"],
      corrections: { lt1: "approved", lt2: "approved" },
      relearning: [rel("lt1", "b1")],
      checks: [pathCheck(["lt1"], "b1")],
    });
    const s = pathFor(input);
    expect(s.targets[1]).toMatchObject({ raisedTo: 90, raisedBy: "corrections_to_90" });
    // LT1 80 (8 of 10) + LT2 90 (9 of 10) = 17 of 20.
    expect(s.final!.percent).toBe(85);
    expect(s.retakeReady).toBe(true);
    // LT2's corrections still open don't hold the retake either.
    expect(pathFor({ ...input, corrections: { lt1: "approved", lt2: "needed" } }).retakeReady).toBe(
      true
    );
  });

  it("keeps a 90% LT2 at 90 after corrections (nothing higher to raise it to)", () => {
    const s = pathFor(
      quiz({
        attempts: [first],
        optedIn: ["lt2"],
        corrections: { lt1: "approved", lt2: "approved" },
      })
    );
    expect(s.targets[1]).toMatchObject({ raisedTo: null, counting: 90 });
  });

  it("stitches LT2 into LT1's activity and check: the check splits 3 + 2; passing → 80 and 100", () => {
    const relearned = quiz({
      attempts: [first],
      optedIn: ["lt2"],
      corrections: { lt1: "approved", lt2: "approved" },
      relearning: [rel("lt1", "b"), rel("lt2", "b", true, true)],
    });
    const r = pathFor(relearned);
    expect(r.targets.map((t) => t.practice)).toEqual(["current", "current"]);
    expect(
      splitCheck(
        r.targets.filter((t) => t.onPath).map((t) => ({ id: t.id, percent: t.firstPercent }))
      )
    ).toEqual(
      new Map([
        ["lt1", 3],
        ["lt2", 2],
      ])
    );

    const passed = pathFor({ ...relearned, checks: [pathCheck(["lt1", "lt2"], "b")] });
    expect(passed.targets.map((t) => t.raisedTo)).toEqual([80, 100]);
    expect(passed.final!.percent).toBe(90);
    expect(passed.final!.perTarget.lt1.percent).toBe(80);
    expect(passed.final!.perTarget.lt2.percent).toBe(100);
  });

  it("waits for every target's relearning in a bundle before the check opens", () => {
    const s = pathFor(
      quiz({
        attempts: [first],
        optedIn: ["lt2"],
        corrections: { lt1: "approved", lt2: "approved" },
        relearning: [rel("lt1", "b"), rel("lt2", "b", false, true)],
      })
    );
    expect(s.targets.map((t) => t.practice)).toEqual(["locked", "locked"]);
  });
});

describe("retakes and attempt 3 (Q5, Q6)", () => {
  const first = attempt("a1", 1, { lt1: [4, 10], lt2: [10, 10] });
  const pathDone = {
    corrections: { lt1: "approved" as const },
    relearning: [rel("lt1", "b1")],
    checks: [pathCheck(["lt1"], "b1")],
  };

  it("keeps the highest per target", () => {
    const s = pathFor(
      quiz({ attempts: [first, attempt("a2", 2, { lt1: [9, 10], lt2: [8, 10] })], ...pathDone })
    );
    expect(s.targets.map((t) => [t.counting, t.countingFrom])).toEqual([
      [90, "a2"],
      [100, "a1"],
    ]);
    expect(s.final).toMatchObject({ percent: 95, basis: "retake" });
  });

  it("asks for a fresh check before attempt 3 on the targets still below the line", () => {
    const low = quiz({
      attempts: [first, attempt("a2", 2, { lt1: [7, 10], lt2: [10, 10] })],
      ...pathDone,
    });
    const s = pathFor(low);
    expect(s.targets[0].counting).toBe(80);
    expect(s.attemptCheck).toEqual({ attemptNumber: 3, targetIds: ["lt1"], passed: false });
    expect(s.blockers.map((b) => b.kind)).toEqual(["attempt_check"]);
    expect(pathBlockerText(s, 4)).toBe(
      "Pass a new practice check on LT1 before attempt 3: 4 of 5 right."
    );
    expect(card(low)).toBe("relearning");

    const checked = quiz({ ...low, checks: [...pathDone.checks, attemptCheck(["lt1"], 3)] });
    expect(pathFor(checked).retakeReady).toBe(true);
    expect(card(checked)).toBe("retake_available");
  });

  it("needs no check when nothing is below the line on the retake", () => {
    const s = pathFor(
      quiz({ attempts: [first, attempt("a2", 2, { lt1: [8, 10], lt2: [9, 10] })], ...pathDone })
    );
    expect(s.attemptCheck).toBeNull();
    expect(s.retakeReady).toBe(true);
  });
});

describe("teacher-approved corrections (Q7, decision 30)", () => {
  const first = attempt("a1", 1, { lt1: [4, 10] });

  it("opens relearning once corrections are turned in", () => {
    const s = pathFor(quiz({ attempts: [first], corrections: corr("submitted") }));
    expect(s.targets[0]).toMatchObject({ corrections: "waiting", relearn: "current" });
    expect(card(quiz({ attempts: [first], corrections: corr("submitted") }))).toBe("relearning");
  });

  it("holds the raise and the retake for the teacher's OK", () => {
    const waiting = quiz({
      attempts: [first],
      corrections: corr("submitted"),
      relearning: [rel("lt1", "b1")],
      checks: [pathCheck(["lt1"], "b1")],
    });
    const s = pathFor(waiting);
    expect(s.targets[0]).toMatchObject({ practice: "done", raisedTo: null });
    expect(s.final!.percent).toBe(40);
    expect(s.blockers.map((b) => b.kind)).toEqual(["approval"]);
    expect(pathBlockerText(s, 4)).toBe("Your corrections are waiting for your teacher's OK.");
    expect(card(waiting)).toBe("corrections_submitted");

    const approved = pathFor({ ...waiting, corrections: corr("approved") });
    expect(approved.final!.percent).toBe(80);
    expect(approved.retakeReady).toBe(true);
  });

  it("keeps the relearning and the check when corrections come back", () => {
    const returned = quiz({
      attempts: [first],
      corrections: corr("returned"),
      relearning: [rel("lt1", "b1")],
      checks: [pathCheck(["lt1"], "b1")],
    });
    const s = pathFor(returned);
    expect(s.targets[0]).toMatchObject({
      corrections: "current",
      relearn: "done",
      practice: "done",
    });
    expect(s.blockers[0].kind).toBe("corrections_returned");
    expect(card(returned)).toBe("corrections_returned");
  });
});

describe("a test with LT2 and LT4 below the line (S1–S6)", () => {
  const first = attempt("a1", 1, { lt1: [10, 10], lt2: [6, 10], lt3: [9, 10], lt4: [7, 10] });
  const plan = (locked: string[]): RetakePlan => ({
    required: ["lt2", "lt4"],
    optional: ["lt1", "lt3"],
    selected: ["lt2", "lt4"],
    locked,
    canStart: locked.length === 0,
    blocker: locked.length ? "gates" : null,
  });

  it("gives each required target its own line, and locks the retake until both pass", () => {
    const partway = test({
      attempts: [first],
      corrections: { lt2: "approved", lt4: "approved" },
      relearning: [rel("lt2", "b2"), rel("lt4", "b4", false)],
      checks: [pathCheck(["lt2"], "b2")],
    });
    const s = pathFor(partway);
    expect(s.required).toEqual(["lt2", "lt4"]);
    expect(s.targets.map((t) => [t.id, t.role, t.relearn, t.practice])).toEqual([
      ["lt1", "full", null, null],
      ["lt2", "required", "done", "done"],
      ["lt3", "optional", null, null],
      ["lt4", "required", "current", "locked"],
    ]);
    expect(s.retakeReady).toBe(false);
    expect(s.final).toBeNull();
    expect(s.targets.every((t) => t.raisedTo === null)).toBe(true);
    expect(pathGates(s).get("lt4")).toEqual({
      correctionsOk: true,
      activityOk: false,
      practiceOk: false,
    });
    expect(pathGates(s).get("lt2")).toEqual({
      correctionsOk: true,
      activityOk: true,
      practiceOk: true,
    });
    expect(card(partway, { allowed: 2, plan: plan(["lt4"]) })).toBe("relearning");

    const both = test({
      ...partway,
      relearning: [rel("lt2", "b2"), rel("lt4", "b4")],
      checks: [pathCheck(["lt2"], "b2"), pathCheck(["lt4"], "b4")],
    });
    expect(pathFor(both).retakeReady).toBe(true);
    expect(card(both, { allowed: 2, plan: plan([]) })).toBe("retake_required");
  });

  it("needs only corrections on an 80%+ target the student adds (decision 29)", () => {
    const added = test({
      attempts: [first],
      optedIn: ["lt3"],
      corrections: { lt2: "approved", lt4: "approved", lt3: "needed" },
      relearning: [rel("lt2", "b2"), rel("lt4", "b4")],
      checks: [pathCheck(["lt2"], "b2"), pathCheck(["lt4"], "b4")],
    });
    const s = pathFor(added);
    expect(s.targets[2]).toMatchObject({ optedIn: true, corrections: "current", relearn: null });
    expect(s.blockers.map((b) => b.kind)).toEqual(["corrections"]);
    expect(pathGates(s).get("lt3")).toEqual({
      correctionsOk: false,
      activityOk: true,
      practiceOk: true,
    });
    expect(card(added, { allowed: 2 })).toBe("corrections_needed");

    const corrected = pathFor({
      ...added,
      corrections: { lt2: "approved", lt4: "approved", lt3: "approved" },
    });
    expect(corrected.retakeReady).toBe(true);
    expect(pathGates(corrected).get("lt3")).toEqual({
      correctionsOk: true,
      activityOk: true,
      practiceOk: true,
    });
  });

  it("asks for corrections on every missed question for a full test (every target added)", () => {
    const full = pathFor(
      test({
        attempts: [first],
        optedIn: ["lt1", "lt3"],
        corrections: { lt2: "approved", lt4: "approved", lt3: "needed" },
        relearning: [rel("lt2", "b2"), rel("lt4", "b4")],
        checks: [pathCheck(["lt2"], "b2"), pathCheck(["lt4"], "b4")],
      })
    );
    // LT1 had nothing to correct; LT3's missed question is owed.
    expect(full.blockers).toEqual([{ kind: "corrections", targetIds: ["lt3"] }]);
  });

  it("asks a target still below the line after the retake for a fresh check (Q6, also on tests)", () => {
    const s = pathFor(
      test({
        attempts: [first, attempt("a2", 2, { lt2: [9, 10], lt4: [6, 10] })],
        corrections: { lt2: "approved", lt4: "approved" },
        relearning: [rel("lt2", "b2"), rel("lt4", "b4")],
        checks: [pathCheck(["lt2"], "b2"), pathCheck(["lt4"], "b4")],
      })
    );
    expect(s.attemptCheck).toEqual({ attemptNumber: 3, targetIds: ["lt4"], passed: false });
    expect(pathGates(s).get("lt4")!.practiceOk).toBe(false);
    expect(pathGates(s).get("lt2")!.practiceOk).toBe(true);
  });
});

describe("the corrections cap switched off on a quiz", () => {
  it("raises nothing, and corrections in scope come before the retake", () => {
    const first = attempt("a1", 1, { lt1: [8.5, 10] });
    const owed = quiz({ raises: false, attempts: [first], corrections: corr("needed") });
    const s = pathFor(owed);
    expect(pathRule(s)).toBe("gate");
    expect(s.blockers.map((b) => b.kind)).toEqual(["corrections"]);
    expect(card(owed)).toBe("corrections_needed");
    const corrected = quiz({ raises: false, attempts: [first], corrections: corr("approved") });
    expect(pathFor(corrected).final!.percent).toBe(85);
    expect(card(corrected)).toBe("retake_available");
  });
});

describe("pathRequestBlocker (Needs you: what still stops an approved retake)", () => {
  const first = attempt("a1", 1, { lt1: [4, 10], lt2: [6, 10] });
  it("names the targets whose relearning or check is open, and the teacher's own OK", () => {
    expect(
      pathRequestBlocker(pathFor(quiz({ attempts: [first], corrections: { lt1: "needed" } })))
    ).toEqual({ reason: "corrections" });
    expect(
      pathRequestBlocker(
        pathFor(quiz({ attempts: [first], corrections: { lt1: "approved", lt2: "approved" } }))
      )
    ).toEqual({ reason: "relearning", codes: ["LT1", "LT2"] });
    const waiting = quiz({
      attempts: [first],
      corrections: { lt1: "submitted", lt2: "submitted" },
      relearning: [rel("lt1", "b"), rel("lt2", "b")],
      checks: [pathCheck(["lt1", "lt2"], "b")],
    });
    expect(pathRequestBlocker(pathFor(waiting))).toEqual({ reason: "approval" });
    expect(
      pathRequestBlocker(pathFor({ ...waiting, corrections: { lt1: "approved", lt2: "approved" } }))
    ).toBeNull();
  });
  it("says there's no retake on a quiz with nothing below the line", () => {
    expect(
      pathRequestBlocker(pathFor(quiz({ attempts: [attempt("a1", 1, { lt1: [9, 10] })] })))
    ).toEqual({ reason: "path_no_retake" });
  });
});
