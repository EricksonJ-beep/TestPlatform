/** Finish later (Jon, Oct 13 2026): when an open test pauses, and the clock it keeps. */
import { describe, expect, it } from "vitest";
import {
  IDLE_PAUSE_MS,
  lockAnswered,
  outOfTime,
  pausePoint,
  remainingAtClose,
  resumedDueAt,
} from "./pause";

const T = (min: number) => new Date(Date.UTC(2026, 9, 13, 9, 0) + min * 60_000);
const attempt = (o: Partial<Parameters<typeof pausePoint>[0]> = {}) => ({
  status: "in_progress",
  startedAt: T(0),
  dueAt: null as Date | null,
  pausedAt: null as Date | null,
  lastActiveAt: T(5) as Date | null,
  ...o,
});

describe("pausePoint", () => {
  it("pauses 10 minutes after the last sign of work, not before", () => {
    expect(pausePoint(attempt(), null, T(14))).toBeNull();
    expect(pausePoint(attempt(), null, T(30))).toEqual({ at: T(15), reason: "idle" });
  });

  it("never idle-pauses an attempt with no recorded activity (started before this feature)", () =>
    expect(pausePoint(attempt({ lastActiveAt: null }), null, T(60))).toBeNull());

  it("pauses at the window's close when the student was still working then", () => {
    expect(pausePoint(attempt({ lastActiveAt: T(9) }), T(10), T(11))).toEqual({
      at: T(10),
      reason: "closed",
    });
    // Let back in after the close: no second pause for it.
    expect(pausePoint(attempt({ lastActiveAt: T(12) }), T(10), T(13))).toBeNull();
  });

  it("a deadline capped at the close is the close, but a time limit that runs out first is not a pause", () => {
    expect(pausePoint(attempt({ lastActiveAt: T(9), dueAt: T(10) }), T(10), T(11))).toEqual({
      at: T(10),
      reason: "closed",
    });
    expect(pausePoint(attempt({ dueAt: T(12) }), null, T(30))).toBeNull();
  });

  it("does nothing to a finished or already paused attempt", () => {
    expect(pausePoint(attempt({ status: "submitted" }), null, T(60))).toBeNull();
    expect(pausePoint(attempt({ pausedAt: T(6) }), null, T(60))).toBeNull();
  });

  it("uses a 10-minute idle window", () => expect(IDLE_PAUSE_MS).toBe(600_000));
});

describe("outOfTime", () => {
  const open = (o: Partial<Parameters<typeof pausePoint>[0]> = {}) => ({
    ...attempt(o),
    pauseReason: null,
  });
  it("is an open test whose time limit ran out before anything paused it, for good", () => {
    // A 20-minute quiz, last save at 9:19, laptop shut: the deadline (9:20) beats the idle point.
    const quiz = open({ dueAt: T(20), lastActiveAt: T(19) });
    expect(outOfTime(quiz, null, T(19))).toBe(false);
    expect(outOfTime(quiz, null, T(21))).toBe(true);
    expect(outOfTime(quiz, null, T(60 * 24))).toBe(true);
  });
  it("is never a paused test, a test with no clock, or a finished one", () => {
    expect(outOfTime(open({ dueAt: T(40), lastActiveAt: T(5) }), null, T(60))).toBe(false); // idle first
    expect(outOfTime(open({ pausedAt: T(6), dueAt: null }), null, T(60))).toBe(false);
    expect(outOfTime(open({ dueAt: null }), null, T(8))).toBe(false);
    expect(outOfTime(open({ status: "submitted", dueAt: T(10) }), null, T(60))).toBe(false);
  });
});

describe("the clock", () => {
  it("time owed at a window close comes from the time limit and extra time", () => {
    expect(
      remainingAtClose({
        startedAt: T(0),
        timeLimitMinutes: 30,
        extraTimePercent: 0,
        closesAt: T(10),
      })
    ).toBe(20 * 60_000);
    expect(
      remainingAtClose({
        startedAt: T(0),
        timeLimitMinutes: 20,
        extraTimePercent: 50,
        closesAt: T(10),
      })
    ).toBe(20 * 60_000);
    expect(
      remainingAtClose({
        startedAt: T(0),
        timeLimitMinutes: null,
        extraTimePercent: 0,
        closesAt: T(10),
      })
    ).toBeNull();
  });

  it("restarts from the time that was left", () => {
    expect(resumedDueAt(5 * 60_000, T(100))).toEqual(T(105));
    expect(resumedDueAt(null, T(100))).toBeNull();
  });

  it("locked answers only grow", () =>
    expect(lockAnswered(["a"], ["b", "a"]).sort()).toEqual(["a", "b"]));
});
