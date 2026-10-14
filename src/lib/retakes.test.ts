import { describe, expect, it } from "vitest";
import { correctionsRule, cycleState, gateOpen, planRetake } from "./retakes";

const open = { correctionsOk: true, activityOk: true, practiceOk: true };
const closed = { correctionsOk: false, activityOk: true, practiceOk: true };

const targets = [
  { id: "lt1", percent: 100, optedIn: false, gate: open },
  { id: "lt2", percent: 80, optedIn: true, gate: open },
  { id: "lt3", percent: 90, optedIn: false, gate: open },
  { id: "lt4", percent: 70, optedIn: false, gate: closed },
];

describe("planRetake", () => {
  it("below threshold is required, at/above is optional; opted-in optional targets join the scope", () => {
    const plan = planRetake({
      targets,
      threshold: 80,
      optionalRetakes: true,
      attemptsUsed: 1,
      attemptsAllowed: 2,
    });
    expect(plan.required).toEqual(["lt4"]);
    expect(plan.optional).toEqual(["lt1", "lt2", "lt3"]);
    expect(plan.selected).toEqual(["lt4", "lt2"]);
    expect(plan.locked).toEqual(["lt4"]);
    expect(plan).toMatchObject({ canStart: false, blocker: "gates" });
  });

  it("starts once every selected gate is open; optional retakes off ignores opt-ins", () => {
    const ready = targets.map((t) => ({ ...t, gate: open }));
    expect(
      planRetake({
        targets: ready,
        threshold: 80,
        optionalRetakes: true,
        attemptsUsed: 1,
        attemptsAllowed: 2,
      })
    ).toMatchObject({ selected: ["lt4", "lt2"], canStart: true, blocker: null });
    expect(
      planRetake({
        targets: ready,
        threshold: 80,
        optionalRetakes: false,
        attemptsUsed: 1,
        attemptsAllowed: 2,
      })
    ).toMatchObject({ optional: [], selected: ["lt4"], canStart: true });
  });

  it("nothing selected and no attempts left are blockers", () => {
    const proficient = targets.map((t) => ({ ...t, percent: 95, optedIn: false, gate: open }));
    expect(
      planRetake({
        targets: proficient,
        threshold: 80,
        optionalRetakes: true,
        attemptsUsed: 1,
        attemptsAllowed: 2,
      })
    ).toMatchObject({ required: [], selected: [], canStart: false, blocker: "nothing_selected" });
    expect(
      planRetake({
        targets,
        threshold: 80,
        optionalRetakes: true,
        attemptsUsed: 2,
        attemptsAllowed: 2,
      })
    ).toMatchObject({ canStart: false, blocker: "no_attempts" });
    expect(gateOpen(closed)).toBe(false);
  });
});

