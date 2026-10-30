/**
 * The student's read-only review of a finished practice test (Jon, Oct 30 2026): each question
 * with their answer, the correct answer, and the explanation, once results are released.
 * Practice tests only: formatives and summatives keep their keys hidden for corrections and retakes.
 * Pure: the page passes the teacher review in and hands only these strings to the browser.
 */
import { answerToText, correctAnswerText } from "@/lib/grading";
import type { ReviewItem } from "@/lib/queries/results";
import type { StimulusInfo } from "@/lib/stimulus-groups";

export type StudentReviewBlock = "not_practice" | "in_progress" | "not_released";

/** Why the student can't review this attempt yet, or null when they can. */
export function studentReviewBlock(input: {
  type: "practice" | "formative" | "summative";
  resultsReleased: boolean;
  status: "in_progress" | "submitted" | "graded";
}): StudentReviewBlock | null {
  if (input.type !== "practice") return "not_practice";
  if (input.status === "in_progress") return "in_progress";
  if (!input.resultsReleased) return "not_released";
  return null;
}

export type StudentReviewResult = "correct" | "partial" | "incorrect" | "pending";

export type StudentReviewItem = {
  order: number;
  questionId: string;
  stem: string;
  mediaUrl: string | null;
  stimulus: StimulusInfo | null;
  target: { code: string; title: string } | null;
  points: number;
  /** Null while a written answer waits for the teacher. */
  earned: number | null;
  result: StudentReviewResult;
  studentAnswer: string;
  /** Null when there is no single key (a written answer the teacher grades). */
  correctAnswer: string | null;
  explanation: string | null;
  teacherNote: string | null;
};

/** Rule: no option flags, grading config, or corrections leave the server; only display text. */
export function toStudentReviewItems(items: ReviewItem[]): StudentReviewItem[] {
  return items.map((item) => {
    const r = item.response;
    const gradable = {
      id: item.questionId,
      type: item.type,
      points: item.points,
      grading: item.grading,
      gradingConfig: item.gradingConfig,
      options: item.options,
    };
    // A blank answer has no response row and earns nothing.
    const earned = r ? (r.manualScore ?? r.autoScore) : 0;
    const answered = answerToText(gradable, r?.answer ?? null);
    return {
      order: item.order,
      questionId: item.questionId,
      stem: item.stem,
      mediaUrl: item.mediaUrl,
      stimulus: item.stimulus,
      target: item.target,
      points: item.points,
      earned,
      result:
        earned === null
          ? "pending"
          : earned >= item.points
            ? "correct"
            : earned > 0
              ? "partial"
              : "incorrect",
      studentAnswer: answered === "—" ? "No answer" : answered,
      correctAnswer: correctAnswerText(gradable),
      explanation: item.explanation,
      teacherNote: r?.graderNote ?? null,
    };
  });
}
