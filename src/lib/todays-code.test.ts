import { describe, expect, it } from "vitest";
import { canStartAttempt } from "@/lib/assignments";
import { checkTypedCode, codeExpiry, suggestCode } from "@/lib/todays-code";

const at = (iso: string) => new Date(iso);

describe("checkTypedCode", () => {
  it("takes a word and at least two digits, stored lower case without spaces or dashes", () => {
    expect(checkTypedCode("Coffee 123")).toEqual({ ok: true, code: "coffee123" });
    expect(checkTypedCode("fish-365")).toEqual({ ok: true, code: "fish365" });
  });
  it("refuses a bare word, a bare number, one digit, too short, too long, and symbols", () => {
    for (const bad of ["coffee", "123456", "coffee1", "ab12", "a".repeat(19) + "12", "coffee!23"])
      expect(checkTypedCode(bad)).toEqual({ ok: false });
  });
});

describe("suggestCode", () => {
  it("always suggests a code the rule takes", () => {
    for (let i = 0; i < 200; i++) expect(checkTypedCode(suggestCode()).ok).toBe(true);
    expect(suggestCode(() => 0)).toBe("coffee100");
  });
});

describe("codeExpiry", () => {
  // Nov 20 2026 is Central Standard Time (UTC-6): 4:00 PM is 22:00 UTC.
  it("this hour is one class period", () => {
    expect(codeExpiry("hour", at("2026-11-20T14:00:00Z"))).toEqual(at("2026-11-20T14:50:00Z"));
  });
  it("the rest of the day ends at 4:00 PM school time", () => {
    expect(codeExpiry("day", at("2026-11-20T14:00:00Z"))).toEqual(at("2026-11-20T22:00:00Z"));
    // Daylight time (UTC-5): 4:00 PM is 21:00 UTC.
    expect(codeExpiry("day", at("2026-09-22T14:00:00Z"))).toEqual(at("2026-09-22T21:00:00Z"));
  });
  it("late in the day, or after it, the code still gets a class period", () => {
    expect(codeExpiry("day", at("2026-11-20T21:30:00Z"))).toEqual(at("2026-11-20T22:20:00Z"));
    expect(codeExpiry("day", at("2026-11-20T23:00:00Z"))).toEqual(at("2026-11-20T23:50:00Z"));
  });
});

describe("canStartAttempt with today's code", () => {
  const now = at("2026-11-20T14:00:00Z");
  const locked = { opensAt: null, closesAt: null, accessCode: "AB3K9Q", attemptsAllowed: 3 };
  const start = (over: Partial<Parameters<typeof canStartAttempt>[0]>) =>
    canStartAttempt({ assignment: locked, attemptsUsed: 0, now, ...over });
  it("opens a code-locked test with either code, matched loosely", () => {
    expect(start({ accessCode: "Coffee 123", todaysCode: "coffee123" })).toEqual({ ok: true });
    expect(start({ accessCode: "ab3k9q", todaysCode: "coffee123" })).toEqual({ ok: true });
    expect(start({ accessCode: "coffee124", todaysCode: "coffee123" })).toMatchObject({
      reason: "code_wrong",
    });
    expect(start({ accessCode: "coffee123", todaysCode: null })).toMatchObject({
      reason: "code_wrong",
    });
  });
  it("opens nothing else: the window, attempts and unlocks still apply", () => {
    const code = { accessCode: "coffee123", todaysCode: "coffee123" };
    expect(
      start({ ...code, assignment: { ...locked, closesAt: at("2026-11-20T13:00:00Z") } })
    ).toMatchObject({ reason: "closed" });
    expect(
      start({ ...code, assignment: { ...locked, opensAt: at("2026-11-21T13:00:00Z") } })
    ).toMatchObject({ reason: "not_open" });
    expect(start({ ...code, attemptsUsed: 3 })).toMatchObject({ reason: "no_attempts_left" });
    expect(
      start({ ...code, attemptsUsed: 1, assignment: { ...locked, retakesNeedUnlock: true } })
    ).toMatchObject({ reason: "needs_unlock" });
  });
});
