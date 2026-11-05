import { describe, expect, it } from "vitest";
import {
  mostMissedTarget,
  movedUp,
  pathStageLabel,
  readinessLine,
  readinessSortKey,
  readinessState,
  relearningStage,
  stageLabel,
  startOfWeek,
  versionStamp,
} from "./tiers";

const plan = (over: Partial<Parameters<typeof relearningStage>[0]["plan"] & object> = {}) => ({
  selected: ["lt4"],
  locked: [] as string[],
  canStart: true,
  blocker: null,
  ...over,
});

describe("relearningStage", () => {
  it("walks the PLAN.md §3.11 stages", () => {
    const base = { tier: 2 as const, attemptsFinished: 1, inProgress: false };
    expect(relearningStage({ ...base, attemptsFinished: 0, corrections: null, plan: null })).toBe(
      "not_started"
    );
    expect(
      relearningStage({
        ...base,
        attemptsFinished: 0,
        inProgress: true,
        corrections: null,
        plan: null,
      })
    ).toBe("attempt_1_in_progress");
    expect(relearningStage({ ...base, tier: 1, corrections: null, plan: null })).toBe("proficient");
    expect(
      relearningStage({ ...base, tier: 1, attemptsFinished: 2, corrections: null, plan: null })
    ).toBe("retake_done");
    const c = (state: "needed" | "submitted" | "returned" | "approved", done = 0) => ({
      state,
      done,
      needed: 3,
    });
    expect(relearningStage({ ...base, corrections: c("needed"), plan: plan() })).toBe(
      "corrections_not_started"
    );
    expect(relearningStage({ ...base, corrections: c("needed", 2), plan: plan() })).toBe(
      "corrections_in_progress"
    );
    expect(relearningStage({ ...base, corrections: c("submitted", 3), plan: plan() })).toBe(
      "corrections_submitted"
    );
    expect(relearningStage({ ...base, corrections: c("returned", 3), plan: plan() })).toBe(
      "corrections_returned"
    );
    expect(
      relearningStage({
        ...base,
        corrections: c("approved", 3),
        plan: plan({ locked: ["lt4"], canStart: false, blocker: "gates" }),
      })
    ).toBe("relearning");
    expect(relearningStage({ ...base, corrections: c("approved", 3), plan: plan() })).toBe(
      "retake_ready"
    );
    expect(
      relearningStage({ ...base, inProgress: true, corrections: c("approved", 3), plan: plan() })
    ).toBe("retake_in_progress");
    expect(
      relearningStage({
        ...base,
        attemptsFinished: 2,
        corrections: c("approved", 3),
        plan: plan({ canStart: false, blocker: "no_attempts" }),
      })
    ).toBe("no_attempts_left");
    expect(stageLabel("corrections_in_progress", { done: 2, needed: 3 }, "auto")).toBe(
      "Corrections in progress (2 of 3)"
    );
    expect(stageLabel("corrections_submitted", null, "teacher_approved")).toMatch(
      /awaiting approval/
    );
  });
});

describe("movedUp and week start", () => {
  it("counts only improvements on or after the cutoff", () => {
    const since = new Date("2026-09-28T00:00:00");
    expect(
      movedUp({ tier: 1, previousTier: 2, tierChangedAt: new Date("2026-09-29T10:00:00") }, since)
    ).toBe(true);
    expect(
      movedUp({ tier: 2, previousTier: 1, tierChangedAt: new Date("2026-09-29T10:00:00") }, since)
    ).toBe(false);
    expect(
      movedUp({ tier: 1, previousTier: 2, tierChangedAt: new Date("2026-09-20T10:00:00") }, since)
    ).toBe(false);
    expect(movedUp({ tier: 1, previousTier: null, tierChangedAt: null }, since)).toBe(false);
    expect(startOfWeek(new Date("2026-09-30T15:00:00")).toDateString()).toBe(
      new Date("2026-09-28T00:00:00").toDateString()
    ); // Wednesday → Monday
    expect(startOfWeek(new Date("2026-10-04T15:00:00")).toDateString()).toBe(
      new Date("2026-09-28T00:00:00").toDateString()
    ); // Sunday → Monday
  });
});

