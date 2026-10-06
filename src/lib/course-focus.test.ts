import { describe, expect, it } from "vitest";
import { courseInitials, sectionListPath, splitByCourse } from "./course-focus";

describe("sectionListPath", () => {
  it("lands on the section's list from inside an item", () => {
    expect(sectionListPath("/app/banks/abc")).toBe("/app/banks");
    expect(sectionListPath("/app/banks/abc/questions/new")).toBe("/app/banks");
    expect(sectionListPath("/app/assessments/abc/preview")).toBe("/app/assessments");
    expect(sectionListPath("/app/results/abc/students/def")).toBe("/app/results");
    expect(sectionListPath("/app/results/grading")).toBe("/app/results");
    expect(sectionListPath("/app/assign/abc/relearning")).toBe("/app/assign");
    expect(sectionListPath("/app/classes/abc/activity")).toBe("/app/classes");
    expect(sectionListPath("/app/practice/sets/abc")).toBe("/app/practice");
  });
  it("keeps the worksheets list, and stays put on global pages", () => {
    expect(sectionListPath("/app/practice/worksheets/abc")).toBe("/app/practice/worksheets");
    expect(sectionListPath("/app")).toBe("/app");
    expect(sectionListPath("/app/shared")).toBe("/app/shared");
    expect(sectionListPath("/app/settings/password")).toBe("/app/settings/password");
    expect(sectionListPath("/app/courses/abc")).toBe("/app/courses/abc");
    expect(sectionListPath("/student")).toBe("/student");
  });
});

describe("courseInitials", () => {
  it("takes the first letters of the first two meaningful words", () => {
    expect(courseInitials("Anatomy and Physiology")).toBe("AP");
    expect(courseInitials("Physical Science A")).toBe("PS");
    expect(courseInitials("Biology")).toBe("Bi");
    expect(courseInitials("Medical Terminology")).toBe("MT");
  });
});

describe("splitByCourse", () => {
  const items = [
    { id: "a", courseId: "c1" },
    { id: "b", courseId: "c2" },
    { id: "c", courseId: null },
    { id: "d", courseId: "c1" },
  ];
  it("keeps the current course's items in order, lists no-course items apart, counts the rest", () => {
    expect(splitByCourse(items, { id: "c1" })).toEqual({
      mine: [items[0], items[3]],
      orphans: [items[2]],
      elsewhere: 1,
    });
  });
  it("with no current course, everything is mine", () => {
    expect(splitByCourse(items, null)).toEqual({ mine: items, orphans: [], elsewhere: 0 });
  });
});
