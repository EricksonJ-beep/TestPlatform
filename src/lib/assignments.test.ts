import { describe, expect, it } from "vitest";
import {
  assignmentStatus,
  attemptDueAt,
  canStartAttempt,
  capRetakeWindow,
  codesMatch,
  defaultAttempts,
  generateAccessCode,
  needsUnlock,
  nextAttemptAt,
  parseLocalDateTime,
  startReasonText,
  toLocalDateTimeValue,
} from "./assignments";

const at = (iso: string) => new Date(iso);
const now = at("2026-09-22T14:00:00Z");

describe("assignmentStatus", () => {
  it("is scheduled before opens, open inside, closed at/after closes", () => {
    const a = { opensAt: at("2026-09-22T13:00:00Z"), closesAt: at("2026-09-22T15:00:00Z") };
    expect(assignmentStatus(a, at("2026-09-22T12:59:00Z"))).toBe("scheduled");
    expect(assignmentStatus(a, now)).toBe("open");
    expect(assignmentStatus(a, at("2026-09-22T15:00:00Z"))).toBe("closed");
  });
  it("no bounds means always open; one bound works alone", () => {
    expect(assignmentStatus({ opensAt: null, closesAt: null }, now)).toBe("open");
    expect(assignmentStatus({ opensAt: null, closesAt: at("2026-09-21T00:00:00Z") }, now)).toBe(
      "closed"
    );
    expect(assignmentStatus({ opensAt: at("2026-09-23T00:00:00Z"), closesAt: null }, now)).toBe(
      "scheduled"
    );
  });
});

