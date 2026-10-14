import { describe, expect, it } from "vitest";
import { deriveCardState, type CardInput } from "./card-state";
import type { PracticeResult } from "./quiz-practice";
import type { RetakePlan } from "./retakes";

const now = new Date("2026-10-13T15:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(now.getTime() - days * DAY);

const base: CardInput = {
  type: "formative",
  opensAt: ago(3),
  closesAt: null,
  attemptsAllowed: 3,
  retakeThreshold: 80,
  retakesNeedUnlock: false,
  correctionsCap: true,
  retakeWindowDays: 7,
  cvtcRules: false,
  attemptsUsed: 1,
  inProgress: false,
  awaitingGrade: false,
  unlockedThrough: 0,
  firstPercent: 40,
  firstSubmittedAt: ago(1),
  bestPercent: 40,
  finalPercent: 40,
  corrections: "needed",
  plan: null,
  quizPractice: null,
};
const plan = (p: Partial<RetakePlan>): RetakePlan => ({
  required: [],
  optional: [],
  selected: [],
  locked: [],
  canStart: true,
  blocker: null,
  ...p,
});

describe("deriveCardState (who owes what)", () => {
  it("reads the student's card before, during, and after attempt 1", () => {
    expect(deriveCardState({ ...base, opensAt: new Date(now.getTime() + DAY) }, now).state).toBe(
      "upcoming"
    );
    const fresh = { ...base, attemptsUsed: 0, firstPercent: null, firstSubmittedAt: null };
    expect(deriveCardState({ ...fresh, corrections: "none" }, now)).toMatchObject({
      state: "not_started",
      cycle: null,
      retakeBy: null,
    });
    expect(deriveCardState({ ...base, inProgress: true }, now)).toMatchObject({
      state: "in_progress",
      cycle: null,
    });
    expect(deriveCardState(base, now)).toMatchObject({
      state: "corrections_needed",
      cycle: "corrections_needed",
      capped: true,
      rule: "gate",
      retakeBy: new Date(ago(1).getTime() + 7 * DAY),
      windowClosed: false,
    });
  });

  it("keeps the corrections states on a closed test; anything else there reads closed (R1, Oct 14 2026)", () => {
    // This used to read "closed" on the student's card while the teacher saw corrections owed.
    const closed = { ...base, closesAt: ago(0.5) };
    expect(deriveCardState(closed, now)).toMatchObject({
      status: "closed",
      state: "corrections_needed",
      cycle: "corrections_needed",
    });
    for (const corrections of ["returned", "submitted"] as const)
      expect(deriveCardState({ ...closed, corrections }, now).state).toBe(
        `corrections_${corrections}`
      );
    const high = { ...closed, firstPercent: 85, bestPercent: 85, finalPercent: 85 };
    expect(deriveCardState(high, now).state).toBe("corrections_to_full");
    // Corrections done: the retake can't start on a closed test, so the card reads closed.
    expect(
      deriveCardState({ ...closed, corrections: "approved", finalPercent: 80 }, now)
    ).toMatchObject({ state: "closed", cycle: "retake_available" });
    // A paused test is finished in class even after the close (Finish later).
    expect(deriveCardState({ ...closed, inProgress: true }, now).state).toBe("in_progress");
    const summative = {
      ...closed,
      type: "summative" as const,
      corrections: "none" as const,
      plan: plan({ required: ["lt3"], selected: ["lt3"] }),
    };
    expect(deriveCardState(summative, now)).toMatchObject({
      state: "closed",
      cycle: "retake_required",
    });
  });

  it("follows the corrections rule: cap to 100%, teacher unlocks, CVTC rules", () => {
    const high = { ...base, firstPercent: 85, bestPercent: 85, finalPercent: 85 };
    expect(deriveCardState(high, now)).toMatchObject({
      rule: "to_full",
      state: "corrections_to_full",
    });
    expect(
      deriveCardState({ ...high, corrections: "approved", finalPercent: 100 }, now).state
    ).toBe("done");
    // No retake is offered at or above the line, so there is no retake window to show either.
    expect(deriveCardState(high, now)).toMatchObject({ retakeBy: null, windowClosed: false });
    expect(deriveCardState({ ...high, firstSubmittedAt: ago(30) }, now)).toMatchObject({
      state: "corrections_to_full",
      retakeBy: null,
      windowClosed: false,
    });
    // "Retakes need my OK" changes nothing there (decision 2): no "Request retake", no "optional".
    expect(deriveCardState({ ...high, retakesNeedUnlock: true }, now)).toMatchObject({
      rule: "to_full",
      state: "corrections_to_full",
      retakeBy: null,
    });
    expect(
      deriveCardState(
        { ...high, retakesNeedUnlock: true, corrections: "approved", finalPercent: 100 },
        now
      ).state
    ).toBe("done");
    // "Retakes need my OK" (Oct 14 2026, decision 4): corrections first, exactly as without it,
    // then the wait for the teacher. This used to read rule "optional", state awaiting_unlock.
    expect(deriveCardState({ ...base, retakesNeedUnlock: true }, now)).toMatchObject({
      rule: "gate",
      state: "corrections_needed",
    });
    const corrected = { ...base, retakesNeedUnlock: true, corrections: "approved" as const };
    expect(deriveCardState(corrected, now).state).toBe("awaiting_unlock");
    expect(deriveCardState({ ...corrected, unlockedThrough: 2 }, now).state).toBe(
      "retake_available"
    );
    // CVTC rules: no cap, no window, nothing owed; the retake is the way up.
    expect(deriveCardState({ ...base, cvtcRules: true, corrections: "none" }, now)).toMatchObject({
      capped: false,
      rule: "none",
      retakeBy: null,
      state: "retake_available",
    });
  });

  it("closes the cap's retake window a week after attempt 1", () => {
    const late = { ...base, firstSubmittedAt: ago(8), corrections: "approved" as const };
    expect(deriveCardState({ ...late, finalPercent: 80 }, now)).toMatchObject({
      windowClosed: true,
      state: "done",
    });
  });

  it("waits for the teacher's grade before anything else, open or closed (Jon, Oct 14 2026)", () => {
    // An essay still to grade: no partial score, no corrections or retake yet.
    const waiting = {
      ...base,
      awaitingGrade: true,
      bestPercent: 0,
      firstPercent: 0,
      finalPercent: 0,
    };
    expect(deriveCardState(waiting, now).state).toBe("awaiting_grade");
    expect(deriveCardState({ ...waiting, closesAt: ago(1) }, now).state).toBe("awaiting_grade");
    // An open attempt or a test that hasn't opened still reads as before.
    expect(deriveCardState({ ...waiting, inProgress: true }, now).state).toBe("in_progress");
    expect(deriveCardState({ ...waiting, opensAt: new Date(now.getTime() + DAY) }, now).state).toBe(
      "upcoming"
    );
    // Once graded, the learning cycle takes over again.
    expect(deriveCardState({ ...waiting, awaitingGrade: false }, now).state).toBe(
      "corrections_needed"
    );
  });

  it("sends a quiz to relearning while a missed target still needs practice (R3, Oct 14 2026)", () => {
    const after = new Date(ago(1).getTime() + 3_600_000);
    const lt1 = { id: "lt1", code: "U2.LT1", title: "Sugars", sortOrder: 1 };
    const quizPractice = {
      latest: { submittedAt: ago(1), targetPercents: { lt1: 40, lt2: 90 } },
      targets: [
        { ...lt1, hasSet: false, openQuestions: 8 },
        { id: "lt2", code: "U2.LT2", title: "Fats", sortOrder: 2, hasSet: false, openQuestions: 8 },
      ],
      practice: [] as PracticeResult[],
    };
    const corrected = {
      ...base,
      corrections: "approved" as const,
      finalPercent: 80,
      quizPractice,
    };
    // Corrections still come first; the practice list is there already.
    expect(deriveCardState({ ...corrected, corrections: "needed" }, now)).toMatchObject({
      state: "corrections_needed",
      quizPractice: [{ targetId: "lt1", code: "U2.LT1", scored: 40, best: null, done: false }],
    });
    expect(deriveCardState(corrected, now)).toMatchObject({
      state: "relearning",
      cycle: "relearning",
    });
    // Closed: the card reads closed, the cycle still says what's next.
    expect(deriveCardState({ ...corrected, closesAt: ago(0.5) }, now)).toMatchObject({
      state: "closed",
      cycle: "relearning",
    });
    const built: PracticeResult = {
      completedAt: after,
      practiceSetId: null,
      setTargetIds: [],
      byTarget: { lt1: { questions: 5, earned: 4, possible: 5 } },
      percent: 80,
      creditedTargetIds: null,
    };
    expect(
      deriveCardState({ ...corrected, quizPractice: { ...quizPractice, practice: [built] } }, now)
    ).toMatchObject({
      state: "retake_available",
      quizPractice: [{ targetId: "lt1", best: 80, done: true }],
    });
    // Not where corrections are the way to 100% (no retake), and never on a summative.
    const high = { ...corrected, firstPercent: 85, bestPercent: 85, finalPercent: 100 };
    expect(deriveCardState(high, now)).toMatchObject({ state: "done", quizPractice: [] });
    expect(
      deriveCardState({ ...corrected, type: "summative", correctionsCap: false }, now).quizPractice
    ).toEqual([]);
  });
});
