import { describe, expect, it } from "vitest";
import { groupByUnit, nudgeCard, placeCard, NO_UNIT } from "./unit-shelves";

const units = [
  { id: "u2", courseId: "c1", name: "Unit 2", sortOrder: 1 },
  { id: "u1", courseId: "c1", name: "Unit 1", sortOrder: 0 },
  { id: "u9", courseId: "c2", name: "Unit 1", sortOrder: 0 },
];
const item = (id: string, unitId: string | null, sortOrder: number, courseId = "c1") => ({
  id,
  courseId,
  courseName: courseId === "c1" ? "Physical Science A" : "Biology",
  unitId,
  sortOrder,
});

describe("groupByUnit", () => {
  it("one section per course, every unit as a shelf in unit order, loose cards last", () => {
    const out = groupByUnit(
      [item("a", "u2", 0), item("b", null, 0), item("c", "u1", 1), item("d", "u1", 0)],
      units
    );
    expect(out.map((c) => c.course)).toEqual(["Physical Science A"]);
    expect(out[0].shelves.map((s) => s.name)).toEqual(["Unit 1", "Unit 2", NO_UNIT]);
    expect(out[0].shelves[0].items.map((i) => i.id)).toEqual(["d", "c"]);
    expect(out[0].shelves[1].items.map((i) => i.id)).toEqual(["a"]);
    expect(out[0].shelves[2].items.map((i) => i.id)).toEqual(["b"]);
  });
  it("skips the loose shelf when nothing is loose, and keeps empty units as drop targets", () => {
    const out = groupByUnit([item("a", "u1", 0)], units);
    expect(out[0].shelves.map((s) => [s.name, s.items.length])).toEqual([
      ["Unit 1", 1],
      ["Unit 2", 0],
    ]);
  });
  it("a course with no units gets only the loose shelf; courses sort by name, no course last", () => {
    const out = groupByUnit(
      [
        { id: "z", courseId: null, courseName: null, unitId: null, sortOrder: 0 },
        item("b", null, 0, "c2"),
        item("a", null, 0),
      ],
      units.filter((u) => u.courseId === "c1")
    );
    expect(out.map((c) => c.course)).toEqual(["Biology", "Physical Science A", "No course"]);
    expect(out[0].shelves.map((s) => s.name)).toEqual([NO_UNIT]);
  });
});

describe("placeCard", () => {
  const shelves = groupByUnit(
    [item("a", "u1", 0), item("b", "u1", 1), item("c", "u2", 0), item("d", null, 0)],
    units
  )[0].shelves;
  it("dropping on a card slots in front of it, in that card's shelf", () => {
    expect(placeCard(shelves, "c", { cardId: "a" })).toEqual({
      unitId: "u1",
      orderedIds: ["c", "a", "b"],
    });
    expect(placeCard(shelves, "a", { cardId: "b" })).toEqual({
      unitId: "u1",
      orderedIds: ["a", "b"],
    });
  });
  it("dropping on a shelf header appends to that shelf", () => {
    expect(placeCard(shelves, "d", { unitId: "u1" })).toEqual({
      unitId: "u1",
      orderedIds: ["a", "b", "d"],
    });
    expect(placeCard(shelves, "a", { unitId: null })).toEqual({
      unitId: null,
      orderedIds: ["d", "a"],
    });
  });
  it("ignores a drop on itself or on an unknown target", () => {
    expect(placeCard(shelves, "a", { cardId: "a" })).toBeNull();
    expect(placeCard(shelves, "a", { cardId: "nope" })).toBeNull();
    expect(placeCard(shelves, "nope", { unitId: "u1" })).toBeNull();
  });
});

describe("nudgeCard", () => {
  const shelf = { unitId: "u1", name: "Unit 1", items: [item("a", "u1", 0), item("b", "u1", 1)] };
  it("swaps with the neighbour and refuses to fall off the ends", () => {
    expect(nudgeCard(shelf, "a", 1)).toEqual(["b", "a"]);
    expect(nudgeCard(shelf, "a", -1)).toBeNull();
    expect(nudgeCard(shelf, "b", 1)).toBeNull();
  });
});
