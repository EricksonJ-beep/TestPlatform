import { describe, expect, it } from "vitest";
import {
  buildQuestionSet,
  dealByDifficulty,
  difficultyBand,
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

  it("a targeted retake of a section with a retake pool deals fresh questions from the pool", () => {
    const retakePool = Array.from({ length: 24 }, (_, i) => ({
      ...pq(`r${i}`),
      difficulty: (i % 5) + 1,
    }));
    const withPool: BuilderSection[] = [
      {
        id: "s4",
        learningTargetId: "LT4",
        sortOrder: 0,
        items: [
          {
            kind: "question",
            id: "i1",
            questionId: "q1",
            points: 1,
            stimulusId: null,
            sortOrder: 0,
          },
          {
            kind: "question",
            id: "i2",
            questionId: "q2",
            points: 1,
            stimulusId: null,
            sortOrder: 1,
          },
        ],
        retake: { poolId: "P4", drawCount: 10, drawStimulusGroups: false, questions: retakePool },
      },
      {
        id: "s1",
        learningTargetId: "LT1",
        sortOrder: 1,
        items: [
          {
            kind: "question",
            id: "i3",
            questionId: "q3",
            points: 1,
            stimulusId: null,
            sortOrder: 0,
          },
        ],
      },
    ];
    // Attempt 1 serves the test's own questions; the retake pool is untouched.
    expect(
      buildQuestionSet(withPool, { randomizeQuestions: false, rng: seededRng(1) }).map(
        (q) => q.questionId
      )
    ).toEqual(["q1", "q2", "q3"]);
    // A retake of LT4: 10 from the pool, none seen before, tagged LT4, nothing from LT1.
    const seen = new Set(["r0", "r1", "r2"]);
    const retake = buildQuestionSet(withPool, {
      randomizeQuestions: false,
      scope: ["LT4"],
      rng: seededRng(2),
      avoidQuestionIds: seen,
    });
    expect(retake).toHaveLength(10);
    expect(retake.every((q) => q.questionId.startsWith("r") && !seen.has(q.questionId))).toBe(true);
    expect(retake.every((q) => q.learningTargetId === "LT4" && q.sectionId === "s4")).toBe(true);
    // A retake of LT1 (no retake pool) repeats its section.
    expect(
      buildQuestionSet(withPool, { randomizeQuestions: false, scope: ["LT1"] }).map(
        (q) => q.questionId
      )
    ).toEqual(["q3"]);
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

describe("dealByDifficulty", () => {
  // A 50-question bank: 15 easy (1–2), 20 medium (3), 15 hard (4–5).
  const bank = [
    ...Array.from({ length: 15 }, (_, i) => ({ ...pq(`e${i}`), difficulty: 1 + (i % 2) })),
    ...Array.from({ length: 20 }, (_, i) => ({ ...pq(`m${i}`), difficulty: 3 })),
    ...Array.from({ length: 15 }, (_, i) => ({ ...pq(`h${i}`), difficulty: 4 + (i % 2) })),
  ];
  const diff = new Map(bank.map((q) => [q.questionId, q.difficulty]));
  const bands = (ids: string[]) => ids.map((id) => difficultyBand(diff.get(id)!));

  it("deals 3 easy, 4 medium, 3 hard out of 10, in that order, every time", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ids = dealByDifficulty(bank, 10, {
        drawStimulusGroups: false,
        rng: seededRng(seed),
      }).map((q) => q.questionId);
      expect(new Set(ids).size).toBe(10);
      expect(bands(ids)).toEqual([
        ...Array(3).fill("easy"),
        ...Array(4).fill("medium"),
        ...Array(3).fill("hard"),
      ]);
    }
  });

  it("prefers questions not seen before, in every band", () => {
    const seen = new Set(["e0", "e1", "e2", "m0", "h0"]);
    const ids = dealByDifficulty(bank, 10, {
      drawStimulusGroups: false,
      rng: seededRng(3),
      avoid: seen,
    }).map((q) => q.questionId);
    expect(ids.filter((id) => seen.has(id))).toEqual([]);
  });

  it("fills a short band from the others; an all-medium bank still deals the full count", () => {
    const noEasy = bank.filter((q) => q.difficulty > 2);
    const ids = dealByDifficulty(noEasy, 10, {
      drawStimulusGroups: false,
      rng: seededRng(5),
    }).map((q) => q.questionId);
    expect(new Set(ids).size).toBe(10);
    expect(bands(ids).includes("easy")).toBe(false);
    const flat = Array.from({ length: 12 }, (_, i) => ({ ...pq(`x${i}`), difficulty: 3 }));
    expect(
      dealByDifficulty(flat, 10, { drawStimulusGroups: false, rng: seededRng(1) })
    ).toHaveLength(10);
    expect(
      dealByDifficulty(flat, 20, { drawStimulusGroups: false, rng: seededRng(1) })
    ).toHaveLength(12);
  });
});
