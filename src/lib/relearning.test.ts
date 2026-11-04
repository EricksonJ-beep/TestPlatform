/**
 * Read · Watch · Do (docs/relearning-revamp-plan.md A1–A6, Q3; ticket R4): the option a target
 * uses, the sections a bundle serves, the picker's cards, credit, and quick-check grading.
 */
import { describe, expect, it } from "vitest";
import type { QuickCheck } from "@/db/schema";
import {
  dueCheck,
  gradeCheck,
  modeChoices,
  optionFor,
  publicCheck,
  rowDone,
  sectionDone,
  sectionsFor,
  segmentWatchPercent,
  type OptionInfo,
  type RelearningMode,
  type SectionInfo,
} from "./relearning";

const mc = (id: string, answer = "b"): QuickCheck => ({
  id,
  kind: "multiple_choice",
  prompt: "?",
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  answer,
  explanation: "Because B.",
});
let n = 0;
const section = (part: "core" | "extension", over: Partial<SectionInfo> = {}): SectionInfo => ({
  id: `s${++n}`,
  part,
  sortOrder: n,
  title: null,
  body: { type: "text", text: "Hi" },
  checks: [],
  shortAnswerPrompt: null,
  estMinutes: part === "core" ? 4 : 6,
  mediaAssetId: null,
  ...over,
});
const option = (target: string, mode: RelearningMode, sections: SectionInfo[]): OptionInfo => ({
  id: `${target}-${mode}`,
  learningTargetId: target,
  mode,
  title: `${mode} ${target}`,
  description: null,
  sections,
});

describe("which sections a bundle serves (Q3, A2, A5)", () => {
  const lt1 = [
    option("lt1", "read", [section("extension"), section("core")]),
    option("lt1", "watch", [section("core", { body: { type: "video", youtubeId: "x" } })]),
  ];
  it("one target: core then extension; several: cores only", () => {
    const read = optionFor(lt1, "read")!;
    expect(sectionsFor(read, true).map((s) => s.part)).toEqual(["core", "extension"]);
    expect(sectionsFor(read, false).map((s) => s.part)).toEqual(["core"]);
  });

  it("falls back to Read, then Do, then Watch when a mode isn't built", () => {
    expect(optionFor(lt1, "do")?.mode).toBe("read");
    expect(optionFor([option("lt2", "watch", [section("core")])], "do")?.mode).toBe("watch");
    expect(optionFor([option("lt3", "read", [])], "read")).toBeNull();
  });

  it("offers a card per mode any target has built, adding up the minutes", () => {
    const byTarget = new Map([
      ["lt1", lt1],
      ["lt2", [option("lt2", "read", [section("core"), section("extension")])]],
      ["lt3", []],
    ]);
    const one = modeChoices(byTarget, ["lt1"]);
    expect(one.choices.map((c) => [c.mode, c.minutes, c.title])).toEqual([
      ["read", 10, "read lt1"],
      ["watch", 4, "watch lt1"],
    ]);
    const stitched = modeChoices(byTarget, ["lt1", "lt2", "lt3"]);
    expect(stitched.unbuilt).toEqual(["lt3"]);
    expect(stitched.choices.map((c) => [c.mode, c.minutes, c.fallbackFor])).toEqual([
      ["read", 8, []],
      ["watch", 8, ["lt2"]],
    ]);
    expect(modeChoices(new Map([["lt3", []]]), ["lt3"]).choices).toEqual([]);
  });
});

describe("credit (A3)", () => {
  it("a reading needs every check right and the end reached", () => {
    const s = section("core", { checks: [mc("c1")] });
    expect(sectionDone(s, { checks: { c1: { correct: true, tries: 2, at: "" } } })).toBe(false);
    expect(
      sectionDone(s, {
        checks: { c1: { correct: true, tries: 2, at: "" } },
        sections: { [s.id]: { scrolledToEnd: true } },
      })
    ).toBe(true);
  });

  it("a video needs 90% watched; Do sections need their own done; a short answer a sentence", () => {
    const v = section("core", { body: { type: "video", youtubeId: "x" } });
    expect(sectionDone(v, { sections: { [v.id]: { watchPercent: 89 } } })).toBe(false);
    expect(sectionDone(v, { sections: { [v.id]: { watchPercent: 90 } } })).toBe(true);
    const cards = section("core", {
      body: { type: "flashcards", cards: [{ id: "k", front: "a", back: "b" }] },
    });
    expect(sectionDone(cards, {})).toBe(false);
    expect(sectionDone(cards, { sections: { [cards.id]: { completed: true } } })).toBe(true);
    const ext = section("extension", { shortAnswerPrompt: "Why?" });
    const read = { sections: { [ext.id]: { scrolledToEnd: true } } };
    expect(sectionDone(ext, { ...read, shortAnswers: { [ext.id]: "Too short" } })).toBe(false);
    expect(
      sectionDone(ext, { ...read, shortAnswers: { [ext.id]: "Because the 2 multiplies O and H." } })
    ).toBe(true);
  });

  it("a row is done when every served section is; a deleted section doesn't strand it", () => {
    const a = section("core");
    const sections = new Map([[a.id, a]]);
    const progress = { sections: { [a.id]: { scrolledToEnd: true } } };
    expect(rowDone({ optionId: "o", servedSectionIds: [a.id, "gone"] }, sections, progress)).toBe(
      true
    );
    expect(rowDone({ optionId: "o", servedSectionIds: [a.id] }, sections, {})).toBe(false);
    // Nothing built (A5): only the teacher's check-off finishes it.
    expect(rowDone({ optionId: null, servedSectionIds: [] }, sections, progress)).toBe(false);
  });
});

describe("quick checks", () => {
  it("grades a choice by id and a fill-in by any accepted answer, ignoring case and spacing", () => {
    expect(gradeCheck(mc("c"), "b")).toBe(true);
    expect(gradeCheck(mc("c"), "a")).toBe(false);
    const fill: QuickCheck = {
      id: "f",
      kind: "fill_blank",
      prompt: "?",
      answer: ["14", "fourteen"],
    };
    expect(gradeCheck(fill, " Fourteen. ")).toBe(true);
    expect(gradeCheck(fill, "15")).toBe(false);
    expect(gradeCheck(fill, "")).toBe(false);
  });

  it("never sends the key or the explanation to the browser", () => {
    const p = publicCheck(mc("c"));
    expect(p).not.toHaveProperty("answer");
    expect(p).not.toHaveProperty("explanation");
    expect(p.options).toHaveLength(2);
  });

  it("pauses a video for the first unanswered check whose time has come", () => {
    const checks = [
      { ...mc("late"), atSeconds: 90 },
      { ...mc("early"), atSeconds: 30 },
    ];
    expect(dueCheck(checks, {}, 20)).toBeNull();
    expect(dueCheck(checks, {}, 95)?.id).toBe("early");
    expect(
      dueCheck(checks, { checks: { early: { correct: true, tries: 1, at: "" } } }, 95)?.id
    ).toBe("late");
  });

  it("measures a segment's watched share inside its own start and end", () => {
    const watched = new Set([...Array(60).keys()].map((s) => s + 30));
    expect(segmentWatchPercent(watched, 30, 90)).toBe(100);
    expect(segmentWatchPercent(watched, 0, 60)).toBe(50);
  });
});
