/**
 * Corrections rules (PLAN.md §4, §5 screen 5; PHASE1 Ticket 1.11). Pure: which
 * questions on a graded attempt need a correction, whether a written correction
 * is complete, and what state a student's corrections set is in. The server
 * actions and queries persist and read; nothing here touches the database.
 */
import type { CorrectionStatus } from "@/db/types";

export type CorrectableItem = {
  questionId: string;
  learningTargetId: string | null;
  points: number;
  /** Points earned (manual score beats auto); null while a human still has to grade it. */
  earned: number | null;
};

/**
 * Rule: corrections are due on every missed question for a formative; on a
 * summative only on missed questions inside the targets being retaken (targets
 * below the threshold on this attempt, plus any the student opted into — Ticket
 * 1.12 supplies those). Practice never needs corrections. A question still
 * waiting for a manual grade is not "missed" yet.
 */
export function questionsNeedingCorrection(input: {
  type: "practice" | "formative" | "summative";
  items: CorrectableItem[];
  /** Percent per learning target on this attempt (attempt_target_scores). */
  targetPercents: Record<string, number>;
  threshold: number;
  /** Extra targets being retaken by choice (optional retakes). */
  optedInTargetIds?: string[];
}): string[] {
  if (input.type === "practice") return [];
  const missed = input.items.filter((i) => i.earned !== null && i.earned < i.points);
  if (input.type === "formative") return missed.map((i) => i.questionId);
  const retaking = new Set(input.optedInTargetIds ?? []);
  for (const [targetId, percent] of Object.entries(input.targetPercents)) {
    if (percent < input.threshold) retaking.add(targetId);
  }
  return missed
    .filter((i) => i.learningTargetId && retaking.has(i.learningTargetId))
    .map((i) => i.questionId);
}

// ---------------------------------------------------------------------------
// One correction
// ---------------------------------------------------------------------------

export type CorrectionDraft = { correctAnswer: string; explanation: string };

export type CorrectionIssue = "answer_missing" | "why_missing" | "why_short" | "why_copied";

export const ISSUE_TEXT: Record<CorrectionIssue, string> = {
  answer_missing: "Write the correct answer.",
  why_missing: "Explain why it's correct in your own words.",
  why_short: "Write at least two sentences.",
  why_copied: "That's copied word for word. Say it your own way.",
};

/** Number of sentences: runs of text ended by . ! ? (or the end), ignoring fragments under three characters. */
export function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^\p{L}\p{N}]/gu, "").length >= 3).length;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Rule: an explanation is a verbatim copy when it contains the whole source
 * text, or any full sentence of the source that is at least eight words long,
 * after case, punctuation, and whitespace are ignored.
 */
export function isVerbatimCopy(why: string, source: string | null | undefined): boolean {
  if (!source) return false;
  const w = normalize(why);
  const src = normalize(source);
  if (!w || !src) return false;
  if (src.split(" ").length >= 4 && w.includes(src)) return true;
  for (const sentence of source.split(/[.!?]+/)) {
    const n = normalize(sentence);
    if (n && n.split(" ").length >= 8 && w.includes(n)) return true;
  }
  return false;
}

/** Everything wrong with a draft, in the order the form shows fields; empty = complete. */
export function correctionIssues(
  draft: CorrectionDraft,
  source: { explanation: string | null; optionFeedback?: (string | null)[] }
): CorrectionIssue[] {
  const issues: CorrectionIssue[] = [];
  if (!draft.correctAnswer.trim()) issues.push("answer_missing");
  const why = draft.explanation.trim();
  if (!why) issues.push("why_missing");
  else if (sentenceCount(why) < 2) issues.push("why_short");
  else if (
    isVerbatimCopy(why, source.explanation) ||
    (source.optionFeedback ?? []).some((f) => isVerbatimCopy(why, f))
  )
    issues.push("why_copied");
  return issues;
}

// ---------------------------------------------------------------------------
// The set (one attempt's corrections)
// ---------------------------------------------------------------------------

export type CorrectionsState =
  | "none" // nothing missed in scope
  | "needed" // some questions have no submitted correction yet
  | "returned" // the teacher sent it back; revise and resubmit
  | "submitted" // every correction is in, awaiting approval
  | "approved"; // every correction approved; the retake gate is open

export type CorrectionsSummary = {
  state: CorrectionsState;
  needed: number;
  /** Submitted or approved. */
  done: number;
  remaining: number;
  approved: number;
  returned: number;
};

/**
 * Rule: the set is approved only when every needed question has an approved
 * correction; returned if any was sent back; submitted when every needed
 * question is submitted or approved; otherwise needed.
 */
export function correctionsSummary(
  needed: string[],
  rows: { questionId: string; status: CorrectionStatus }[]
): CorrectionsSummary {
  const by = new Map(rows.map((r) => [r.questionId, r.status]));
  let approved = 0;
  let returned = 0;
  let done = 0;
  for (const id of needed) {
    const s = by.get(id);
    if (s === "approved") approved++;
    if (s === "returned") returned++;
    if (s === "approved" || s === "submitted") done++;
  }
  const n = needed.length;
  const state: CorrectionsState =
    n === 0
      ? "none"
      : approved === n
        ? "approved"
        : returned > 0
          ? "returned"
          : done === n
            ? "submitted"
            : "needed";
  return { state, needed: n, done, remaining: n - done, approved, returned };
}

/** True when the student may start another attempt as far as corrections go. */
export function correctionsClear(summary: CorrectionsSummary): boolean {
  return summary.state === "none" || summary.state === "approved";
}
