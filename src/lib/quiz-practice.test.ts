import { describe, expect, it } from "vitest";
import {
  practiceOwed,
  practiceOwedText,
  practiceSizeText,
  quizPracticeNeeds,
  targetList,
  type PracticeResult,
  type PracticeTargetInfo,
  type QuizPracticeData,
} from "./quiz-practice";

const quizAt = new Date("2026-10-13T15:00:00Z");
const later = (h: number) => new Date(quizAt.getTime() + h * 3_600_000);

const target = (id: string, p: Partial<PracticeTargetInfo> = {}): PracticeTargetInfo => ({
  id,
  code: `U2.${id.toUpperCase()}`,
  title: id,
  sortOrder: Number(id.replace(/\D/g, "")),
  hasSet: false,
  openQuestions: 10,
  ...p,
});
const built = (byTarget: PracticeResult["byTarget"], completedAt = later(1)): PracticeResult => ({
  completedAt,
  practiceSetId: null,
  setTargetIds: [],
  served: 10,
  byTarget,
  percent: null,
  creditedTargetIds: null,
});
const onSet = (
  setTargetIds: string[],
  byTarget: PracticeResult["byTarget"],
  p: Partial<PracticeResult> = {}
): PracticeResult => ({
  completedAt: later(1),
  practiceSetId: "set",
  setTargetIds,
  served: 10,
  byTarget,
  percent: null,
  creditedTargetIds: null,
  ...p,
});
const data = (practice: PracticeResult[], d: Partial<QuizPracticeData> = {}): QuizPracticeData => ({
  latest: { submittedAt: quizAt, targetPercents: { lt1: 40, lt2: 60, lt3: 90 } },
  targets: [target("lt3"), target("lt2"), target("lt1")],
  practice,
  ...d,
});
const needs = (d: QuizPracticeData, more: Partial<Parameters<typeof quizPracticeNeeds>[0]> = {}) =>
  quizPracticeNeeds({ type: "formative", rule: "gate", threshold: 80, data: d, ...more });

