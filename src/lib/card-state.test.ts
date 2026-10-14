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
  requestedNext: false,
  openUntil: null,
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

  it("keeps the corrections states on a closed test; a ready retake there is Ask to retake (R1, R6, Oct 14 2026)", () => {
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
    // Corrections done: the retake can't start on a closed test, but the student may ask for
    // one (R6); an optional retake (the quiz is at 80% after corrections) isn't a counted to-do.
    expect(
      deriveCardState({ ...closed, corrections: "approved", finalPercent: 80 }, now)
    ).toMatchObject({ state: "ask_to_retake", cycle: "retake_available", askCounts: false });
    // No tries left: nothing to ask for, so it reads closed.
    expect(
      deriveCardState(
        { ...closed, corrections: "approved", finalPercent: 80, attemptsAllowed: 1 },
        now
      )
    ).toMatchObject({ state: "closed", cycle: "done", askCounts: false });
    // A paused test is finished in class even after the close (Finish later).
    expect(deriveCardState({ ...closed, inProgress: true }, now).state).toBe("in_progress");
    // A summative with targets below the line: asking is a counted to-do.
    const summative = {
      ...closed,
      type: "summative" as const,
      corrections: "none" as const,
      plan: plan({ required: ["lt3"], selected: ["lt3"] }),
    };
    expect(deriveCardState(summative, now)).toMatchObject({
      state: "ask_to_retake",
      cycle: "retake_required",
      askCounts: true,
    });
    // Relearning not done yet: there is nothing to ask for, so it reads closed.
    expect(
      deriveCardState(
        { ...summative, plan: plan({ required: ["lt3"], selected: ["lt3"], locked: ["lt3"] }) },
        now
      )
    ).toMatchObject({ state: "closed", cycle: "relearning", askCounts: false });
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

  it("asks, then reopens: a closed test's retake through the teacher (R4–R6, Oct 14 2026)", () => {
    // Viola: a closed capped quiz at 40%, corrections approved (80%), first try 10 days ago, so
    // the cap's 7-day window has passed too.
    const closed = {
      ...base,
      closesAt: ago(2),
      corrections: "approved" as const,
      finalPercent: 80,
      firstSubmittedAt: ago(10),
    };
    // The window bounds a retake on an open test only: on a closed one the teacher decides.
    expect(deriveCardState(closed, now)).toMatchObject({
      status: "closed",
      state: "ask_to_retake",
      cycle: "retake_available",
      retakeBy: null,
      windowClosed: false,
      askCounts: false,
      retakeRequested: false,
      reopenedUntil: null,
    });
    // Asked: waiting on the teacher, with "Retakes need my OK" or without.
    for (const retakesNeedUnlock of [false, true])
      expect(
        deriveCardState({ ...closed, retakesNeedUnlock, requestedNext: true }, now)
      ).toMatchObject({ state: "awaiting_unlock", retakeRequested: true });
    // Approved through the end of tomorrow: open for her alone, the window ignored.
    const until = new Date(now.getTime() + DAY);
    const reopened = { ...closed, unlockedThrough: 2, openUntil: until };
    expect(deriveCardState(reopened, now)).toMatchObject({
      status: "open",
      state: "retake_available",
      reopenedUntil: until,
      retakeBy: null,
      windowClosed: false,
    });
    expect(deriveCardState({ ...reopened, retakesNeedUnlock: true }, now).state).toBe(
      "retake_available"
    );
    // Taking it: the open attempt keeps the reopen until it ends.
    expect(deriveCardState({ ...reopened, attemptsUsed: 2, inProgress: true }, now)).toMatchObject({
      status: "open",
      state: "in_progress",
      reopenedUntil: until,
    });
    // Once the reopen ends, the test reads closed again and she may ask again.
    expect(deriveCardState(reopened, new Date(until.getTime() + 1))).toMatchObject({
      status: "closed",
      state: "ask_to_retake",
      reopenedUntil: null,
    });
    // A request on an open test without "Retakes need my OK" is a leftover: not "requested".
    expect(deriveCardState({ ...closed, closesAt: null, requestedNext: true }, now)).toMatchObject({
      state: "done",
      retakeRequested: false,
    });
  });
});