describe("cycleState", () => {
  const base = { attemptsUsed: 1, attemptsAllowed: 2, bestPercent: 92.5 };
  const plan = (over: Partial<ReturnType<typeof planRetake>>) => ({
    required: ["lt4"],
    optional: ["lt1", "lt2", "lt3"],
    selected: ["lt4"],
    locked: [],
    canStart: true,
    blocker: null,
    ...over,
  });
  it("corrections first, then relearning, then retake required / available, then done", () => {
    expect(cycleState({ ...base, type: "summative", corrections: "needed", plan: plan({}) })).toBe(
      "corrections_needed"
    );
    expect(
      cycleState({ ...base, type: "summative", corrections: "submitted", plan: plan({}) })
    ).toBe("corrections_submitted");
    expect(
      cycleState({
        ...base,
        type: "summative",
        corrections: "approved",
        plan: plan({ locked: ["lt4"], canStart: false, blocker: "gates" }),
      })
    ).toBe("relearning");
    expect(
      cycleState({ ...base, type: "summative", corrections: "approved", plan: plan({}) })
    ).toBe("retake_required");
    expect(
      cycleState({
        ...base,
        type: "summative",
        corrections: "none",
        plan: plan({ required: [], selected: [], canStart: false, blocker: "nothing_selected" }),
      })
    ).toBe("retake_available");
    expect(
      cycleState({
        ...base,
        type: "summative",
        corrections: "none",
        plan: plan({ required: [], optional: [], selected: [] }),
      })
    ).toBe("done");
    expect(
      cycleState({
        ...base,
        type: "summative",
        corrections: "approved",
        attemptsUsed: 2,
        plan: plan({}),
      })
    ).toBe("done");
  });
  it("corrections cap: optional corrections at/above the threshold; done once the window closes", () => {
    const f = {
      type: "formative" as const,
      plan: null,
      attemptsAllowed: 3,
      correctionsCap: true,
      threshold: 80,
    };
    expect(
      cycleState({ ...base, ...f, corrections: "needed", firstPercent: 50, bestPercent: 50 })
    ).toBe("corrections_needed");
    expect(
      cycleState({ ...base, ...f, corrections: "needed", firstPercent: 85, bestPercent: 85 })
    ).toBe("corrections_to_full");
    expect(
      cycleState({ ...base, ...f, corrections: "approved", firstPercent: 85, bestPercent: 100 })
    ).toBe("done");
    expect(
      cycleState({ ...base, ...f, corrections: "approved", firstPercent: 50, bestPercent: 80 })
    ).toBe("retake_available");
    expect(
      cycleState({
        ...base,
        ...f,
        corrections: "approved",
        firstPercent: 50,
        bestPercent: 80,
        windowClosed: true,
      })
    ).toBe("done");
    // Without the cap the window means nothing and corrections are never optional.
    expect(
      cycleState({
        ...base,
        ...f,
        correctionsCap: false,
        corrections: "needed",
        firstPercent: 85,
        bestPercent: 85,
      })
    ).toBe("corrections_needed");
  });
  it("formatives: retake available while attempts remain and the score isn't perfect", () => {
    expect(
      cycleState({
        ...base,
        type: "formative",
        corrections: "approved",
        attemptsAllowed: 3,
        plan: null,
      })
    ).toBe("retake_available");
    expect(
      cycleState({
        ...base,
        type: "formative",
        corrections: "none",
        bestPercent: 100,
        attemptsAllowed: 3,
        plan: null,
      })
    ).toBe("done");
    expect(
      cycleState({
        ...base,
        type: "formative",
        corrections: "none",
        attemptsUsed: 3,
        attemptsAllowed: 3,
        plan: null,
      })
    ).toBe("done");
    expect(
      cycleState({
        ...base,
        type: "practice",
        corrections: "none",
        attemptsAllowed: null,
        plan: null,
      })
    ).toBe("done");
  });
  it("waits on the teacher when the retake is ready but not unlocked", () => {
    const formative = { ...base, type: "formative" as const, attemptsAllowed: 3, plan: null };
    expect(cycleState({ ...formative, corrections: "none", needsUnlock: true })).toBe(
      "awaiting_unlock"
    );
    expect(cycleState({ ...formative, corrections: "none", needsUnlock: false })).toBe(
      "retake_available"
    );
    // Done (perfect score, no attempts left) and corrections states are not overridden.
    expect(
      cycleState({ ...formative, corrections: "none", bestPercent: 100, needsUnlock: true })
    ).toBe("done");
    expect(cycleState({ ...formative, corrections: "needed", needsUnlock: true })).toBe(
      "corrections_needed"
    );
    expect(
      cycleState({
        ...base,
        type: "summative",
        corrections: "approved",
        plan: plan({}),
        needsUnlock: true,
      })
    ).toBe("awaiting_unlock");
    expect(
      cycleState({
        ...base,
        type: "summative",
        corrections: "approved",
        plan: plan({ locked: ["lt4"], canStart: false, blocker: "gates" }),
        needsUnlock: true,
      })
    ).toBe("relearning");
  });
});