describe("quizPracticeNeeds (Jon, Oct 14 2026, decisions 5–6)", () => {
  it("lists every target under the threshold on the latest attempt, in course order", () => {
    const owed = { best: null, done: false, minQuestions: 5 };
    expect(needs(data([]))).toEqual([
      { targetId: "lt1", code: "U2.LT1", title: "lt1", scored: 40, ...owed },
      { targetId: "lt2", code: "U2.LT2", title: "lt2", scored: 60, ...owed },
    ]);
    // The assignment's threshold decides what was missed.
    expect(needs(data([]), { threshold: 50 }).map((t) => t.targetId)).toEqual(["lt1"]);
  });

  it("a built practice counts with 5+ questions on the target at 80%+, finished after the quiz", () => {
    const at80 = built({ lt1: { questions: 5, earned: 4, possible: 5 } });
    expect(needs(data([at80]))[0]).toMatchObject({ targetId: "lt1", best: 80, done: true });
    const at60 = built({ lt1: { questions: 5, earned: 3, possible: 5 } });
    expect(needs(data([at60]))[0]).toMatchObject({ best: 60, done: false });
    const short = built({ lt1: { questions: 4, earned: 4, possible: 4 } });
    expect(needs(data([short]))[0]).toMatchObject({ best: null, done: false });
    const before = built({ lt1: { questions: 5, earned: 5, possible: 5 } }, later(-1));
    expect(needs(data([before]))[0]).toMatchObject({ best: null, done: false });
    // Each target is scored on its own questions: a mixed practice can clear one and not the other.
    const mixed = built({
      lt1: { questions: 5, earned: 5, possible: 5 },
      lt2: { questions: 5, earned: 2, possible: 5 },
    });
    expect(needs(data([mixed])).map((t) => [t.targetId, t.done])).toEqual([
      ["lt1", true],
      ["lt2", false],
    ]);
    // Best of several; unlimited tries.
    expect(needs(data([at60, at80]))[0]).toMatchObject({ best: 80, done: true });
  });

  it("a short open bank lowers the built minimum to what it holds, so it never blocks for good", () => {
    const three = built({ lt1: { questions: 3, earned: 3, possible: 3 } });
    const d = data([three], { targets: [target("lt1", { openQuestions: 3 }), target("lt2")] });
    expect(needs(d)[0]).toMatchObject({ targetId: "lt1", done: true, minQuestions: 3 });
    // Only a teacher's set covers it: no built minimum to name.
    const setOnly = data([], { targets: [target("lt1", { hasSet: true, openQuestions: 0 })] });
    expect(needs(setOnly)[0]).toMatchObject({ targetId: "lt1", minQuestions: null });
  });

  it("says how much practice counts, where the student picks it (review, Oct 14 2026)", () => {
    expect(practiceSizeText(5)).toBe("on at least 5 questions on it");
    expect(practiceSizeText(3)).toBe("on all 3 of its practice questions");
    expect(practiceSizeText(1)).toBe("on its one practice question");
    expect(practiceSizeText(null)).toBe("on a practice");
  });

  it("a teacher's practice set tagged to the target counts at any size", () => {
    const two = onSet(["lt1"], { lt1: { questions: 2, earned: 2, possible: 2 } });
    expect(needs(data([two]))[0]).toMatchObject({ targetId: "lt1", best: 100, done: true });
    // Not tagged to the target: it doesn't count, whatever it served.
    const untagged = onSet(["lt3"], { lt1: { questions: 6, earned: 6, possible: 6 } });
    expect(needs(data([untagged]))[0]).toMatchObject({ best: null, done: false });
    // A worksheet set has no Bloom questions: its score and credited targets decide.
    const sheet = (percent: number, credited: string[] | null) =>
      onSet(["lt1", "lt2"], {}, { served: 0, percent, creditedTargetIds: credited });
    expect(needs(data([sheet(85, null)])).every((t) => t.done)).toBe(true);
    expect(needs(data([sheet(85, ["lt2"])])).map((t) => t.done)).toEqual([false, true]);
    expect(needs(data([sheet(70, null)])).some((t) => t.done)).toBe(false);
  });

  it("a teacher's bank or pool set counts only on the target's own questions (review, Oct 14)", () => {
    // Viola's deal from "Unit 2 review" (tagged LT1–LT4) held no LT1 question, or only written
    // ones, which practice never grades: 90% on the rest doesn't clear LT1.
    const noLt1 = onSet(
      ["lt1", "lt2", "lt3", "lt4"],
      {
        lt2: { questions: 5, earned: 5, possible: 5 },
        lt3: { questions: 5, earned: 4, possible: 5 },
      },
      { percent: 90 }
    );
    expect(needs(data([noLt1])).map((t) => [t.targetId, t.best, t.done])).toEqual([
      ["lt1", null, false],
      ["lt2", 100, true],
    ]);
    const writtenOnly = onSet(
      ["lt1"],
      { lt1: { questions: 2, earned: 0, possible: 0 } },
      { percent: 90 }
    );
    expect(needs(data([writtenOnly]))[0]).toMatchObject({
      targetId: "lt1",
      best: null,
      done: false,
    });
  });

  it("a target with no practice content doesn't block", () => {
    const d = data([], {
      targets: [
        target("lt1", { openQuestions: 0 }),
        target("lt2", { hasSet: true, openQuestions: 0 }),
      ],
    });
    expect(needs(d).map((t) => t.targetId)).toEqual(["lt2"]);
  });

  it("only formatives with a retake to unlock: not to_full, not summatives, not before an attempt", () => {
    expect(needs(data([]), { rule: "to_full" })).toEqual([]);
    expect(needs(data([]), { type: "summative" })).toEqual([]);
    expect(needs(data([], { latest: null }))).toEqual([]);
    expect(needs(data([]), { data: null })).toEqual([]);
    // CVTC courses too (rule "none").
    expect(needs(data([]), { rule: "none" })).toHaveLength(2);
    // Untagged questions make no targets.
    expect(needs(data([], { latest: { submittedAt: quizAt, targetPercents: {} } }))).toEqual([]);
  });

  it("says which targets are owed, in the student's words", () => {
    const owed = practiceOwed(needs(data([])));
    expect(owed.map((t) => t.code)).toEqual(["U2.LT1", "U2.LT2"]);
    expect(practiceOwedText(owed)).toBe(
      "Practice U2.LT1 and U2.LT2 first: score 80% or better on a practice for each to unlock your retake."
    );
    expect(practiceOwedText(owed.slice(0, 1))).toMatch(/^Practice U2.LT1 first: .* for it to/);
    expect(targetList(["A", "B", "C"])).toBe("A, B and C");
  });
});
