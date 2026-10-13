/** Bank type columns (Jon, Oct 13 2026): type from the name, LT order, drag placement. */
import { describe, expect, it } from "vitest";
import { compareInColumn, groupByKind, kindFromName, placeInColumn } from "./bank-kinds";

const bank = (
  id: string,
  name: string,
  kind: string | null = null,
  kindOrder: number | null = null
) => ({
  id,
  name,
  kind,
  kindOrder,
});

describe("kindFromName", () => {
  it.each([
    ["PS · U1.LT4 · Practice", "practice"],
    ["Physical Science · Unit 1 · Retake", "retake"],
    ["Physical Science · Unit 1 Retake Test", "retake"],
    ["Physical Science · Unit 1 Test", "test"],
    ["Anatomy and Physiology Unit 1 Exam", "test"],
    ["Physical Science · Unit 2 Quiz: Elements", "quiz"],
    ["AP · Unit 2 Lab Quiz: Integumentary", "quiz"],
    ["Physical Science · Unit 2 · LT1 Atomic Theory", "other"],
    ["Contest prep", "other"],
  ])("%s → %s", (name, kind) => expect(kindFromName(name)).toBe(kind));
});

describe("column order", () => {
  it("orders by learning target number, not as text", () => {
    const names = ["PS · U1.LT10 · Practice", "PS · U1.LT2 · Practice", "PS · U1.LT1 · Practice"];
    const sorted = names
      .map((n) => bank(n, n))
      .sort(compareInColumn)
      .map((b) => b.name);
    expect(sorted).toEqual([
      "PS · U1.LT1 · Practice",
      "PS · U1.LT2 · Practice",
      "PS · U1.LT10 · Practice",
    ]);
  });

  it("puts banks placed by hand first, in their saved order", () => {
    const sorted = [
      bank("a", "LT1 quiz"),
      bank("b", "LT2 quiz", null, 1),
      bank("c", "LT3 quiz", null, 0),
    ]
      .sort(compareInColumn)
      .map((b) => b.id);
    expect(sorted).toEqual(["c", "b", "a"]);
  });
});

describe("groupByKind", () => {
  it("always shows the four main columns, Other only when needed, and a chosen type wins", () => {
    const cols = groupByKind([
      bank("p", "U1.LT1 Practice"),
      bank("t", "Unit 1 Test"),
      bank("x", "Unit 1 Test", "retake"),
    ]);
    expect(cols.map((c) => c.kind)).toEqual(["practice", "quiz", "test", "retake"]);
    expect(cols.find((c) => c.kind === "retake")!.items.map((b) => b.id)).toEqual(["x"]);
    expect(groupByKind([bank("o", "Atomic theory")]).map((c) => c.kind)).toContain("other");
  });
});

describe("assessments", () => {
  it("a title that names no column falls back on the assessment's type", () => {
    const cols = groupByKind([
      { ...bank("f", "Cell organelles check"), type: "formative" },
      { ...bank("s", "Unit 2 final"), type: "summative" },
      { ...bank("q", "Unit 1 Retake Test"), type: "summative" },
    ]);
    const where = (id: string) => cols.find((c) => c.items.some((i) => i.id === id))!.kind;
    expect([where("f"), where("s"), where("q")]).toEqual(["quiz", "test", "retake"]);
    expect(cols.map((c) => c.kind)).not.toContain("other");
  });
});

describe("placeInColumn", () => {
  const cols = groupByKind([
    bank("q1", "LT1 Quiz"),
    bank("q2", "LT2 Quiz"),
    bank("p1", "LT1 Practice"),
  ]);
  it("drops in front of a card, taking its column", () =>
    expect(placeInColumn(cols, "p1", { cardId: "q2" })).toEqual({
      kind: "quiz",
      orderedIds: ["q1", "p1", "q2"],
    }));
  it("drops at the end of an empty column", () =>
    expect(placeInColumn(cols, "q1", { kind: "retake" })).toEqual({
      kind: "retake",
      orderedIds: ["q1"],
    }));
});
