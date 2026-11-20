import { describe, expect, it } from "vitest";
import { parseSchoolYear, schoolYearChoices, schoolYearOf } from "@/lib/school-year";

describe("school year", () => {
  it("turns over on July 1, school time", () => {
    expect(schoolYearOf(new Date("2026-11-20T15:00:00Z"))).toBe("2026-27");
    expect(schoolYearOf(new Date("2027-03-01T15:00:00Z"))).toBe("2026-27");
    expect(schoolYearOf(new Date("2027-07-01T03:00:00Z"))).toBe("2026-27"); // still June 30 in Chicago
    expect(schoolYearOf(new Date("2027-07-01T15:00:00Z"))).toBe("2027-28");
    expect(schoolYearOf(new Date("2099-09-01T15:00:00Z"))).toBe("2099-00");
  });
  it("offers last year, this year and next year", () => {
    expect(schoolYearChoices(new Date("2026-11-20T15:00:00Z"))).toEqual([
      "2025-26",
      "2026-27",
      "2027-28",
    ]);
  });
  it("tidies what was typed and refuses years that don't follow each other", () => {
    expect(parseSchoolYear(" 2026-2027 ")).toBe("2026-27");
    expect(parseSchoolYear("2026/27")).toBe("2026-27");
    expect(parseSchoolYear("2026–27")).toBe("2026-27");
    expect(parseSchoolYear("2026-28")).toBeNull();
    expect(parseSchoolYear("2026")).toBeNull();
    expect(parseSchoolYear("Fall 2026")).toBeNull();
  });
});
