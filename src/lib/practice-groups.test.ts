import { describe, expect, it } from "vitest";
import type { PracticeSetSummary } from "@/lib/queries/practice";
import { attentionReasons, groupByUnit, groupPractice, matchesQuery } from "./practice-groups";

const unit1 = { id: "u1", name: "Unit 1", sortOrder: 0 };
const unit2 = { id: "u2", name: "Unit 2", sortOrder: 1 };
const t = (code: string, unit: typeof unit1 | null) => ({ id: code, code, title: code, unit });
const set = (over: Partial<PracticeSetSummary> & { title: string }): PracticeSetSummary => ({
  kind: "practice_set",
  id: over.title,
  courseId: "c",
  courseName: "Physical Science A",
  isPublished: true,
  sortOrder: 0,
  source: "fixed",
  questions: 10,
  targets: [t("U1.LT1", unit1)],
  completions: 0,
  updatedAt: new Date(),
  ...over,
});

describe("groupPractice", () => {
  it("files published, tagged, non-empty items under their unit in unit order", () => {
    const [g] = groupPractice([
      set({ title: "B", targets: [t("U2.LT1", unit2)] }),
      set({ title: "A" }),
      set({ title: "C", targets: [t("X", null)] }),
    ]);
    expect(g.course).toBe("Physical Science A");
    expect(g.total).toBe(3);
    expect(g.attention).toEqual([]);
    expect(g.units.map((u) => [u.name, u.items.map((i) => i.title)])).toEqual([
      ["Unit 1", ["A"]],
      ["Unit 2", ["B"]],
      ["No unit", ["C"]],
    ]);
  });
  it("lists every unit of a course when given them, empty ones included, in unit order", () => {
    const allUnits = [
      { id: "u2", courseId: "c", name: "Unit 2", sortOrder: 1 },
      { id: "u1", courseId: "c", name: "Unit 1", sortOrder: 0 },
      { id: "u3", courseId: "c", name: "Unit 3", sortOrder: 2 },
      { id: "other", courseId: "another-course", name: "Unit 9", sortOrder: 0 },
    ];
    const [g] = groupPractice(
      [
        set({ title: "B", targets: [t("U2.LT1", unit2)] }),
        set({ title: "C", targets: [t("X", null)] }),
      ],
      allUnits
    );
    expect(g.units.map((u) => [u.name, u.items.map((i) => i.title), u.sets])).toEqual([
      ["Unit 1", [], 0],
      ["Unit 2", ["B"], 1],
      ["Unit 3", [], 0],
      ["No unit", ["C"], 1],
    ]);
    // A course's units never leak into another course's section.
    expect(g.units.some((u) => u.name === "Unit 9")).toBe(false);
  });
  it("drafts, untagged items, and empty sets go to Needs attention instead", () => {
    const [g] = groupPractice([
      set({ title: "draft", isPublished: false }),
      set({ title: "untagged", targets: [] }),
      set({ title: "empty", questions: 0 }),
      set({ title: "fine" }),
    ]);
    expect(g.attention.map((i) => i.title)).toEqual(["draft", "untagged", "empty"]);
    expect(g.units).toHaveLength(1);
    expect(
      attentionReasons(set({ title: "x", isPublished: false, targets: [], questions: 0 }))
    ).toEqual(["draft", "no_target", "no_questions"]);
  });
  it("search matches title, target code, or target title, ignoring case", () => {
    const item = set({
      title: "Unit 1 Practice",
      targets: [{ ...t("U1.LT4", unit1), title: "Classifying matter and density" }],
    });
    expect(matchesQuery(item, "DENSITY")).toBe(true);
    expect(matchesQuery(item, "lt4")).toBe(true);
    expect(matchesQuery(item, "unit 1 pr")).toBe(true);
    expect(matchesQuery(item, "anatomy")).toBe(false);
    expect(matchesQuery(item, "   ")).toBe(true);
  });
});

describe("groupByUnit (student practice)", () => {
  it("buckets by the first target's unit in unit order, with unit-less items last, keeping order within", () => {
    const u1 = { id: "u1", name: "Unit 1: Intro", sortOrder: 0 };
    const u2 = { id: "u2", name: "Unit 2: Integumentary", sortOrder: 1 };
    const items = [
      { title: "skin model", targets: [{ unit: u2 }] },
      { title: "mitosis set", targets: [{ unit: u1 }] },
      { title: "untagged", targets: [] },
      { title: "skin quiz practice", targets: [{ unit: u2 }, { unit: u1 }] },
    ];
    expect(groupByUnit(items).map((b) => [b.name, b.items.map((i) => i.title)])).toEqual([
      ["Unit 1: Intro", ["mitosis set"]],
      ["Unit 2: Integumentary", ["skin model", "skin quiz practice"]],
      ["Other practice", ["untagged"]],
    ]);
  });
});