describe("correctionsRule (Jon, Oct 13 2026)", () => {
  const f = {
    type: "formative" as const,
    capped: true,
    retakesNeedUnlock: false,
    cvtcRules: false,
    threshold: 80,
  };
  it("non-CVTC capped formative: at/above the threshold → corrections to 100; below → corrections gate the retake", () => {
    expect(correctionsRule({ ...f, firstPercent: 85 })).toBe("to_full");
    expect(correctionsRule({ ...f, firstPercent: 80 })).toBe("to_full");
    expect(correctionsRule({ ...f, firstPercent: 79.5 })).toBe("gate");
    expect(correctionsRule({ ...f, firstPercent: null })).toBe("gate");
    expect(correctionsRule({ ...f, capped: false, firstPercent: 85 })).toBe("gate");
    expect(correctionsRule({ ...f, type: "summative", capped: false, firstPercent: 85 })).toBe(
      "gate"
    );
  });
  it("teacher unlocks keep corrections optional (Oct 1); CVTC rules mean none, for every type", () => {
    // Decision 2 makes no exception for unlocks: at or above the line under the cap it is still
    // corrections → 100%, never "optional" (this used to read "optional").
    expect(correctionsRule({ ...f, retakesNeedUnlock: true, firstPercent: 85 })).toBe("to_full");
    expect(correctionsRule({ ...f, retakesNeedUnlock: true, firstPercent: 50 })).toBe("optional");
    expect(
      correctionsRule({ ...f, capped: false, retakesNeedUnlock: true, firstPercent: 85 })
    ).toBe("optional");
    for (const type of ["formative", "summative"] as const)
      for (const retakesNeedUnlock of [false, true])
        expect(
          correctionsRule({
            ...f,
            type,
            capped: false,
            cvtcRules: true,
            retakesNeedUnlock,
            firstPercent: 50,
          })
        ).toBe("none");
    expect(correctionsRule({ ...f, type: "practice", capped: false, firstPercent: 50 })).toBe(
      "none"
    );
  });
});

describe("cycleState with the corrections rule", () => {
  const f = {
    type: "formative" as const,
    attemptsUsed: 1,
    attemptsAllowed: 3,
    plan: null,
    threshold: 80,
  };
  it("to_full: the card directs to corrections and never offers a retake", () => {
    const noRule = { ...f, correctionsCap: true, firstPercent: 85 };
    const capped = { ...noRule, rule: "to_full" as const };
    expect(cycleState({ ...capped, corrections: "needed", bestPercent: 85 })).toBe(
      "corrections_to_full"
    );
    expect(cycleState({ ...capped, corrections: "returned", bestPercent: 85 })).toBe(
      "corrections_returned"
    );
    expect(cycleState({ ...capped, corrections: "submitted", bestPercent: 85 })).toBe(
      "corrections_submitted"
    );
    expect(cycleState({ ...capped, corrections: "approved", bestPercent: 100 })).toBe("done");
    // Nothing to correct yet (an answer still waits for a grade): still no retake.
    expect(cycleState({ ...capped, corrections: "none", bestPercent: 85 })).toBe("done");
    // Worked out from the cap inputs when no rule is passed.
    expect(cycleState({ ...noRule, corrections: "none", bestPercent: 85 })).toBe("done");
  });
  it("gate (below the threshold): corrections first, then the retake", () => {
    const capped = { ...f, correctionsCap: true, firstPercent: 50, rule: "gate" as const };
    expect(cycleState({ ...capped, corrections: "needed", bestPercent: 50 })).toBe(
      "corrections_needed"
    );
    expect(cycleState({ ...capped, corrections: "approved", bestPercent: 80 })).toBe(
      "retake_available"
    );
  });
  it("CVTC (none): corrections never hold the card; the retake is the way up, behind the teacher's OK when on", () => {
    const cvtc = { ...f, correctionsCap: false, firstPercent: 50, rule: "none" as const };
    expect(cycleState({ ...cvtc, corrections: "needed", bestPercent: 50 })).toBe(
      "retake_available"
    );
    expect(cycleState({ ...cvtc, corrections: "submitted", bestPercent: 50 })).toBe(
      "retake_available"
    );
    expect(cycleState({ ...cvtc, corrections: "needed", bestPercent: 50, needsUnlock: true })).toBe(
      "awaiting_unlock"
    );
    // No cap, so no retake window either.
    expect(cycleState({ ...cvtc, corrections: "none", bestPercent: 50, windowClosed: true })).toBe(
      "retake_available"
    );
    expect(cycleState({ ...cvtc, corrections: "none", bestPercent: 100 })).toBe("done");
    expect(
      cycleState({
        ...cvtc,
        type: "summative",
        corrections: "needed",
        bestPercent: 50,
        plan: {
          required: ["lt4"],
          optional: [],
          selected: ["lt4"],
          locked: [],
          canStart: true,
          blocker: null,
        },
      })
    ).toBe("retake_required");
  });
  it("optional (teacher unlocks): unchanged, the unlock is the only gate", () => {
    const unlock = { ...f, correctionsCap: true, firstPercent: 50, rule: "optional" as const };
    expect(
      cycleState({ ...unlock, corrections: "needed", bestPercent: 50, needsUnlock: true })
    ).toBe("awaiting_unlock");
  });
});
