import { describe, expect, it } from "vitest";
import { cycleState, gateOpen, planRetake } from "./retakes";

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
});
