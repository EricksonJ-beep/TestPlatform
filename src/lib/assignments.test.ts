import { describe, expect, it } from "vitest";
import {
  assignmentStatus,
  attemptDueAt,
  canStartAttempt,
  codesMatch,
  defaultAttempts,
  generateAccessCode,
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
  it("stops at the attempt limit; null is unlimited", () => {
    expect(canStartAttempt({ assignment: open, attemptsUsed: 3, now })).toMatchObject({
      reason: "no_attempts_left",
    });
    expect(
      canStartAttempt({ assignment: { ...open, attemptsAllowed: null }, attemptsUsed: 99, now })
    ).toEqual({ ok: true });
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
    expect(defaultAttempts("summative")).toBe(2);
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
