import { describe, expect, it } from "vitest";
import {
  checkActivityCompletion,
  markWatched,
  practiceProgress,
  watchPercent,
} from "./practice-rules";

describe("checkActivityCompletion", () => {
  it("video needs 90% watched", () => {
    expect(
      checkActivityCompletion({ kind: "video", evidence: { watchPercent: 89.9 }, prompts: null })
    ).toMatchObject({ ok: false });
    expect(
      checkActivityCompletion({ kind: "video", evidence: { watchPercent: 90 }, prompts: null })
    ).toEqual({ ok: true, evidence: { watchPercent: 90 } });
    expect(checkActivityCompletion({ kind: "video", evidence: {}, prompts: null })).toMatchObject({
      ok: false,
    });
  });
  it("reading needs scrolled to end and confirmed; link needs confirmed", () => {
    expect(
      checkActivityCompletion({ kind: "reading", evidence: { confirmed: true }, prompts: null })
    ).toMatchObject({ ok: false, reason: /Scroll/ });
    expect(
      checkActivityCompletion({ kind: "reading", evidence: { scrolledToEnd: true }, prompts: null })
    ).toMatchObject({ ok: false, reason: /finished/ });
    expect(
      checkActivityCompletion({
        kind: "reading",
        evidence: { scrolledToEnd: true, confirmed: true },
        prompts: null,
      })
    ).toMatchObject({ ok: true });
    expect(checkActivityCompletion({ kind: "link", evidence: {}, prompts: null })).toMatchObject({
      ok: false,
    });
    expect(
      checkActivityCompletion({ kind: "link", evidence: { confirmed: true }, prompts: null })
    ).toMatchObject({ ok: true });
  });
  it("guided notes need every prompt answered and keep only known prompts", () => {
    const prompts = [
      { id: "p1", prompt: "One" },
      { id: "p2", prompt: "Two" },
    ];
    expect(
      checkActivityCompletion({ kind: "guided_notes", evidence: { answers: { p1: "x" } }, prompts })
    ).toMatchObject({ ok: false, reason: /1 is blank/ });
    expect(
      checkActivityCompletion({
        kind: "guided_notes",
        evidence: { answers: { p1: " a ", p2: "b", junk: "c" } },
        prompts,
      })
    ).toEqual({ ok: true, evidence: { answers: { p1: "a", p2: "b" } } });
  });
  it("worksheets never complete from the browser", () => {
    expect(
      checkActivityCompletion({ kind: "worksheet", evidence: { confirmed: true }, prompts: null })
    ).toMatchObject({ ok: false });
  });
});

describe("practiceProgress", () => {
  const set = [
    { questionId: "a", sectionId: "s", learningTargetId: null, points: 1, order: 1 },
    { questionId: "b", sectionId: "s", learningTargetId: null, points: 2, order: 2 },
    { questionId: "c", sectionId: "s", learningTargetId: null, points: 1, order: 3 },
  ];
  const at = "2026-09-28T00:00:00Z";
  it("counts answered items; complete only when all are answered; manual items carry no points", () => {
    expect(practiceProgress(set, {})).toMatchObject({
      answered: 0,
      complete: false,
      percent: null,
    });
    const partial = practiceProgress(set, {
      a: { answer: null, isCorrect: true, pointsEarned: 1, pointsPossible: 1, answeredAt: at },
      b: { answer: null, isCorrect: false, pointsEarned: 0, pointsPossible: 2, answeredAt: at },
    });
    expect(partial).toMatchObject({ answered: 2, total: 3, complete: false, percent: 33.3 });
    const done = practiceProgress(set, {
      a: { answer: null, isCorrect: true, pointsEarned: 1, pointsPossible: 1, answeredAt: at },
      b: { answer: null, isCorrect: false, pointsEarned: 0, pointsPossible: 2, answeredAt: at },
      c: { answer: null, isCorrect: null, pointsEarned: null, pointsPossible: 1, answeredAt: at },
    });
    expect(done).toMatchObject({
      answered: 3,
      complete: true,
      score: 1,
      maxScore: 3,
      percent: 33.3,
    });
  });
});

describe("watch tracking", () => {
  it("counts contiguous seconds and ignores seeks", () => {
    let w = new Set<number>();
    w = markWatched(w, 0, 1);
    w = markWatched(w, 1, 2);
    w = markWatched(w, 2, 50); // seek forward: not watched
    w = markWatched(w, 50, 51);
    expect([...w].sort((a, b) => a - b)).toEqual([0, 1, 2, 50, 51]);
    expect(watchPercent(w, 10)).toBe(30);
    expect(watchPercent(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]), 10)).toBe(90);
  });
});
