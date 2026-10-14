/**
 * "Needs you" (Jon, Oct 13 2026: "a page that allows me to control and see all of the requests
 * or things that I can monitor like approving corrections or giving access to a retake"; plan in
 * docs/dashboard-plan.md). Pure rules for the Dashboard inbox: how a row names its class, which
 * retake requests are current, what would still stop an approved retake from starting, and how
 * many things need the teacher. No database, no clock of its own.
 */
import { canStartAttempt } from "@/lib/assignments";
import type { RetakeBlocker } from "@/lib/retakes";

export type ClassPlace = { courseName: string | null; className: string; period: string | null };

/**
 * Every row names where it happens (Jon, Oct 13 2026: the inbox covers ALL courses): the
 * course, then the period ("P3"), or the class name when the class has no period.
 */
export function placeLabel(p: ClassPlace): string {
  const period = p.period?.trim();
  return [p.courseName, period ? `P${period.replace(/^p(eriod)?\s*/i, "")}` : p.className]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Retake requests
// ---------------------------------------------------------------------------

export type StaleReason = "left_class" | "setting_off" | "taken" | "not_next" | "no_attempts";

/**
 * Rule (research notes A3): a request is current only when it asks for the student's next try
 * (attempts used + 1) on a test that still says "Retakes need my OK" and still has that try, from
 * a student still in the test's class (moving a student to another period keeps their requests,
 * and Approve and Decline only work for an enrolled student). Anything else is a leftover:
 * approving it would unlock nothing useful, so it gets Clear.
 */
export function staleRequest(input: {
  attemptNumber: number;
  /** Attempts the student has on the assignment, finished or not. */
  used: number;
  retakesNeedUnlock: boolean;
  attemptsAllowed: number | null;
  /** The student is still enrolled in the assignment's class. */
  enrolled: boolean;
}): StaleReason | null {
  if (!input.enrolled) return "left_class";
  if (!input.retakesNeedUnlock) return "setting_off";
  if (input.attemptNumber <= input.used) return "taken";
  if (input.attemptNumber !== input.used + 1) return "not_next";
  if (input.attemptsAllowed !== null && input.attemptNumber > input.attemptsAllowed)
    return "no_attempts";
  return null;
}

export const STALE_TEXT: Record<StaleReason, string> = {
  left_class: "No longer in this class.",
  setting_off: "This test no longer needs your OK for a retake.",
  taken: "Already took that try.",
  not_next: "That is no longer their next try.",
  no_attempts: "No tries left on this test.",
};

export type RequestBlocker =
  | { reason: "not_open" | "closed" | "no_attempts_left" | "no_retake" }
  | { reason: "wait"; at: Date }
  | { reason: "window_closed"; at: Date }
  | { reason: Exclude<RetakeBlocker, "no_attempts"> };

/**
 * What would still stop a current request's try from starting once the teacher approves it: the
 * test's window, the wait between attempts, the corrections cap's retake window. The same
 * `canStartAttempt` rule `startAttempt` uses, with the unlock taken as given and no access code
 * (that is typed in class). A summative's relearning gates come from its retake plan separately.
 */
export function requestBlocker(input: {
  assignment: {
    opensAt: Date | null;
    closesAt: Date | null;
    attemptsAllowed: number | null;
    retakeWaitHours: number;
    /** The cap's retake window as it applies here (null when the cap is off or a CVTC course). */
    retakeWindowDays: number | null;
  };
  used: number;
  lastSubmittedAt: Date | null;
  firstSubmittedAt: Date | null;
  now: Date;
}): RequestBlocker | null {
  const check = canStartAttempt({
    assignment: { ...input.assignment, accessCode: null, retakesNeedUnlock: false },
    attemptsUsed: input.used,
    lastSubmittedAt: input.lastSubmittedAt,
    firstSubmittedAt: input.firstSubmittedAt,
    now: input.now,
  });
  if (check.ok) return null;
  if (check.reason === "wait" && check.availableAt)
    return { reason: "wait", at: check.availableAt };
  if (check.reason === "window_closed" && check.closedAt)
    return { reason: "window_closed", at: check.closedAt };
  if (check.reason === "not_open" || check.reason === "closed") return { reason: check.reason };
  return { reason: "no_attempts_left" };
}

/** The blocker line under a request; times are filled in by the page in the viewer's zone. */
export const BLOCKER_LINE: Record<RequestBlocker["reason"], string> = {
  not_open: "The test isn't open yet, so they can't start it.",
  closed: "The test is closed, so they can't start it. Reopen it on Assign first.",
  no_attempts_left: "They have no tries left.",
  wait: "Can start after",
  window_closed: "The retake window closed",
  no_retake: "No retake at their score: corrections raise it to 100%.",
  gates: "Their relearning checklist isn't done yet.",
  nothing_selected: "Every target is proficient; they have to pick a target to retake.",
};

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

export type NeedsYouGroup =
  "asked" | "requests" | "corrections" | "grading" | "activities" | "worksheets";

/**
 * Rule (Jon, Oct 13 2026): "N things need you" is the number of rows in the list, one per
 * thing: each student asking to finish, each retake request (leftovers too, until cleared), each
 * correction set, each test with answers to grade, each activity to check off, and one row for
 * all worksheet emails still to match. Paused tests nobody asked about are not counted.
 */
export function needsYouCounts(inbox: {
  asked: unknown[];
  requests: unknown[];
  corrections: unknown[];
  grading: unknown[];
  activities: unknown[];
  worksheetEmails: number;
}): Record<NeedsYouGroup, number> & { total: number } {
  const counts = {
    asked: inbox.asked.length,
    requests: inbox.requests.length,
    corrections: inbox.corrections.length,
    grading: inbox.grading.length,
    activities: inbox.activities.length,
    worksheets: inbox.worksheetEmails > 0 ? 1 : 0,
  };
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}
