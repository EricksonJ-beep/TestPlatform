import { describe, expect, it } from "vitest";
import { parseRememberedClasses, periodLabel, pickPeriod, rememberClassList } from "./class-focus";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

describe("parseRememberedClasses", () => {
  it("keeps ids only, newest first, without repeats", () => {
    expect(parseRememberedClasses(undefined)).toEqual([]);
    expect(parseRememberedClasses("")).toEqual([]);
    expect(parseRememberedClasses(`${A},nope,,${B},${A}`)).toEqual([A, B]);
    expect(parseRememberedClasses("'; drop table classes; --")).toEqual([]);
  });
});

describe("rememberClassList", () => {
  it("moves the pick to the front and keeps the list short", () => {
    expect(rememberClassList([], A)).toBe(A);
    expect(rememberClassList([B, A, C], A)).toBe([A, B, C].join(","));
    const many = Array.from(
      { length: 20 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
    );
    const kept = parseRememberedClasses(rememberClassList(many, A));
    expect(kept[0]).toBe(A);
    expect(kept).toHaveLength(12);
  });
});

describe("pickPeriod (decision 8: the period picked last)", () => {
  const classes = [
    { id: A, name: "Bio 2nd" },
    { id: B, name: "Bio 6th" },
  ];
  it("opens on the newest remembered class of this course", () => {
    expect(pickPeriod(classes, [B, A])?.id).toBe(B);
    // C is a class of another course (or someone else's): it never matches, the next one does.
    expect(pickPeriod(classes, [C, A])?.id).toBe(A);
  });
  it("falls back to the course's first class, or null with none", () => {
    expect(pickPeriod(classes, [C])?.id).toBe(A);
    expect(pickPeriod(classes, [])?.id).toBe(A);
    expect(pickPeriod([], [A])).toBeNull();
  });
});

describe("periodLabel", () => {
  it("writes the period as the inbox does, else the class name", () => {
    expect(periodLabel({ name: "Bio 2nd", period: "2" })).toBe("P2");
    expect(periodLabel({ name: "Bio", period: "Period 3" })).toBe("P3");
    expect(periodLabel({ name: "Seminar", period: null })).toBe("Seminar");
    expect(periodLabel({ name: "Seminar", period: "  " })).toBe("Seminar");
  });
});
