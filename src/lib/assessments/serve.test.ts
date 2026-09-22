import { describe, expect, it } from "vitest";
import {
  buildQuestionSet,
  drawFromPool,
  nominalPoints,
  seededRng,
  type BuilderSection,
  type PoolQuestion,
} from "./serve";

const pq = (id: string, stim: string | null = null, points = 1): PoolQuestion => ({
  questionId: id,
  points,
  stimulusId: stim,
  targetIds: [],
});

describe("drawFromPool", () => {
  const pool = [pq("a"), pq("b", "G"), pq("c", "G"), pq("d"), pq("e", "G"), pq("f")];

  it("draws exactly N distinct questions, deterministic with a seed", () => {
    const one = drawFromPool(pool, 3, { drawStimulusGroups: false, rng: seededRng(7) });
    const two = drawFromPool(pool, 3, { drawStimulusGroups: false, rng: seededRng(7) });
    expect(one.map((q) => q.questionId)).toEqual(two.map((q) => q.questionId));
    expect(new Set(one.map((q) => q.questionId)).size).toBe(3);
  });

  it("pulls a whole stimulus group when enabled, and never splits it", () => {
    for (let seed = 1; seed < 30; seed++) {
      const drawn = drawFromPool(pool, 2, { drawStimulusGroups: true, rng: seededRng(seed) });
      const g = drawn.filter((q) => q.stimulusId === "G").length;
      expect([0, 3]).toContain(g);
      expect(drawn.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("prefers questions the student has not seen", () => {
    const drawn = drawFromPool(pool, 2, {
      drawStimulusGroups: false,
      rng: seededRng(3),
      avoid: new Set(["a", "b", "c", "d"]),
    });
    expect(drawn.map((q) => q.questionId).sort()).toEqual(["e", "f"]);
  });

  it("caps at the pool size", () => {
    expect(drawFromPool(pool, 50, { drawStimulusGroups: false, rng: seededRng(1) })).toHaveLength(
      6
    );
  });
});

describe("buildQuestionSet", () => {
  const sections: BuilderSection[] = [
    {
      id: "s1",
      learningTargetId: "LT1",
      sortOrder: 0,
      items: [
        { kind: "question", id: "i1", questionId: "q1", points: 2, stimulusId: null, sortOrder: 0 },
        { kind: "question", id: "i2", questionId: "q2", points: 2, stimulusId: "S", sortOrder: 1 },
        { kind: "question", id: "i3", questionId: "q3", points: 2, stimulusId: null, sortOrder: 2 },
        { kind: "question", id: "i4", questionId: "q4", points: 2, stimulusId: "S", sortOrder: 3 },
      ],
    },
    {
      id: "s2",
      learningTargetId: "LT4",
      sortOrder: 1,
      items: [
        {
          kind: "pool",
          id: "i5",
          poolId: "p",
          drawCount: 2,
          drawStimulusGroups: false,
          questions: [pq("p1"), pq("p2"), pq("p3"), pq("q1")],
          sortOrder: 0,
        },
      ],
    },
  ];

  it("keeps section order, numbers items, tags each with its section's target, keeps stimulus groups contiguous", () => {
    const set = buildQuestionSet(sections, { randomizeQuestions: false, rng: seededRng(5) });
    expect(set.map((q) => q.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(set.slice(0, 4).map((q) => q.questionId)).toEqual(["q1", "q2", "q4", "q3"]);
    expect(set.slice(0, 4).every((q) => q.learningTargetId === "LT1" && q.sectionId === "s1")).toBe(
      true
    );
    expect(set.slice(4).every((q) => q.learningTargetId === "LT4")).toBe(true);
  });

  it("a pool draw never repeats a question already served by a fixed item", () => {
    for (let seed = 1; seed < 40; seed++) {
      const set = buildQuestionSet(sections, { randomizeQuestions: true, rng: seededRng(seed) });
      const ids = set.map((q) => q.questionId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("scope serves only the named targets' sections (a targeted retake)", () => {
    const set = buildQuestionSet(sections, {
      randomizeQuestions: false,
      rng: seededRng(1),
      scope: ["LT4"],
    });
    expect(set).toHaveLength(2);
    expect(set.every((q) => q.sectionId === "s2")).toBe(true);
  });

  it("randomization shuffles within a section but still groups stimuli", () => {
    const set = buildQuestionSet(sections, { randomizeQuestions: true, rng: seededRng(11) });
    const first = set.slice(0, 4).map((q) => q.questionId);
    const i2 = first.indexOf("q2");
    const i4 = first.indexOf("q4");
    expect(Math.abs(i2 - i4)).toBe(1);
  });

  it("nominal points count fixed items and expected pool draws", () => {
    expect(nominalPoints(sections)).toBe(10);
  });
});
