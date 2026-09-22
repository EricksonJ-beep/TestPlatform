/**
 * Shapes the grading engine works with. Deliberately decoupled from Drizzle
 * rows so the engine stays pure and testable.
 */
import type { QuestionType } from "@/db/types";

export type GradableOption = {
  id: string;
  content: string;
  isCorrect: boolean;
  matchText: string | null;
  correctPosition: number | null;
};

export type GradableQuestion = {
  id: string;
  type: QuestionType;
  points: number;
  grading: "auto" | "manual";
  gradingConfig: unknown;
  options: GradableOption[];
};

/** What a student submits, by type. Unknown/blank answers grade as wrong (PLAN.md: blank counts as wrong). */
export type Answer =
  | { kind: "choice"; optionId: string | null } // multiple_choice, true_false
  | { kind: "multi"; optionIds: string[] } // multiple_select
  | { kind: "text"; text: string } // fill_blank, short_answer, extended_response, numeric
  | { kind: "match"; pairs: Record<string, string> } // matching: left option id → chosen right text
  | { kind: "order"; optionIds: string[] } // ordering: option ids in the student's order
  | null;

export type GradeResult = {
  pointsPossible: number;
  /** null when a human must grade it (manual short answer, extended response). */
  pointsEarned: number | null;
  /** true/false for auto-graded; null when pending manual grading. */
  isCorrect: boolean | null;
  /** Per-option or per-pair detail for review screens. */
  detail?: Record<string, boolean>;
  /** Why an auto-grade came out the way it did, for the corrections form's hint. */
  note?: string;
};

export type ServedItem = {
  questionId: string;
  sectionId: string;
  learningTargetId: string | null;
  points: number;
  order: number;
};

export type ResponseRecord = {
  questionId: string;
  answer: Answer;
  autoScore: number | null;
  manualScore: number | null;
};

export type TargetScore = {
  learningTargetId: string;
  pointsEarned: number;
  pointsPossible: number;
  percent: number;
};

export type AttemptScore = {
  totalEarned: number;
  totalPossible: number;
  percent: number;
  perTarget: TargetScore[];
  /** Questions still waiting on a human grade; the attempt is "submitted", not "graded", while > 0. */
  pendingManual: number;
};
