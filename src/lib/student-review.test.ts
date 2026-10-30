import { describe, expect, it } from "vitest";
import type { ReviewItem } from "@/lib/queries/results";
import { studentReviewBlock, toStudentReviewItems } from "./student-review";

const opt = (id: string, content: string, isCorrect: boolean) => ({
  id,
  content,
  isCorrect,
  matchText: null,
  correctPosition: null,
});

const base: Omit<ReviewItem, "order" | "questionId" | "response"> = {
  type: "multiple_choice",
  stem: "Which organelle makes ATP?",
  points: 2,
  grading: "auto",
  gradingConfig: null,
  explanation: "Cellular respiration happens in the mitochondria.",
  mediaUrl: null,
  stimulus: null,
  options: [opt("a", "Nucleus", false), opt("b", "Mitochondria", true)],
  target: { code: "LT1", title: "Cell parts" },
  correction: null,
};

const response = (answer: ReviewItem["response"] extends infer R ? R : never) => answer;

describe("studentReviewBlock", () => {
  it("practice tests only: formatives and summatives keep their keys", () => {
    for (const type of ["formative", "summative"] as const)
      expect(studentReviewBlock({ type, resultsReleased: true, status: "graded" })).toBe(
        "not_practice"
      );
  });
  it("waits for submit, then for released results", () => {
    expect(
      studentReviewBlock({ type: "practice", resultsReleased: true, status: "in_progress" })
    ).toBe("in_progress");
    expect(studentReviewBlock({ type: "practice", resultsReleased: false, status: "graded" })).toBe(
      "not_released"
    );
    expect(studentReviewBlock({ type: "practice", resultsReleased: true, status: "graded" })).toBe(
      null
    );
    // Written answers still waiting to be graded don't hold the rest back.
    expect(
      studentReviewBlock({ type: "practice", resultsReleased: true, status: "submitted" })
    ).toBe(null);
  });
});

describe("toStudentReviewItems", () => {
  const items: ReviewItem[] = [
    {
      ...base,
      order: 1,
      questionId: "q1",
      response: response({
        answer: { kind: "choice", optionId: "a" },
        autoScore: 0,
        manualScore: null,
        isCorrect: false,
        flagged: false,
        graderNote: null,
        gradedAt: null,
      }),
    },
    {
      ...base,
      order: 2,
      questionId: "q2",
      response: response({
        answer: { kind: "choice", optionId: "b" },
        autoScore: 2,
        manualScore: null,
        isCorrect: true,
        flagged: false,
        graderNote: null,
        gradedAt: null,
      }),
    },
    { ...base, order: 3, questionId: "q3", response: null },
    {
      ...base,
      order: 4,
      questionId: "q4",
      type: "extended_response",
      grading: "manual",
      options: [],
      explanation: null,
      response: response({
        answer: { kind: "text", text: "Diffusion moves particles down a gradient." },
        autoScore: null,
        manualScore: null,
        isCorrect: null,
        flagged: false,
        graderNote: null,
        gradedAt: null,
      }),
    },
    {
      ...base,
      order: 5,
      questionId: "q5",
      response: response({
        answer: { kind: "choice", optionId: "a" },
        autoScore: 0,
        manualScore: 1,
        isCorrect: false,
        flagged: false,
        graderNote: "Half credit: you explained it well.",
        gradedAt: null,
      }),
    },
  ];
  const out = toStudentReviewItems(items);

  it("shows their answer, the correct answer, and the explanation", () => {
    expect(out[0]).toMatchObject({
      result: "incorrect",
      earned: 0,
      studentAnswer: "Nucleus",
      correctAnswer: "Mitochondria",
      explanation: "Cellular respiration happens in the mitochondria.",
    });
    expect(out[1]).toMatchObject({ result: "correct", earned: 2, studentAnswer: "Mitochondria" });
  });

  it("a blank counts as missed; a written answer waits for the teacher", () => {
    expect(out[2]).toMatchObject({ result: "incorrect", earned: 0, studentAnswer: "No answer" });
    expect(out[3]).toMatchObject({ result: "pending", earned: null, correctAnswer: null });
  });

  it("the teacher's score and note win over the auto score", () => {
    expect(out[4]).toMatchObject({
      result: "partial",
      earned: 1,
      teacherNote: "Half credit: you explained it well.",
    });
  });

  it("carries no option flags or grading config to the browser", () => {
    for (const item of out) {
      expect(item).not.toHaveProperty("options");
      expect(item).not.toHaveProperty("gradingConfig");
      expect(JSON.stringify(item)).not.toContain("isCorrect");
    }
  });
});