describe("canStartAttempt", () => {
  const open = { opensAt: null, closesAt: null, accessCode: null, attemptsAllowed: 3 };
  it("allows inside the window with attempts left", () => {
    expect(canStartAttempt({ assignment: open, attemptsUsed: 2, now })).toEqual({ ok: true });
  });
  it("retake window (corrections cap): retakes must start within N days of the first attempt", () => {
    const capped = { ...open, retakeWindowDays: 7 };
    const first = at("2026-09-14T14:00:00Z"); // 8 days before now
    expect(
      canStartAttempt({ assignment: capped, attemptsUsed: 1, firstSubmittedAt: first, now })
    ).toMatchObject({ reason: "window_closed", closedAt: at("2026-09-21T14:00:00Z") });
    expect(
      canStartAttempt({
        assignment: capped,
        attemptsUsed: 1,
        firstSubmittedAt: at("2026-09-16T14:00:00Z"),
        now,
      })
    ).toEqual({ ok: true });
    // Attempt 1 is never windowed; no window, no limit.
    expect(canStartAttempt({ assignment: capped, attemptsUsed: 0, now })).toEqual({ ok: true });
    expect(
      canStartAttempt({
        assignment: { ...open, retakeWindowDays: 0 },
        attemptsUsed: 1,
        firstSubmittedAt: first,
        now,
      })
    ).toEqual({ ok: true });
    expect(
      startReasonText({ ok: false, reason: "window_closed", closedAt: at("2026-09-21T14:00:00Z") })
    ).toMatch(/Retakes on this quiz closed Sep 21/);
  });
  it("blocks outside the window", () => {
    expect(
      canStartAttempt({
        assignment: { ...open, opensAt: at("2026-09-23T00:00:00Z") },
        attemptsUsed: 0,
        now,
      })
    ).toMatchObject({ reason: "not_open" });
    expect(
      canStartAttempt({
        assignment: { ...open, closesAt: at("2026-09-22T00:00:00Z") },
        attemptsUsed: 0,
        now,
      })
    ).toMatchObject({ reason: "closed" });
  });
  it("requires the access code when set, forgiving case, spaces and dashes", () => {
    const coded = { ...open, accessCode: "AB3-K9Q" };
    expect(canStartAttempt({ assignment: coded, attemptsUsed: 0, now })).toMatchObject({
      reason: "code_required",
    });
    expect(
      canStartAttempt({ assignment: coded, attemptsUsed: 0, now, accessCode: "nope" })
    ).toMatchObject({ reason: "code_wrong" });
    expect(
      canStartAttempt({ assignment: coded, attemptsUsed: 0, now, accessCode: " ab3 k9q " })
    ).toEqual({ ok: true });
    expect(codesMatch("ab3k9q", "AB3-K9Q")).toBe(true);
  });
  it("enforces a waiting period after the last submission", () => {
    const waited = { ...open, retakeWaitHours: 24 };
    const submitted = at("2026-09-22T00:00:00Z");
    const early = canStartAttempt({
      assignment: waited,
      attemptsUsed: 1,
      lastSubmittedAt: submitted,
      now,
    });
    expect(early).toMatchObject({
      ok: false,
      reason: "wait",
      availableAt: at("2026-09-23T00:00:00Z"),
    });
    expect(startReasonText(early as Exclude<typeof early, { ok: true }>)).toMatch(
      /next attempt opens/
    );
    expect(
      canStartAttempt({
        assignment: waited,
        attemptsUsed: 1,
        lastSubmittedAt: submitted,
        now: at("2026-09-23T00:00:00Z"),
      })
    ).toEqual({ ok: true });
    expect(
      canStartAttempt({ assignment: waited, attemptsUsed: 0, lastSubmittedAt: null, now })
    ).toEqual({ ok: true });
    expect(nextAttemptAt(24, submitted)).toEqual(at("2026-09-23T00:00:00Z"));
    expect(nextAttemptAt(0, submitted)).toBeNull();
  });
  it("with teacher unlocks on, every attempt after the first waits for its unlock", () => {
    const gated = { ...open, retakesNeedUnlock: true };
    expect(canStartAttempt({ assignment: gated, attemptsUsed: 0, now })).toEqual({ ok: true });
    const locked = canStartAttempt({ assignment: gated, attemptsUsed: 1, now });
    expect(locked).toMatchObject({ ok: false, reason: "needs_unlock" });
    expect(startReasonText(locked as Exclude<typeof locked, { ok: true }>)).toMatch(/unlock/);
    expect(
      canStartAttempt({ assignment: gated, attemptsUsed: 1, unlockedThrough: 2, now })
    ).toEqual({ ok: true });
    // An unlock for attempt 2 does not carry over to attempt 3.
    expect(
      canStartAttempt({ assignment: gated, attemptsUsed: 2, unlockedThrough: 2, now })
    ).toMatchObject({ reason: "needs_unlock" });
    // The wait still applies on top of the unlock, and is reported first.
    expect(
      canStartAttempt({
        assignment: { ...gated, retakeWaitHours: 24 },
        attemptsUsed: 1,
        unlockedThrough: 2,
        lastSubmittedAt: at("2026-09-22T00:00:00Z"),
        now,
      })
    ).toMatchObject({ reason: "wait" });
    expect(needsUnlock(0, 0)).toBe(false);
    expect(needsUnlock(1, 0)).toBe(true);
    expect(needsUnlock(1, 2)).toBe(false);
  });
  it("stops at the attempt limit; null is unlimited", () => {
    expect(canStartAttempt({ assignment: open, attemptsUsed: 3, now })).toMatchObject({
      reason: "no_attempts_left",
    });
    expect(
      canStartAttempt({ assignment: { ...open, attemptsAllowed: null }, attemptsUsed: 99, now })
    ).toEqual({ ok: true });
  });
  it("a retake approved after the close starts until its reopen ends, the cap's window ignored (Oct 14 2026)", () => {
    const closed = { ...open, closesAt: at("2026-09-20T05:00:00Z"), retakeWindowDays: 7 };
    const retake = {
      assignment: closed,
      attemptsUsed: 1,
      firstSubmittedAt: at("2026-09-01T14:00:00Z"),
    };
    expect(canStartAttempt({ ...retake, now })).toMatchObject({ reason: "closed" });
    const openUntil = at("2026-09-23T04:59:59.999Z");
    expect(canStartAttempt({ ...retake, openUntil, now })).toEqual({ ok: true });
    // Everything else still applies: the attempt limit, and the end of the reopen.
    expect(canStartAttempt({ ...retake, attemptsUsed: 3, openUntil, now })).toMatchObject({
      reason: "no_attempts_left",
    });
    expect(canStartAttempt({ ...retake, openUntil, now: openUntil })).toMatchObject({
      reason: "closed",
    });
  });
  it("past the cap's window on an open test, an approved retake starts until its end (Oct 14 2026)", () => {
    // "Let them ask while it's still open too": the teacher's approval sets open_until.
    const capped = { ...open, closesAt: at("2026-10-30T05:00:00Z"), retakeWindowDays: 7 };
    const retake = {
      assignment: capped,
      attemptsUsed: 1,
      firstSubmittedAt: at("2026-09-14T14:00:00Z"), // 8 days before now
    };
    expect(canStartAttempt({ ...retake, now })).toMatchObject({ reason: "window_closed" });
    const openUntil = at("2026-09-24T04:59:59.999Z"); // before the class close
    expect(canStartAttempt({ ...retake, openUntil, now })).toEqual({ ok: true });
    // With "Retakes need my OK" the unlock is the same row.
    expect(
      canStartAttempt({
        ...retake,
        assignment: { ...capped, retakesNeedUnlock: true },
        unlockedThrough: 2,
        openUntil,
        now,
      })
    ).toEqual({ ok: true });
    // Unused by its end: the window applies again.
    expect(canStartAttempt({ ...retake, openUntil, now: openUntil })).toMatchObject({
      reason: "window_closed",
    });
    // The wait between attempts still counts.
    expect(
      canStartAttempt({
        ...retake,
        assignment: { ...capped, retakeWaitHours: 24 },
        lastSubmittedAt: at("2026-09-22T13:00:00Z"),
        openUntil,
        now,
      })
    ).toMatchObject({ reason: "wait" });
  });
});

