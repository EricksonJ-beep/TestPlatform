import { describe, expect, it } from "vitest";
import { MASTER_CODE_WORDS, generateMasterCode, masterCodeEnd } from "./master-code";

describe("masterCodeEnd", () => {
  it("runs to 3:30 PM Central the same day", () => {
    // Nov 20 2026, 8:05 AM CST (UTC-6) → 3:30 PM CST.
    expect(masterCodeEnd(new Date("2026-11-20T14:05:00Z"))).toEqual(
      new Date("2026-11-20T21:30:00Z")
    );
    // One minute before the end still ends today.
    expect(masterCodeEnd(new Date("2026-11-20T21:29:00Z"))).toEqual(
      new Date("2026-11-20T21:30:00Z")
    );
  });

  it("issued at or after 3:30 PM, runs to 3:30 PM the next day", () => {
    expect(masterCodeEnd(new Date("2026-11-20T21:30:00Z"))).toEqual(
      new Date("2026-11-21T21:30:00Z")
    );
    // 8 PM CST on the 20th is already the 21st in UTC; the school's date is what counts.
    expect(masterCodeEnd(new Date("2026-11-21T02:00:00Z"))).toEqual(
      new Date("2026-11-21T21:30:00Z")
    );
  });

  it("follows daylight time", () => {
    // May 4 2026, 9 AM CDT (UTC-5) → 3:30 PM CDT.
    expect(masterCodeEnd(new Date("2026-05-04T14:00:00Z"))).toEqual(
      new Date("2026-05-04T20:30:00Z")
    );
    // The evening before clocks go back (Oct 31 2026, 6 PM CDT) → Nov 1, 3:30 PM CST.
    expect(masterCodeEnd(new Date("2026-10-31T23:00:00Z"))).toEqual(
      new Date("2026-11-01T21:30:00Z")
    );
  });
});

describe("generateMasterCode", () => {
  it("is a word and a number from 10 to 999", () => {
    expect(generateMasterCode(() => 0)).toBe(`${MASTER_CODE_WORDS[0]}10`);
    expect(generateMasterCode(() => 0.999999)).toBe(`${MASTER_CODE_WORDS.at(-1)}999`);
    for (let i = 0; i < 200; i++) expect(generateMasterCode()).toMatch(/^[a-z]{3,8}\d{2,3}$/);
  });

  it("has no repeated words", () => {
    expect(new Set(MASTER_CODE_WORDS).size).toBe(MASTER_CODE_WORDS.length);
  });
});
