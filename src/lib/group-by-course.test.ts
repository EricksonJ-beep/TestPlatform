import { describe, expect, it } from "vitest";
import { groupByCourse } from "./group-by-course";

describe("groupByCourse", () => {
  it("one group per course, sorted by name, no-course last, item order kept", () => {
    const groups = groupByCourse([
      { id: 1, courseName: "Physical Science A" },
      { id: 2, courseName: null },
      { id: 3, courseName: "Biology A" },
      { id: 4, courseName: "Physical Science A" },
    ]);
    expect(groups.map((g) => g.course)).toEqual(["Biology A", "Physical Science A", "No course"]);
    expect(groups[1].items.map((i) => i.id)).toEqual([1, 4]);
  });

  it("is empty for no items", () => {
    expect(groupByCourse([])).toEqual([]);
  });
});
