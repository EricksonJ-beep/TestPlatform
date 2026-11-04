/**
 * The practice check's dealer and scoring (docs/relearning-revamp-plan.md, P1–P3, ticket R3):
 * 3 easy · 1 medium · 1 hard across the check, each target an easy question first, at most one
 * true/false, unseen questions first, a short band borrowing from the nearest one, and the first
 * answers scored against the pass mark.
 */
import { describe, expect, it } from "vitest";
import type { QuestionType } from "@/db/types";
import {
  checkable,
  checkBands,
  dealCheck,
  scoreRound,
  type CheckCandidate,
} from "./practice-check";

/** A seeded generator, so a deal is the same every run. */
function rng(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

let n = 0;
function bank(
  target: string,
  counts: { easy?: number; medium?: number; hard?: number },
  type: QuestionType = "multiple_choice"
) {
  const out: CheckCandidate[] = [];
  const add = (difficulty: number, k: number) => {
    for (let i = 0; i < k; i++)
      out.push({ questionId: `q${++n}`, points: 1, difficulty, type, targetIds: [target] });
  };
  add(1, counts.easy ?? 0);
  add(3, counts.medium ?? 0);
  add(5, counts.hard ?? 0);
  return out;
}

const bandsOf = (deal: ReturnType<typeof dealCheck>) => deal.questions.map((q) => q.band);
const count = <T>(xs: T[], x: T) => xs.filter((y) => y === x).length;

describe("checkable (decision 13)", () => {
  it("keeps auto-graded types and leaves out written answers and hotspots", () => {
    expect(checkable({ type: "multiple_choice", grading: "auto" })).toBe(true);
    expect(checkable({ type: "numeric", grading: "auto" })).toBe(true);
    expect(checkable({ type: "matching", grading: "auto" })).toBe(true);
    expect(checkable({ type: "short_answer", grading: "auto" })).toBe(false);
    expect(checkable({ type: "extended_response", grading: "manual" })).toBe(false);
    expect(checkable({ type: "image_hotspot", grading: "auto" })).toBe(false);
    expect(checkable({ type: "multiple_choice", grading: "manual" })).toBe(false);
  });
});

describe("checkBands (decision 11)", () => {
  it("gives one target E E E M H in some order", () => {
    const b = checkBands([{ id: "a", count: 5 }]).get("a")!;
    expect([...b].sort()).toEqual(["easy", "easy", "easy", "hard", "medium"]);
  });
  it("gives every target an easy question first, then medium and hard to the weakest", () => {
    const two = checkBands([
      { id: "weak", count: 3 },
      { id: "strong", count: 2 },
    ]);
    expect(two.get("weak")).toEqual(["easy", "medium", "hard"]);
    expect(two.get("strong")).toEqual(["easy", "easy"]);
    const three = checkBands([
      { id: "a", count: 2 },
      { id: "b", count: 2 },
      { id: "c", count: 1 },
    ]);
    expect(three.get("a")).toEqual(["easy", "medium"]);
    expect(three.get("b")).toEqual(["easy", "hard"]);
    expect(three.get("c")).toEqual(["easy"]);
  });
});

describe("dealCheck (P1)", () => {
  it("deals 5 from one target: 3 easy, 1 medium, 1 hard, served easy → hard", () => {
    const deal = dealCheck({
      targets: [{ id: "lt1", percent: 40 }],
      candidates: bank("lt1", { easy: 10, medium: 10, hard: 10 }),
      seen: new Set(),
      rng: rng(),
    });
    expect(deal.questions).toHaveLength(5);
    expect(bandsOf(deal)).toEqual(["easy", "easy", "easy", "medium", "hard"]);
    expect(deal.thin).toBe(false);
  });

  it("splits 3 + 2 across two targets, each with an easy question", () => {
    const deal = dealCheck({
      targets: [
        { id: "lt2", percent: 90 },
        { id: "lt1", percent: 40 },
      ],
      candidates: [
        ...bank("lt1", { easy: 5, medium: 5, hard: 5 }),
        ...bank("lt2", { easy: 5, medium: 5, hard: 5 }),
      ],
      seen: new Set(),
      rng: rng(3),
    });
    const lt1 = deal.questions.filter((q) => q.learningTargetId === "lt1");
    const lt2 = deal.questions.filter((q) => q.learningTargetId === "lt2");
    expect(lt1).toHaveLength(3);
    expect(lt2).toHaveLength(2);
    expect(lt1.some((q) => q.band === "easy")).toBe(true);
    expect(lt2.some((q) => q.band === "easy")).toBe(true);
    expect(count(bandsOf(deal), "easy")).toBe(3);
  });

  it("serves at most one true/false", () => {
    const deal = dealCheck({
      targets: [{ id: "lt1", percent: 40 }],
      candidates: [
        ...bank("lt1", { easy: 6, medium: 2, hard: 2 }, "true_false"),
        ...bank("lt1", { easy: 3, medium: 2, hard: 2 }),
      ],
      seen: new Set(),
      rng: rng(11),
    });
    expect(deal.questions).toHaveLength(5);
    expect(
      count(
        deal.questions.map((q) => q.type),
        "true_false"
      )
    ).toBeLessThanOrEqual(1);
  });

  it("prefers questions the student hasn't been served in a check", () => {
    const pool = bank("lt1", { easy: 6, medium: 2, hard: 2 });
    const first = dealCheck({
      targets: [{ id: "lt1", percent: 40 }],
      candidates: pool,
      seen: new Set(),
      rng: rng(5),
    });
    const seen = new Set(first.questions.map((q) => q.questionId));
    const second = dealCheck({
      targets: [{ id: "lt1", percent: 40 }],
      candidates: pool,
      seen,
      rng: rng(9),
    });
    expect(second.questions.filter((q) => seen.has(q.questionId))).toEqual([]);
  });

  it("borrows from the nearest band when one runs short, and says the bank is thin", () => {
    const deal = dealCheck({
      targets: [{ id: "lt1", percent: 40 }],
      candidates: bank("lt1", { easy: 1, medium: 6, hard: 1 }),
      seen: new Set(),
      rng: rng(),
    });
    expect(deal.questions).toHaveLength(5);
    expect(deal.thin).toBe(true);
    expect(count(bandsOf(deal), "easy")).toBe(1);
  });

  it("gives a target with no questions' slots to another target of the check", () => {
    const deal = dealCheck({
      targets: [
        { id: "lt1", percent: 40 },
        { id: "lt2", percent: 85 },
      ],
      candidates: bank("lt1", { easy: 6, medium: 3, hard: 3 }),
      seen: new Set(),
      rng: rng(),
    });
    expect(deal.questions).toHaveLength(5);
    expect(deal.questions.every((q) => q.learningTargetId === "lt1")).toBe(true);
    expect(deal.thin).toBe(true);
  });

  it("deals what exists when the banks hold fewer than 5", () => {
    const deal = dealCheck({
      targets: [{ id: "lt1", percent: 40 }],
      candidates: bank("lt1", { easy: 1, medium: 1 }),
      seen: new Set(),
      rng: rng(),
    });
    expect(deal.questions).toHaveLength(2);
    expect(deal.thin).toBe(true);
  });
});

describe("scoreRound (P2–P3)", () => {
  const ids = ["a", "b", "c", "d", "e"];
  it("has no score until every question has its first answer", () => {
    expect(scoreRound(ids, { a: { correct: true } }, 4)).toEqual({
      finished: false,
      score: null,
      passed: false,
      answered: 1,
    });
  });
  it("passes at the pass mark", () => {
    const four = Object.fromEntries(ids.map((id, i) => [id, { correct: i < 4 }]));
    expect(scoreRound(ids, four, 4)).toMatchObject({ finished: true, score: 4, passed: true });
    const three = Object.fromEntries(ids.map((id, i) => [id, { correct: i < 3 }]));
    expect(scoreRound(ids, three, 4)).toMatchObject({ finished: true, score: 3, passed: false });
  });
});
