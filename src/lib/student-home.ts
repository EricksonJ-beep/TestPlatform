/**
 * The student home's Assessments tab (Jon, Oct 8 2026: "active assessments
 * should show up at the top"): three sections, each in due-date order.
 * Pure, so the rule is testable without a database.
 */
import type { StudentAssignment, StudentCardState } from "@/lib/queries/assignments";

export type AssessmentSection = "needs_you" | "waiting" | "closed";

/** States where the next move is the student's. */
const NEEDS_YOU = new Set<StudentCardState>([
  "not_started",
  "in_progress",
  "corrections_needed",
  "corrections_optional",
  "corrections_returned",
  "relearning",
  "retake_required",
  "retake_available",
]);

export function sectionOf(state: StudentCardState): AssessmentSection {
  if (state === "closed") return "closed";
  return NEEDS_YOU.has(state) ? "needs_you" : "waiting";
}

/** Soonest due first; no due date last; ties by title so the order is stable. */
function byDue(a: StudentAssignment, b: StudentAssignment) {
  const da = a.closesAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const db = b.closesAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return da - db || a.title.localeCompare(b.title);
}

/** Closed ones read newest first: the quiz from last week before the one from September. */
function byClosedDesc(a: StudentAssignment, b: StudentAssignment) {
  const da = a.closesAt?.getTime() ?? 0;
  const db = b.closesAt?.getTime() ?? 0;
  return db - da || a.title.localeCompare(b.title);
}

export function sectionAssessments(
  list: StudentAssignment[]
): Record<AssessmentSection, StudentAssignment[]> {
  const out: Record<AssessmentSection, StudentAssignment[]> = {
    needs_you: [],
    waiting: [],
    closed: [],
  };
  for (const a of list) out[sectionOf(a.state)].push(a);
  out.needs_you.sort(byDue);
  out.waiting.sort(byDue);
  out.closed.sort(byClosedDesc);
  return out;
}

export const SECTION_TITLE: Record<AssessmentSection, string> = {
  needs_you: "Needs you",
  waiting: "Waiting or done",
  closed: "Closed",
};

/** The type tag on a card (Jon: "Formative tag and Summative would be good too"). */
export const TYPE_LABEL: Record<StudentAssignment["type"], string> = {
  practice: "Practice",
  formative: "Formative",
  summative: "Summative",
};
