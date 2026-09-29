import { describe, expect, it } from "vitest";
import type { BankQuestionRow } from "@/lib/queries/banks";
import { buildPaperDoc, keyFor, paperFileName } from "./model";

const q = (over: Partial<BankQuestionRow>): BankQuestionRow => ({
  id: "q",
  type: "multiple_choice",
  stem: "Which is **not** a base unit?",
  points: 1,
  difficulty: 3,
  bloom: null,
  grading: "auto",
  gradingConfig: null,
  topic: null,
  tags: [],
  explanation: null,
  externalId: null,
  version: 1,
  mediaUrl: null,
  videoUrl: null,
  stimulusRef: null,
  stimulus: null,
  targets: [],
  options: [
    { content: "meter", isCorrect: false, matchText: null, correctPosition: null },
    { content: "newton", isCorrect: true, matchText: null, correctPosition: null },
  ],
  updatedAt: new Date(0),
  ...over,
});

describe("keyFor", () => {
  it("letters for choice types, pairs for matching, sequence for ordering, key text otherwise", () => {
    expect(keyFor(q({}), [])).toBe("B");
    expect(
      keyFor(
        q({
          type: "multiple_select",
          options: [
            { content: "a", isCorrect: true, matchText: null, correctPosition: null },
            { content: "b", isCorrect: false, matchText: null, correctPosition: null },
            { content: "c", isCorrect: true, matchText: null, correctPosition: null },
          ],
        }),
        []
      )
    ).toBe("A, C");
    expect(
      keyFor(
        q({
          type: "matching",
          options: [
            { content: "Na", isCorrect: false, matchText: "sodium", correctPosition: null },
            { content: "K", isCorrect: false, matchText: "potassium", correctPosition: null },
          ],
        }),
        ["potassium", "sodium"]
      )
    ).toBe("A → 2; B → 1");
    expect(
      keyFor(
        q({
          type: "ordering",
          options: [
            { content: "Gas", isCorrect: false, matchText: null, correctPosition: 3 },
            { content: "Solid", isCorrect: false, matchText: null, correctPosition: 1 },
            { content: "Liquid", isCorrect: false, matchText: null, correctPosition: 2 },
          ],
        }),
        []
      )
    ).toBe("B, C, A");
    expect(
      keyFor(
        q({
          type: "numeric",
          options: [],
          gradingConfig: { mode: "exact", answer: 8700, unit: "cm" },
        }),
        []
      )
    ).toBe("8700 cm");
    expect(keyFor(q({ type: "extended_response", options: [] }), [])).toBe("Teacher scored.");
  });
});

describe("buildPaperDoc", () => {
  it("numbers across sections, prints section headers, shuffles matching choices deterministically, and builds the key", () => {
    const questions = new Map<string, BankQuestionRow>([
      ["q1", q({ id: "q1" })],
      [
        "q2",
        q({
          id: "q2",
          type: "matching",
          stem: "Match each symbol.",
          options: [
            { content: "Na", isCorrect: false, matchText: "sodium", correctPosition: null },
            { content: "K", isCorrect: false, matchText: "potassium", correctPosition: null },
            { content: "Fe", isCorrect: false, matchText: "iron", correctPosition: null },
          ],
        }),
      ],
      ["q3", q({ id: "q3", type: "extended_response", stem: "Explain.", options: [], points: 5 })],
    ]);
    const served = [
      { questionId: "q1", sectionId: "s1", learningTargetId: "lt1", points: 1, order: 1 },
      { questionId: "q2", sectionId: "s2", learningTargetId: "lt2", points: 3, order: 2 },
      { questionId: "q3", sectionId: "s2", learningTargetId: "lt2", points: 5, order: 3 },
    ];
    const build = (seed: number) =>
      buildPaperDoc({
        title: "Unit 1 Test",
        courseName: "Physical Science",
        instructions: "Show your work.",
        sections: [
          { id: "s1", title: "LT1", instructions: null },
          { id: "s2", title: "LT2", instructions: "Part two." },
        ],
        served,
        questions,
        targetCodes: new Map([
          ["lt1", "LT1"],
          ["lt2", "LT2"],
        ]),
        includeKey: true,
        version: "B",
        seed,
      });
    const doc = build(3);
    expect(doc).toMatchObject({
      questionCount: 3,
      totalPoints: 9,
      version: "B",
      instructions: "Show your work.",
    });
    expect(doc.blocks.map((b) => b.kind)).toEqual([
      "section",
      "question",
      "section",
      "question",
      "question",
    ]);
    const q1 = doc.blocks[1];
    expect(q1).toMatchObject({
      kind: "question",
      number: 1,
      stem: "Which is not a base unit?",
      targetCode: "LT1",
    });
    const q2 = doc.blocks[3];
    if (q2.kind !== "question") throw new Error("expected question");
    expect(q2.number).toBe(2);
    expect(q2.options.map((o) => o.letter)).toEqual(["A", "B", "C"]);
    expect([...q2.choices].sort()).toEqual(["iron", "potassium", "sodium"]);
    expect(build(3).blocks[3]).toEqual(q2); // same seed, same shuffle
    const q3 = doc.blocks[4];
    expect(q3).toMatchObject({ kind: "question", number: 3, answerLines: 10 });
    expect(doc.key).toHaveLength(3);
    expect(doc.key![0]).toEqual({ number: 1, answer: "B", points: 1 });
    expect(doc.key![2].answer).toBe("Teacher scored.");
    // The matching key agrees with the printed choice numbers.
    const na = q2.choices.indexOf("sodium") + 1;
    expect(doc.key![1].answer.startsWith(`A → ${na}`)).toBe(true);
    expect(
      buildPaperDoc({
        title: "t",
        courseName: null,
        instructions: null,
        sections: [],
        served,
        questions,
        targetCodes: new Map(),
        includeKey: false,
      }).key
    ).toBeNull();
  });
  it("names the file safely", () => {
    expect(paperFileName("Physical Science · Unit 1 Test", "A", "pdf", true)).toBe(
      "Physical-Science-Unit-1-Test-A-KEY.pdf"
    );
    expect(paperFileName("", "B", "docx", false)).toBe("test-B.docx");
  });
});
