import { describe, expect, it } from "vitest";
import {
  buildQuestionSet,
  dealByDifficulty,
  difficultyBand,
  drawFromPool,
  mirrorFromRetakeBank,
  nominalPoints,
  seededRng,
  type BuilderSection,
  type PoolQuestion,
  type RetakeQuestion,
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

describe("retake bank (Jon, Oct 19 2026)", () => {
  const rq = (id: string, points: number, difficulty: number): RetakeQuestion => ({
    questionId: id,
    points,
    difficulty,
    stimulusId: null,
    targetIds: [],
  });
  const slot = (id: string, points: number, difficulty: number) => ({
    questionId: id,
    points,
    difficulty,
    stimulusId: null,
  });

  it("fills every slot with a bank question at the same points and band, in the section's order", () => {
    const out = mirrorFromRetakeBank(
      [slot("o1", 1, 1), slot("o2", 4, 3), slot("o3", 1, 5)],
      [rq("h1", 1, 5), rq("e1", 1, 2), rq("m4", 4, 3), rq("m1", 1, 3)],
      { rng: seededRng(2) }
    );
    expect(out.map((q) => [q.questionId, q.points, q.fromBank])).toEqual([
      ["e1", 1, true],
      ["m4", 4, true],
      ["h1", 1, true],
    ]);
  });

  it("takes the closest band when its own is empty, and unseen questions before seen ones", () => {
    const out = mirrorFromRetakeBank(
      [slot("o1", 1, 1)],
      [rq("hard", 1, 5), rq("med-seen", 1, 3), rq("med", 1, 3)],
      { rng: seededRng(1), avoid: new Set(["med-seen"]) }
    );
    expect(out[0].questionId).toBe("med");
  });

  it("never changes points: a slot keeps its original question when the bank has nothing at that value", () => {
    const out = mirrorFromRetakeBank([slot("o1", 4, 3), slot("o2", 1, 3)], [rq("b1", 1, 3)], {
      rng: seededRng(3),
    });
    expect(out.map((q) => [q.questionId, q.points, q.fromBank])).toEqual([
      ["o1", 4, false],
      ["b1", 1, true],
    ]);
  });

  it("a targeted retake serves the section from its bank; attempt 1 and sections without a bank are unchanged", () => {
    const sections: BuilderSection[] = [
      {
        id: "s1",
        learningTargetId: "LT1",
        sortOrder: 0,
        items: [
          {
            kind: "question",
            id: "i1",
            questionId: "q1",
            points: 1,
            stimulusId: null,
            sortOrder: 0,
            difficulty: 2,
          },
          {
            kind: "question",
            id: "i2",
            questionId: "q2",
            points: 2,
            stimulusId: null,
            sortOrder: 1,
            difficulty: 4,
          },
        ],
        retakePool: [rq("r1", 1, 2), rq("r2", 2, 4), rq("r3", 1, 1)],
      },
      {
        id: "s2",
        learningTargetId: "LT2",
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
    const first = buildQuestionSet(sections, { randomizeQuestions: false, rng: seededRng(4) });
    expect(first.map((q) => q.questionId)).toEqual(["q1", "q2", "q3"]);
    const retake = buildQuestionSet(sections, {
      randomizeQuestions: false,
      scope: ["LT1", "LT2"],
      rng: seededRng(4),
      avoidQuestionIds: new Set(["q1", "q2", "q3"]),
    });
    expect(retake.map((q) => [q.questionId, q.points, q.learningTargetId])).toEqual([
      ["r1", 1, "LT1"],
      ["r2", 2, "LT1"],
      ["q3", 1, "LT2"],
    ]);
  });
});