describe("readiness", () => {
  const gate = (ok: boolean) => ({
    correctionsOk: ok,
    activityOk: ok,
    practiceOk: ok,
    unlocked: ok,
  });
  it("states and the readiness line", () => {
    const ready = {
      id: "a",
      code: "LT4",
      percent: 70,
      required: true,
      optedIn: false,
      gate: gate(true),
      retaken: false,
      activityDetail: "watched blood-flow video",
      practiceDetail: "best 85%",
    };
    expect(readinessState(ready)).toBe("ready");
    expect(readinessLine(ready)).toBe(
      "LT4: corrections ✓ · activity ✓ (watched blood-flow video) · practice ✓ (best 85%) · retake unlocked"
    );
    const stuck = {
      ...ready,
      gate: { correctionsOk: false, activityOk: false, practiceOk: false, unlocked: false },
      correctionsDetail: "returned",
      activityDetail: null,
      practiceDetail: "0 of 1",
    };
    expect(readinessState(stuck)).toBe("not_ready");
    expect(readinessLine(stuck)).toBe(
      "LT4: corrections ✗ (returned) · activity ✗ · practice ✗ (0 of 1) · retake locked"
    );
    expect(readinessState({ ...ready, required: false, percent: 100 })).toBe("proficient");
    expect(readinessLine({ ...ready, required: false, percent: 100 })).toBe(
      "LT4: proficient (100%)"
    );
    expect(readinessState({ ...ready, required: false, retaken: true, percent: 90 })).toBe(
      "retaken"
    );
    expect(readinessSortKey(["not_ready", "ready"], "relearning")).toBeLessThan(
      readinessSortKey(["ready"], "retake_ready")
    );
    expect(readinessSortKey(["proficient"], "proficient")).toBeGreaterThan(
      readinessSortKey(["ready"], "retake_ready")
    );
  });
});

describe("mostMissedTarget and versionStamp", () => {
  it("picks the target the most students miss, ties to the lowest average", () => {
    const finals = [
      { lt1: { percent: 100 }, lt2: { percent: 70 }, lt3: { percent: 50 } },
      { lt1: { percent: 90 }, lt2: { percent: 60 }, lt3: { percent: 85 } },
    ];
    expect(mostMissedTarget(finals, 80)).toEqual({ id: "lt2", below: 2, average: 65 });
    expect(mostMissedTarget([{ lt1: { percent: 100 } }], 80)).toBeNull();
    expect(versionStamp([new Date(5), "1970-01-01T00:00:00.010Z", null])).toBe("10");
  });
});

describe("readiness on the relearning path (revamp R5 wording)", () => {
  const base = {
    id: "a",
    code: "U3.LT4",
    percent: 60,
    required: true,
    optedIn: false,
    gate: { correctionsOk: true, activityOk: true, practiceOk: false, unlocked: false },
    retaken: false,
    correctionsDetail: "4 of 4 approved",
    // The old activity and practice details don't show on the path.
    activityDetail: "0 of 2",
    practiceDetail: "0 of 1",
  };
  it("names the path's steps, not the old gates", () => {
    const t = {
      ...base,
      path: { corrections: "done", relearn: "done", practice: "current" } as const,
    };
    expect(readinessState(t)).toBe("not_ready");
    expect(readinessLine(t)).toBe(
      "U3.LT4: corrections ✓ (4 of 4 approved) · relearn ✓ · practice check ✗ · retake locked"
    );
    const ready = {
      ...t,
      gate: { ...t.gate, practiceOk: true, unlocked: true },
      path: { ...t.path, practice: "done" } as const,
    };
    expect(readinessState(ready)).toBe("ready");
    expect(readinessLine(ready)).toBe(
      "U3.LT4: corrections ✓ (4 of 4 approved) · relearn ✓ · practice check ✓ · retake unlocked"
    );
  });

  it("corrections waiting on the teacher, and a test target added at 80% (corrections only)", () => {
    const waiting = {
      ...base,
      correctionsDetail: null,
      path: { corrections: "waiting", relearn: "current", practice: "locked" } as const,
    };
    expect(readinessLine(waiting)).toBe(
      "U3.LT4: corrections waiting for your OK · relearn ✗ · practice check ✗ · retake locked"
    );
    const added = {
      ...base,
      code: "U3.LT3",
      required: false,
      optedIn: true,
      correctionsDetail: "1 of 1 approved",
      path: { corrections: "done", relearn: null, practice: null } as const,
      gate: { correctionsOk: true, activityOk: true, practiceOk: true, unlocked: true },
    };
    expect(readinessState(added)).toBe("ready");
    expect(readinessLine(added)).toBe("U3.LT3: corrections ✓ (1 of 1 approved) · retake unlocked");
  });

  it("the stage label names each target's step", () => {
    const needs = [
      { code: "U3.LT2", step: "relearn" },
      { code: "U3.LT4", step: "practice check" },
    ];
    expect(pathStageLabel("relearning", needs, null, "auto")).toBe(
      "Relearning (U3.LT2: relearn, U3.LT4: practice check)"
    );
    expect(pathStageLabel("relearning", [], null, "auto")).toBe("Relearning");
    expect(pathStageLabel("retake_ready", needs, null, "auto")).toBe("Retake ready");
  });
});
