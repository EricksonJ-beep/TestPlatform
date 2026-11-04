/** Lunch codes from a pasted roster (made-up names): the school's layout, a plain list, matching. */
import { describe, expect, it } from "vitest";
import { matchLunchCodes, parseLunchCodes } from "./lunch-codes";

describe("parseLunchCodes", () => {
  it("reads 'Last, First MI / grade / email' lines and skips the header", () => {
    const lines = parseLunchCodes(
      "Last, First MI  Grade  Email\nDOE, JANE A.  09  1234@school.org\nVAN DYKE, SAM B.\t09\t5678@school.org"
    );
    expect(lines.map((l) => [l.last, l.first, l.code])).toEqual([
      ["DOE", "JANE", "1234"],
      ["VAN DYKE", "SAM", "5678"],
    ]);
  });
  it("reads a plain 'First Last code' list and skips lines with no code", () => {
    expect(parseLunchCodes("Jane Doe 1234\nno code here").map((l) => l.code)).toEqual(["1234"]);
  });
});

describe("matchLunchCodes", () => {
  const students = [
    { id: "a", firstName: "Jane", lastName: "Doe" },
    { id: "b", firstName: "Sam", lastName: "Van Dyke" },
    { id: "c", firstName: "Lee", lastName: "Ortiz-Park" },
    { id: "d", firstName: "Ava", lastName: "Smith" },
    { id: "e", firstName: "Ben", lastName: "Smith" },
  ];
  it("matches by last and first name, ignoring case, spaces and hyphens", () => {
    const r = matchLunchCodes(
      parseLunchCodes(
        "DOE, JANE A. 09 1234@x\nVAN DYKE, SAM B. 09 5678@x\nORTIZ-PARK, LEE C. 09 2468@x\nSMITH, BEN D. 09 1357@x\nNOBODY, NEW 09 1111@x"
      ),
      students
    );
    expect(r.matched).toEqual([
      { studentId: "a", code: "1234" },
      { studentId: "b", code: "5678" },
      { studentId: "c", code: "2468" },
      { studentId: "e", code: "1357" },
    ]);
    expect(r.unmatched.map((l) => l.last)).toEqual(["NOBODY"]);
  });
});
