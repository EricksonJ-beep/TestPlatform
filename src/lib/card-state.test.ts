import { describe, expect, it } from "vitest";
import { deriveCardState, type CardInput } from "./card-state";
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
  unlockedThrough: 0,
  firstPercent: 40,
  firstSubmittedAt: ago(1),
  bestPercent: 40,
  finalPercent: 40,
  corrections: "needed",
  plan: null,
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

  it("still works out the cycle once the test has closed; the student's card says closed", () => {
    const closed = { ...base, closesAt: ago(0.5) };
    expect(deriveCardState(closed, now)).toMatchObject({
      status: "closed",
      state: "closed",
      cycle: "corrections_needed",
    });
    // A paused test is finished in class even after the close (Finish later).
    expect(deriveCardState({ ...closed, inProgress: true }, now).state).toBe("in_progress");
    const summative = {
      ...closed,
      type: "summative" as const,
      corrections: "none" as const,
      plan: plan({ required: ["lt3"], selected: ["lt3"] }),
    };
    expect(deriveCardState(summative, now).cycle).toBe("retake_required");
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
    // "Retakes need my OK": corrections never hold the card; the unlock does.
    expect(deriveCardState({ ...base, retakesNeedUnlock: true }, now)).toMatchObject({
      rule: "optional",
      state: "awaiting_unlock",
    });
    expect(
      deriveCardState({ ...base, retakesNeedUnlock: true, unlockedThrough: 2 }, now).state
    ).toBe("retake_available");
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
});
