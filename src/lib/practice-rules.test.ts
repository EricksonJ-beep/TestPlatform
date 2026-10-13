import { describe, expect, it } from "vitest";
import {
  checkActivityCompletion,
  hintUnlocked,
  isClosed,
  markWatched,
  practiceProgress,
  recordCheck,
  recordReveal,
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
  it("interactive pages complete from what the page reported, cleaned up", () => {
    expect(
      checkActivityCompletion({ kind: "interactive", evidence: {}, prompts: null })
    ).toMatchObject({ ok: false, reason: /Finish the activity/ });
    expect(
      checkActivityCompletion({
        kind: "interactive",
        evidence: {
          interactive: {
            activity: "skin-model-labeling",
            total: 10,
            firstTry: 12.4,
            misses: -3,
            seconds: 95.6,
            missedTerms: ["Stratum lucidum", 7 as unknown as string],
          },
        },
        prompts: null,
      })
    ).toEqual({
      ok: true,
      evidence: {
        interactive: {
          activity: "skin-model-labeling",
          total: 10,
          firstTry: 10,
          misses: 0,
          seconds: 96,
          missedTerms: ["Stratum lucidum"],
        },
      },
    });
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

describe("Apps Script–style checking", () => {
  const at = "2026-10-13T00:00:00Z";
  const wrong = { answer: "x", isCorrect: false, pointsEarned: 0, pointsPossible: 1 };
  const right = { answer: "y", isCorrect: true, pointsEarned: 1, pointsPossible: 1 };
  const set = [
    { questionId: "a", sectionId: "s", learningTargetId: null, points: 1, order: 1 },
    { questionId: "b", sectionId: "s", learningTargetId: null, points: 1, order: 2 },
  ];

  it("a miss keeps the question open and counts toward the hint; a right check closes it", () => {
    let a = recordCheck(undefined, wrong, at);
    expect(a).toMatchObject({ misses: 1, closed: false, isCorrect: false });
    expect(isClosed(a)).toBe(false);
    a = recordCheck(a, wrong, at);
    expect(hintUnlocked(a)).toBe(false);
    a = recordCheck(a, wrong, at);
    expect(hintUnlocked(a)).toBe(true);
    a = recordCheck(a, right, at);
    expect(a).toMatchObject({ misses: 3, closed: true, isCorrect: true, answer: "y" });
    // Closed items never change.
    expect(recordCheck(a, wrong, at)).toBe(a);
    expect(recordReveal(a, 1, at)).toBe(a);
  });

  it("reveal closes as not correct, keeps partial points, and works before any check", () => {
    const partial = recordCheck(
      undefined,
      { answer: ["p"], isCorrect: false, pointsEarned: 1, pointsPossible: 2 },
      at
    );
    expect(recordReveal(partial, 2, at)).toMatchObject({
      revealed: true,
      closed: true,
      isCorrect: false,
      pointsEarned: 1,
      misses: 1,
    });
    expect(recordReveal(undefined, 1, at)).toMatchObject({
      answer: null,
      isCorrect: false,
      pointsEarned: 0,
      closed: true,
    });
    expect(recordReveal(undefined, 1, at, true)).toMatchObject({
      isCorrect: null,
      pointsEarned: null,
    });
  });

  it("progress counts only closed items; one-try items saved before retries count as closed", () => {
    const open = recordCheck(undefined, wrong, at);
    expect(practiceProgress(set, { a: open })).toMatchObject({ answered: 0, complete: false });
    const legacy = { ...wrong, answeredAt: at };
    const done = practiceProgress(set, {
      a: legacy,
      b: recordCheck(recordCheck(undefined, wrong, at), right, at),
    });
    expect(done).toMatchObject({ answered: 2, correct: 1, complete: true, percent: 50 });
    const revealed = practiceProgress(set, {
      a: recordReveal(open, 1, at),
      b: recordCheck(undefined, right, at),
    });
    expect(revealed).toMatchObject({ correct: 1, complete: true, percent: 50 });
  });
});