describe("capRetakeWindow", () => {
  const input = {
    capped: true,
    rule: "gate" as const,
    open: true,
    retakeWindowDays: 7,
    firstSubmittedAt: at("2026-09-14T14:00:00Z"), // 8 days before now
    openUntil: null,
    now,
  };
  const end = at("2026-09-21T14:00:00Z");
  it("passes a week after attempt 1 on an open capped quiz with a retake on offer", () => {
    expect(capRetakeWindow(input)).toEqual({ retakeBy: end, passed: true });
    expect(capRetakeWindow({ ...input, firstSubmittedAt: at("2026-09-20T14:00:00Z") })).toEqual({
      retakeBy: at("2026-09-27T14:00:00Z"),
      passed: false,
    });
  });
  it("doesn't apply without the cap, at or above the line, on a closed test, or before attempt 1", () => {
    const none = { retakeBy: null, passed: false };
    expect(capRetakeWindow({ ...input, capped: false })).toEqual(none);
    expect(capRetakeWindow({ ...input, rule: "to_full" })).toEqual(none);
    expect(capRetakeWindow({ ...input, open: false })).toEqual(none);
    expect(capRetakeWindow({ ...input, firstSubmittedAt: null })).toEqual(none);
    expect(capRetakeWindow({ ...input, retakeWindowDays: 0 })).toEqual(none);
  });
  it("doesn't apply while an approved retake's end is ahead, and does again after it", () => {
    const openUntil = at("2026-09-24T04:59:59.999Z");
    expect(capRetakeWindow({ ...input, openUntil })).toEqual({ retakeBy: null, passed: false });
    expect(capRetakeWindow({ ...input, openUntil, now: openUntil })).toEqual({
      retakeBy: end,
      passed: true,
    });
  });
});

describe("attemptDueAt", () => {
  const startedAt = at("2026-09-22T14:00:00Z");
  it("start + limit, scaled by extra time", () => {
    expect(
      attemptDueAt({ startedAt, timeLimitMinutes: 20, extraTimePercent: 0, closesAt: null })
    ).toEqual(at("2026-09-22T14:20:00Z"));
    expect(
      attemptDueAt({ startedAt, timeLimitMinutes: 20, extraTimePercent: 50, closesAt: null })
    ).toEqual(at("2026-09-22T14:30:00Z"));
  });
  it("never runs past the close; no limit and no close means no deadline", () => {
    expect(
      attemptDueAt({
        startedAt,
        timeLimitMinutes: 60,
        extraTimePercent: 0,
        closesAt: at("2026-09-22T14:45:00Z"),
      })
    ).toEqual(at("2026-09-22T14:45:00Z"));
    expect(
      attemptDueAt({
        startedAt,
        timeLimitMinutes: null,
        extraTimePercent: 0,
        closesAt: at("2026-09-22T16:00:00Z"),
      })
    ).toEqual(at("2026-09-22T16:00:00Z"));
    expect(
      attemptDueAt({ startedAt, timeLimitMinutes: null, extraTimePercent: 100, closesAt: null })
    ).toBeNull();
  });
});

describe("defaults, dates, codes", () => {
  it("attempt defaults by type", () => {
    expect(defaultAttempts("practice")).toBeNull();
    expect(defaultAttempts("formative")).toBe(3);
    expect(defaultAttempts("summative")).toBe(1);
  });
  it("datetime-local round-trips through the browser offset (Central Daylight = +300)", () => {
    const d = parseLocalDateTime("2026-09-22T08:00", 300);
    expect(d?.toISOString()).toBe("2026-09-22T13:00:00.000Z");
    expect(toLocalDateTimeValue(d!, 300)).toBe("2026-09-22T08:00");
    expect(parseLocalDateTime("garbage", 300)).toBeNull();
  });
  it("access codes are six unambiguous characters", () => {
    const code = generateAccessCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(generateAccessCode(() => 0)).toBe("AAAAAA");
  });
});
