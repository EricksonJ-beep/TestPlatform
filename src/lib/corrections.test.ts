import { describe, expect, it } from "vitest";
import {
  correctionIssues,
  correctionsClear,
  correctionsSummary,
  isVerbatimCopy,
  questionsNeedingCorrection,
  sentenceCount,
} from "./corrections";

const items = [
  { questionId: "q1", learningTargetId: "lt1", points: 2, earned: 2 },
  { questionId: "q2", learningTargetId: "lt1", points: 2, earned: 0 },
  { questionId: "q3", learningTargetId: "lt2", points: 3, earned: 1 },
  { questionId: "q4", learningTargetId: "lt2", points: 4, earned: null }, // pending manual grade
  { questionId: "q5", learningTargetId: null, points: 1, earned: 0 },
];

describe("questionsNeedingCorrection", () => {
  it("formative: every missed question, partial credit included, pending excluded", () => {
    expect(
      questionsNeedingCorrection({
        type: "formative",
        items,
        targetPercents: { lt1: 50, lt2: 14 },
        threshold: 80,
      })
    ).toEqual(["q2", "q3", "q5"]);
  });

  it("summative: only missed questions in targets below the threshold", () => {
    expect(
      questionsNeedingCorrection({
        type: "summative",
        items,
        targetPercents: { lt1: 50, lt2: 90 },
        threshold: 80,
      })
    ).toEqual(["q2"]);
  });

  it("summative: an opted-in target counts as retaken; untargeted items never do", () => {
    expect(
      questionsNeedingCorrection({
        type: "summative",
        items,
        targetPercents: { lt1: 100, lt2: 90 },
        threshold: 80,
        optedInTargetIds: ["lt2"],
      })
    ).toEqual(["q3"]);
  });

  it("practice never needs corrections", () => {
    expect(
      questionsNeedingCorrection({ type: "practice", items, targetPercents: {}, threshold: 80 })
    ).toEqual([]);
  });
});

describe("sentenceCount", () => {
  it("counts sentences ended by . ! ? and the trailing one", () => {
    expect(sentenceCount("Osmosis moves water. It goes toward more solute")).toBe(2);
    expect(sentenceCount("Because it does!")).toBe(1);
    expect(sentenceCount("Why? Because. Really.")).toBe(3);
    expect(sentenceCount("3.5 m/s is the speed. Units matter.")).toBe(2);
    expect(sentenceCount("")).toBe(0);
    expect(sentenceCount("ok")).toBe(0);
  });
});

describe("isVerbatimCopy", () => {
  const explanation =
    "Water moves across the membrane toward the higher solute concentration. That is osmosis, and it needs no energy.";
  it("catches the whole explanation and any long sentence of it, ignoring case and punctuation", () => {
    expect(isVerbatimCopy(explanation, explanation)).toBe(true);
    expect(
      isVerbatimCopy(
        "I think: water moves across the membrane toward the higher solute concentration!! So yeah.",
        explanation
      )
    ).toBe(true);
    // an eight-word sentence lifted whole counts as a copy
    expect(isVerbatimCopy("That is osmosis, and it needs no energy.", explanation)).toBe(true);
  });
  it("lets paraphrases and short overlaps through", () => {
    expect(
      isVerbatimCopy(
        "Water goes to where there is more stuff dissolved. The cell doesn't spend energy on it.",
        explanation
      )
    ).toBe(false);
    expect(isVerbatimCopy("Water moves. It moves.", explanation)).toBe(false);
    expect(isVerbatimCopy("anything", null)).toBe(false);
  });
});

describe("correctionIssues", () => {
  const src = { explanation: "The mitochondria make ATP for the cell by cellular respiration." };
  it("requires an answer and two original sentences", () => {
    expect(correctionIssues({ correctAnswer: "", explanation: "" }, src)).toEqual([
      "answer_missing",
      "why_missing",
    ]);
    expect(
      correctionIssues({ correctAnswer: "Mitochondria", explanation: "It makes ATP." }, src)
    ).toEqual(["why_short"]);
    expect(
      correctionIssues(
        {
          correctAnswer: "Mitochondria",
          explanation:
            "The mitochondria make ATP for the cell by cellular respiration. So that is it.",
        },
        src
      )
    ).toEqual(["why_copied"]);
    expect(
      correctionIssues(
        {
          correctAnswer: "Mitochondria",
          explanation:
            "I picked the nucleus but that holds DNA. The mitochondria is where energy gets made.",
        },
        src
      )
    ).toEqual([]);
  });
  it("also rejects a copied option feedback", () => {
    expect(
      correctionIssues(
        {
          correctAnswer: "B",
          explanation: "The nucleus stores DNA, it does not make energy for the cell. Okay then.",
        },
        {
          explanation: null,
          optionFeedback: ["The nucleus stores DNA, it does not make energy for the cell."],
        }
      )
    ).toEqual(["why_copied"]);
  });
});

describe("correctionsSummary", () => {
  const needed = ["q2", "q3", "q5"];
  it("walks needed → submitted → approved, and flags returned", () => {
    expect(correctionsSummary([], [])).toMatchObject({ state: "none", needed: 0 });
    expect(correctionsSummary(needed, [])).toMatchObject({ state: "needed", remaining: 3 });
    expect(
      correctionsSummary(needed, [
        { questionId: "q2", status: "draft" },
        { questionId: "q3", status: "submitted" },
      ])
    ).toMatchObject({ state: "needed", done: 1, remaining: 2 });
    expect(
      correctionsSummary(needed, [
        { questionId: "q2", status: "submitted" },
        { questionId: "q3", status: "submitted" },
        { questionId: "q5", status: "approved" },
      ])
    ).toMatchObject({ state: "submitted", done: 3, remaining: 0 });
    expect(
      correctionsSummary(needed, [
        { questionId: "q2", status: "returned" },
        { questionId: "q3", status: "submitted" },
        { questionId: "q5", status: "approved" },
      ])
    ).toMatchObject({ state: "returned", returned: 1 });
    const approved = correctionsSummary(needed, [
      { questionId: "q2", status: "approved" },
      { questionId: "q3", status: "approved" },
      { questionId: "q5", status: "approved" },
      { questionId: "q9", status: "draft" }, // not needed any more; ignored
    ]);
    expect(approved).toMatchObject({ state: "approved", approved: 3 });
    expect(correctionsClear(approved)).toBe(true);
    expect(correctionsClear(correctionsSummary(needed, []))).toBe(false);
  });
});
