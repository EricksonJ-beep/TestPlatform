/**
 * The student home as it is drawn (home pages redesign, BLOOM_HOME_REDESIGN.md §5): one "do this
 * now" panel, then "Then fix these" and "Want a higher score?". Pure words on top of the lanes
 * (`homeLanes`); which row goes in which lane, and in what order, is unchanged.
 */
import { hourLabel } from "@/lib/teacher-home";
import { TYPE_LABEL, type HomeLanes, type ToDoRow } from "@/lib/student-home";

/** Rule (§5.1): something to start or continue; else corrections or retakes; else nothing. */
export function homeHeadline(
  firstName: string,
  lanes: Pick<HomeLanes, "now" | "fix" | "level">
): string {
  if (lanes.now.length) return `Hi, ${firstName}. One thing first.`;
  if (lanes.fix.length || lanes.level.length) return `Hi, ${firstName}. Nothing due right now.`;
  return `Hi, ${firstName}. You're all caught up.`;
}

/** A class chip's words: "Biology, 3rd hour, Erickson". */
export function classChip(c: {
  name: string;
  period: string | null;
  courseName: string | null;
  teacherLastName: string;
}): string {
  const parts = c.courseName
    ? [c.courseName, c.period ? hourLabel({ name: c.name, period: c.period }) : c.name]
    : [c.name];
  return [...new Set(parts), c.teacherLastName].filter(Boolean).join(", ");
}

/** A formative is "the quiz", a summative "the test"; practice is "the practice". */
export function kindWord(type: ToDoRow["type"]): string {
  return type === "summative" ? "test" : type === "practice" ? "practice" : "quiz";
}

/**
 * The panel's big button (§5.2): "Continue the quiz", "Start the test". A paused test keeps the
 * row's own "Finish in class": it can only be finished in the teacher's room.
 */
export function nowButtonLabel(r: Pick<ToDoRow, "kind" | "type" | "action">): string {
  if (r.kind === "keep_going")
    return r.action?.label === "Finish in class"
      ? "Finish in class"
      : `Continue the ${kindWord(r.type)}`;
  return `Start the ${kindWord(r.type)}`;
}

/** The position (from 1) of the first question with no saved answer; null when none is left. */
export function firstUnanswered(answers: boolean[] | null | undefined): number | null {
  if (!answers) return null;
  const i = answers.indexOf(false);
  return i < 0 ? null : i + 1;
}

/**
 * The panel's one line of status (§5.2). In progress: "You started this. Pick up at question n.",
 * n being the first unanswered question's position (never answered-count + 1), or "Pick up where
 * you left off." when that isn't known; a paused test keeps its own words. Not started: what the
 * row already knows (its time limit, a code from the teacher); the question count isn't known
 * before the first attempt is made.
 */
export function nowStatus(
  r: Pick<ToDoRow, "kind" | "why" | "minutes" | "needsCode" | "action">,
  answers: boolean[] | null | undefined
): string {
  if (r.kind === "keep_going") {
    if (r.action?.label === "Finish in class") return r.why ?? "Paused. Finish it in class.";
    const n = firstUnanswered(answers);
    return n
      ? `You started this. Pick up at question ${n}.`
      : "You started this. Pick up where you left off.";
  }
  const parts = [
    answers?.length ? `${answers.length} questions.` : null,
    r.why,
    r.minutes ? `${r.minutes} minutes.` : null,
    r.needsCode ? "You need a code from your teacher." : null,
  ].filter(Boolean);
  return parts.join(" ") || "Ready when you are.";
}

/** "2 sets of corrections" when the section holds only corrections; "3 to fix" otherwise. */
export function fixCount(rows: Pick<ToDoRow, "kind">[]): string {
  const n = rows.length;
  return rows.every((r) => r.kind === "corrections" || r.kind === "sent_back")
    ? `${n} ${n === 1 ? "set" : "sets"} of corrections`
    : `${n} to fix`;
}

/** What asking leads to, said once under the list instead of on every row (§5.4). */
export const RETAKE_CAPTION =
  "If your teacher says yes, the test opens just for you until the end of the next school day.";

/**
 * A retake row's 14px note (§5.4). The row's own sentence, without the part the caption under
 * the list now says once ("Ask your teacher: if they say yes, …"); a closed test with nothing
 * else to say reads "Summative, closed". Null for a request already sent: the row says when.
 */
export function retakeNote(r: Pick<ToDoRow, "kind" | "why" | "type">): string | null {
  if (r.kind === "retake_requested") return null;
  if (!r.why) return null;
  if (r.kind !== "ask") return r.why;
  const own = r.why
    .replace(/\s*Ask your teacher: if they say yes,[^.]*\./, "")
    .replace(/\s*Want a higher score\?\s*/, " ")
    .trim();
  if (own === "This test is closed.") return `${r.type ? TYPE_LABEL[r.type] : "Test"}, closed`;
  return own || null;
}
