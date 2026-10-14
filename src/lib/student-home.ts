/**
 * The student home (Jon, Oct 14 2026; docs/student-home-plan.md "Student home", build step 3:
 * "Even having those as items to do or a to-do list to help them would be great"). A to-do list
 * above the tabs, and the Assessments tab grouped by status. Pure, so the rules are testable
 * without a database: the page reads the student's assignments, each with its card from
 * `deriveCardState` (the rule the teacher's class gradebook reads too), and this decides the rows.
 */
import type { StudentAssignment, StudentCardState } from "@/lib/queries/assignments";
import type { StudentActivity } from "@/lib/queries/practice";
import type { RetakeStatus } from "@/lib/queries/retakes";
import {
  PRACTICE_PASS_PERCENT,
  practiceOwed,
  practiceSizeText,
  targetList,
} from "@/lib/quiz-practice";

// ---------------------------------------------------------------------------
// The to-do list
// ---------------------------------------------------------------------------

/**
 * What the to-do reads of one assignment: the student home passes its `StudentAssignment`; the
 * teacher's class gradebook builds the same fields from its batched read, so the student panel
 * lists exactly the rows the student sees (Jon, Oct 14 2026, docs/student-home-plan.md "Teacher
 * side").
 */
export type ToDoAssignment = Pick<
  StudentAssignment,
  | "id"
  | "title"
  | "type"
  | "className"
  | "closesAt"
  | "status"
  | "state"
  | "cycle"
  | "attemptsAllowed"
  | "attemptsUsed"
  | "timeLimitMinutes"
  | "needsCode"
  | "nextAttemptAt"
  | "retakesNeedUnlock"
  | "retakeRequested"
  | "reopenedUntil"
  | "retakeOpenUntil"
  | "askCounts"
  | "correctionsCap"
  | "retakeThreshold"
  | "correctionsRule"
  | "retakeBy"
  | "retakeWindowClosed"
  | "firstPercent"
  | "paused"
  | "progress"
  | "corrections"
  | "quizPractice"
> & { retake: Pick<RetakeStatus, "targets" | "plan"> | null };

/** To do counts; "Want a higher score?" and "Waiting on your teacher" don't. */
export type ToDoGroup = "todo" | "higher" | "waiting";

export type ToDoKind =
  | "keep_going"
  | "sent_back"
  | "corrections"
  | "practice"
  | "relearning"
  | "retake"
  | "ask"
  | "start"
  | "awaiting_grade"
  | "corrections_submitted"
  | "retake_requested"
  | "activity_check";

/** The plan's order for the To do group (keep going first, tests not started last). */
const TODO_ORDER: ToDoKind[] = [
  "keep_going",
  "sent_back",
  "corrections",
  "practice",
  "relearning",
  "retake",
  "ask",
  "start",
];

/** The plan's order for Waiting on your teacher: a grade, corrections, a request, an activity. */
const WAITING_ORDER: ToDoKind[] = [
  "awaiting_grade",
  "corrections_submitted",
  "retake_requested",
  "activity_check",
];

/** A row's one button: a link, or the request button ("Ask to retake", "Ask for a retake"). */
export type ToDoAction =
  | {
      kind: "link";
      label: string;
      href: string;
      primary: boolean;
      /** Names what the button is for where the label repeats within one test ("Practice U2.LT1"). */
      what?: string;
    }
  | { kind: "ask"; label: string; assignmentId: string; attemptNumber: number; primary: boolean };

export type ToDoRow = {
  key: string;
  group: ToDoGroup;
  kind: ToDoKind;
  /** Null for a relearning activity waiting for its check-off. */
  assignmentId: string | null;
  title: string;
  type: StudentAssignment["type"] | null;
  className: string | null;
  /** Why it's on the list and what doing it earns, in the student's words. */
  why: string | null;
  /**
   * `why` with the student's own scores left out, for the teacher's Hide scores (decision 6), so
   * the row still says what it is about; null when `why` shows no score.
   */
  whyWithoutScores: string | null;
  /** The teacher's note on corrections sent back. */
  note: string | null;
  /** A bar and its words: "0 of 6 done", "3 of 10 answered", "Best so far: 60%". */
  progress: { value: number; max: number; label: string } | null;
  /** Summative relearning: each target still locked, with its three gates. */
  checklist: {
    code: string;
    title: string;
    corrections: boolean;
    activity: boolean;
    practice: boolean;
  }[];
  /** A time on the row, shown in the student's time zone: "Closes …", "You can start after …". */
  when: { label: string; at: Date } | null;
  minutes: number | null;
  needsCode: boolean;
  action: ToDoAction | null;
};

/**
 * Hide scores (Jon, Oct 13 2026, decision 6) where the teacher's student panel shows these rows:
 * a line that shows a percent ("Best so far: 60%") drops out, and the why line reads in its
 * score-free form (`whyWithoutScores`: "Practice U2.LT1: score 80%… to unlock your retake."), so
 * every row still says what it is about.
 */
export function showsScore(text: string): boolean {
  return /\d%/.test(text);
}

export type StudentToDo = {
  todo: ToDoRow[];
  higher: ToDoRow[];
  waiting: ToDoRow[];
  /** The counted rows: the To do group, tests not started included (decision 3). */
  count: number;
  /** "You have N things to do." / "You're all caught up." */
  headline: string;
};

const pct = (n: number | null) => Math.round(n ?? 0);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const assignmentHref = (a: ToDoAssignment) => `/student/assignments/${a.id}`;

/** The test's close as it stands for this student: a reopen (R5) or the assignment's own close. */
function closeWhen(a: ToDoAssignment): ToDoRow["when"] {
  if (a.reopenedUntil) return { label: "Reopened for you until", at: a.reopenedUntil };
  return a.status !== "closed" && a.closesAt ? { label: "Closes", at: a.closesAt } : null;
}

/**
 * What doing the corrections earns, from the corrections rule (Jon, Oct 13–14 2026): to 100% where
 * that is the way up ("there's no retake at your score"); attempt 1 of a capped quiz lifts to the
 * threshold; otherwise they unlock the next attempt, or, on a closed test, come before asking to
 * retake (R4). Shared by the to-do row and My results, so the two say the same thing.
 */
export function correctionsWhy(a: ToDoAssignment, scores = true): string | null {
  const c = a.corrections;
  if (!c) return null;
  const lead = `Correct ${c.needed} missed ${plural(c.needed, "question", "questions")}`;
  // Hide scores (the teacher's panel) leaves out the score they start from, not where they go.
  const from = scores ? ` from ${pct(a.firstPercent)}%` : "";
  if (a.correctionsRule === "to_full")
    return `${lead} to raise your score${from} to 100%. There's no retake at your score.`;
  if (a.type === "formative" && a.correctionsCap && c.attemptNumber === 1)
    return `${lead} to raise your score${from} to ${a.retakeThreshold}%.`;
  const attemptsLeft = a.attemptsAllowed === null || a.attemptsUsed < a.attemptsAllowed;
  if (!attemptsLeft) return `${lead} on attempt ${c.attemptNumber}.`;
  if (asksToRetake(a)) return `${lead} before you can ask to retake.`;
  if (a.retakesNeedUnlock) return `${lead} before you can ask for attempt ${a.attemptsUsed + 1}.`;
  return `${lead} to unlock attempt ${a.attemptsUsed + 1}.`;
}

/**
 * How far an owed corrections set is, in one set of words for the to-do row, the card, My results,
 * the assignment page and the teacher's gradebook (review of the Oct 14 2026 build: a saved draft
 * is "started", never "done", as Jon had it Oct 8; the set goes in all at once with Submit).
 */
export function correctionsProgress(c: { started: number; done: number; needed: number }): {
  value: number;
  max: number;
  label: string;
} {
  return {
    value: c.started,
    max: c.needed,
    label: `${c.started} of ${c.needed} started${c.started > c.done ? ", not turned in yet" : ""}`,
  };
}

/** The corrections button: do, continue, or (every one started) finish and turn them in. */
export function correctionsActionLabel(c: { started: number; needed: number }): string {
  if (c.started === 0) return "Do corrections";
  return c.started >= c.needed ? "Finish and turn in" : "Continue corrections";
}

/**
 * The retake is asked for whatever "Retakes need my OK" says: the test has closed (R4), or the
 * cap's retake window has passed while it is open (Jon, Oct 14 2026: "Let them ask while it's
 * still open too").
 */
function asksToRetake(a: ToDoAssignment): boolean {
  return a.status === "closed" || a.retakeWindowClosed;
}

/** What a retake step leads to: the retake itself, or asking for it (closed, or needs the OK). */
export function retakeGoal(a: ToDoAssignment): string {
  if (asksToRetake(a)) return "before you can ask to retake";
  return a.retakesNeedUnlock ? "before you can ask for a retake" : "to unlock your retake";
}

/**
 * A step toward a retake counts when the retake itself would (R6): always on a test that is open
 * to the student (the plan's To do order: practice, relearning), and on a closed one only when the
 * retake would be required there (a summative with targets below the line), the rule that decides
 * whether "Ask to retake" counts (`askCounts`). An optional retake's steps sit in "Want a higher
 * score?", and so do a quiz's past the cap's retake window, where it is asked for too (Oct 14
 * 2026).
 */
function stepGroup(a: ToDoAssignment): ToDoGroup {
  if (!asksToRetake(a)) return "todo";
  return a.type === "summative" && !!a.retake?.plan.required.length ? "todo" : "higher";
}

/** One row of an assignment: the fields that vary, over the assignment's own. */
type RowMaker = (
  r: Pick<ToDoRow, "group" | "kind" | "why" | "action"> & Partial<ToDoRow>
) => ToDoRow;

/** The no-scores `why` where it differs (Hide scores); null where `why` shows no score. */
const withoutScores = (why: string | null, plain: string | null) =>
  why && plain !== why ? plain : null;

type LinkMaker = (label: string, href: string, primary: boolean, what?: string) => ToDoAction;

const requiredCodes = (a: ToDoAssignment) =>
  a.retake ? a.retake.targets.filter((t) => t.required).map((t) => t.code) : [];

function rowsFor(a: ToDoAssignment, buildable: ReadonlySet<string>): ToDoRow[] {
  const row: RowMaker = (r) => ({
    key: `${r.kind}:${a.id}`,
    assignmentId: a.id,
    title: a.title,
    type: a.type,
    className: a.className,
    whyWithoutScores: null,
    note: null,
    progress: null,
    checklist: [],
    when: closeWhen(a),
    minutes: null,
    needsCode: false,
    ...r,
  });
  const link: LinkMaker = (label, href, primary, what) => ({
    kind: "link",
    label,
    href,
    primary,
    ...(what ? { what } : {}),
  });
  const ask = (label: string, primary: boolean): ToDoAction => ({
    kind: "ask",
    label,
    assignmentId: a.id,
    attemptNumber: a.attemptsUsed + 1,
    primary,
  });
  const c = a.corrections;
  const correctionsHref = c ? `/student/corrections/${c.attemptId}` : assignmentHref(a);

  switch (a.state) {
    case "in_progress":
      // Finish later (Oct 13 2026): a paused test is finished in Jon's room, and still counts.
      return [
        row({
          group: "todo",
          kind: "keep_going",
          why: a.paused
            ? "Paused. Finish it in class."
            : "You started this. Pick up where you left off.",
          progress:
            a.progress && a.progress.total > 0
              ? {
                  value: a.progress.answered,
                  max: a.progress.total,
                  label: `${a.progress.answered} of ${a.progress.total} answered`,
                }
              : null,
          action: link(a.paused ? "Finish in class" : "Continue", assignmentHref(a), true),
        }),
      ];
    case "awaiting_grade":
      return [
        row({
          group: "waiting",
          kind: "awaiting_grade",
          why: "Your teacher is grading your written answers. Your score shows up once they're done.",
          when: null,
          action: link("View", assignmentHref(a), false),
        }),
      ];
    case "corrections_returned":
      return [
        row({
          group: "todo",
          kind: "sent_back",
          why: "Your teacher sent your corrections back. Fix them and turn them in again.",
          note: c?.reviewerNote ?? null,
          action: link("Revise corrections", correctionsHref, true),
        }),
      ];
    case "corrections_needed":
    case "corrections_to_full":
      return [
        row({
          group: "todo",
          kind: "corrections",
          why: correctionsWhy(a),
          whyWithoutScores: withoutScores(correctionsWhy(a), correctionsWhy(a, false)),
          progress: c ? correctionsProgress(c) : null,
          action: link(c ? correctionsActionLabel(c) : "Do corrections", correctionsHref, true),
        }),
      ];
    case "corrections_submitted":
      return [
        row({
          group: "waiting",
          kind: "corrections_submitted",
          why: "Your corrections are in. Your teacher is checking them.",
          when: null,
          action: link("View corrections", correctionsHref, false),
        }),
      ];
    case "relearning":
    case "closed":
      // A closed test's learning cycle goes on toward asking to retake (R4); only relearning
      // leaves anything to do there (corrections already show as their own states, R1).
      return a.cycle === "relearning" ? relearningRows(a, buildable, row, link) : [];
    case "retake_required":
    case "retake_available": {
      const required = a.state === "retake_required";
      const codes = required
        ? requiredCodes(a)
        : a.retake
          ? a.retake.targets
              .filter((t) => a.retake!.plan.selected.includes(t.id))
              .map((t) => t.code)
          : [];
      const why =
        a.type === "summative"
          ? required
            ? `You still need to retake ${targetList(codes)}. Your best score on each target counts.`
            : `You can retake ${codes.length ? targetList(codes) : "a target"} to go higher. Your best score on each target counts.`
          : "Retake it to raise your score. Your highest score counts.";
      // The wait between attempts: no button until then.
      if (a.nextAttemptAt)
        return [
          row({
            group: required ? "todo" : "higher",
            kind: "retake",
            why,
            when: { label: "You can start after", at: a.nextAttemptAt },
            action: null,
          }),
        ];
      return [
        row({
          group: required ? "todo" : "higher",
          kind: "retake",
          why,
          when:
            a.retakeBy && !a.retakeWindowClosed
              ? { label: "Retake by", at: a.retakeBy }
              : a.retakeOpenUntil
                ? { label: "Retake by", at: a.retakeOpenUntil }
                : closeWhen(a),
          minutes: a.timeLimitMinutes,
          needsCode: a.needsCode,
          action: link("Start retake", assignmentHref(a), required),
        }),
      ];
    }
    case "awaiting_unlock": {
      if (a.retakeRequested)
        return [
          row({
            group: "waiting",
            kind: "retake_requested",
            why:
              a.status === "closed"
                ? "You asked to retake this test. If your teacher says yes, it opens just for you until the end of the next school day."
                : a.retakeWindowClosed
                  ? "You asked to retake this quiz. If your teacher says yes, you can retake it until the end of the next school day."
                  : `You asked for attempt ${a.attemptsUsed + 1}. Your teacher will approve it, usually in class.`,
            when: null,
            action: link("View", assignmentHref(a), false),
          }),
        ];
      // "Retakes need my OK" on an open test: asking counts where the retake is required (R6).
      const codes = requiredCodes(a);
      return [
        row({
          group: codes.length ? "todo" : "higher",
          kind: "ask",
          why: codes.length
            ? `You still need to retake ${targetList(codes)}. Your teacher opens each retake: ask for attempt ${a.attemptsUsed + 1}.`
            : `Want a higher score? Ask your teacher for attempt ${a.attemptsUsed + 1}.`,
          action: ask("Ask for a retake", codes.length > 0),
        }),
      ];
    }
    case "ask_to_retake": {
      // R6: counted when the retake would be required if the test were open.
      const codes = requiredCodes(a);
      return [
        row({
          group: a.askCounts ? "todo" : "higher",
          kind: "ask",
          why:
            a.status !== "closed"
              ? // Past the cap's window on an open quiz (Jon, Oct 14 2026): asked for, never "closed".
                "The retake window for this quiz has ended. Want a higher score? Ask your teacher: if they say yes, you can retake it until the end of the next school day."
              : a.askCounts && codes.length
                ? `This test is closed, and you still need to retake ${targetList(codes)}. Ask your teacher: if they say yes, it opens just for you until the end of the next school day.`
                : "This test is closed. Want a higher score? Ask your teacher: if they say yes, it opens just for you until the end of the next school day.",
          when: null,
          action: ask("Ask to retake", a.askCounts),
        }),
      ];
    }
    case "not_started":
      // Decision 3 ("Count them too"): an open test not started is a counted row.
      return [
        row({
          group: "todo",
          kind: "start",
          why: a.closesAt ? null : "Open now.",
          minutes: a.timeLimitMinutes,
          needsCode: a.needsCode,
          action: link("Start", assignmentHref(a), true),
        }),
      ];
    default:
      return [];
  }
}

/** Quiz practice targets (R3), one row each, or a summative's relearning checklist. */
function relearningRows(
  a: ToDoAssignment,
  buildable: ReadonlySet<string>,
  row: RowMaker,
  link: LinkMaker
): ToDoRow[] {
  const group = stepGroup(a);
  if (a.retake) {
    const locked = new Set(a.retake.plan.locked);
    const targets = a.retake.targets.filter((t) => locked.has(t.id));
    return [
      row({
        group,
        kind: "relearning",
        why: `Finish relearning on ${targetList(targets.map((t) => t.code))} ${retakeGoal(a)}.`,
        checklist: targets.map((t) => ({
          code: t.code,
          title: t.title,
          corrections: t.gate.correctionsOk,
          activity: t.gate.activityOk,
          practice: t.gate.practiceOk,
        })),
        // The Practice tab lists what's needed for a test open to the student; a closed one's
        // checklist is on its own page.
        action: link(
          "View checklist",
          a.status === "closed" ? assignmentHref(a) : `/student?tab=practice#needed-${a.id}`,
          group === "todo"
        ),
      }),
    ];
  }
  return practiceOwed(a.quizPractice).map((t) => {
    // The 80% is the pass mark, not their score: Hide scores keeps it and drops "you scored".
    const ask = `Practice ${t.code}: score ${PRACTICE_PASS_PERCENT}% ${practiceSizeText(t.minQuestions)} ${retakeGoal(a)}`;
    return row({
      key: `practice:${a.id}:${t.targetId}`,
      group,
      kind: "practice",
      why: `${ask} (you scored ${pct(t.scored)}%).`,
      whyWithoutScores: `${ask}.`,
      progress:
        t.best === null
          ? null
          : {
              value: Math.min(t.best, PRACTICE_PASS_PERCENT),
              max: PRACTICE_PASS_PERCENT,
              label: `Best so far: ${pct(t.best)}%`,
            },
      // Build my practice opens on that target. A target only a teacher's set covers: the test's
      // group on the Practice tab, which lists tests open to the student; a closed test's own
      // page, which lists the sets (review, Oct 14 2026).
      action: link(
        "Practice",
        buildable.has(t.targetId)
          ? `/student/practice/build?target=${t.targetId}`
          : a.status === "closed"
            ? `${assignmentHref(a)}#practice`
            : `/student?tab=practice#needed-${a.id}`,
        group === "todo",
        `Practice ${t.code}`
      ),
    });
  });
}

/**
 * Soonest deadline first (a reopen is the student's deadline), then tests with no deadline, then
 * closed tests, most recently closed first; ties by title, as on the Assessments tab, so the
 * student's home and the teacher's student panel list them in the same order whatever order
 * they were read in. One test's own rows (practice targets) keep their order.
 */
function byUrgency(
  rows: ToDoRow[],
  byId: Map<string, ToDoAssignment>
): (x: ToDoRow, y: ToDoRow) => number {
  const order = new Map(rows.map((r, i) => [r.key, i]));
  const key = (r: ToDoRow): [number, number] => {
    const a = r.assignmentId ? byId.get(r.assignmentId) : undefined;
    if (!a) return [1, 0];
    const close = a.reopenedUntil ?? a.closesAt;
    if (a.status !== "closed") return close ? [0, close.getTime()] : [1, 0];
    return [2, -(a.closesAt?.getTime() ?? 0)];
  };
  return (x, y) => {
    const [bx, vx] = key(x);
    const [by, vy] = key(y);
    return (
      bx - by || vx - vy || x.title.localeCompare(y.title) || order.get(x.key)! - order.get(y.key)!
    );
  };
}

/**
 * Rule (Jon, Oct 14 2026, docs/student-home-plan.md "Student home"; decision 3 "Count them too"):
 * every assignment's card becomes zero or more rows in one of three groups. **To do** (counted:
 * "You have N things to do.") in this order: keep going (an open attempt; paused reads "Finish it
 * in class"), corrections sent back, corrections (open or closed, R1), quiz practice targets (R3),
 * a summative's relearning checklist, a required retake, asking to retake where the retake is
 * required (R6), and open tests not started. **Want a higher score?** (not counted): optional
 * retakes, asking for one, and the steps before an optional ask on a closed test. **Waiting on
 * your teacher** (not counted), in this order: a grade, corrections being checked, a retake
 * request, an activity to check off. Inside each kind, soonest deadline first, then most recently
 * closed, then by title.
 */
export function buildStudentToDo(input: {
  assignments: ToDoAssignment[];
  /** Relearning activities; the ones waiting for the teacher's check-off are listed. */
  activities?: Pick<StudentActivity, "id" | "title" | "state" | "courseName">[];
  /** Targets Build my practice can deal (`listCustomPracticeOptions`); others link to Practice. */
  buildableTargetIds?: ReadonlySet<string>;
}): StudentToDo {
  const buildable = input.buildableTargetIds ?? new Set<string>();
  const rows = input.assignments.flatMap((a) => rowsFor(a, buildable));
  for (const act of input.activities ?? [])
    if (act.state === "awaiting_teacher")
      rows.push({
        key: `activity_check:${act.id}`,
        group: "waiting",
        kind: "activity_check",
        assignmentId: null,
        title: act.title,
        type: null,
        className: act.courseName,
        why: "You finished this activity. Your teacher checks it off.",
        whyWithoutScores: null,
        note: null,
        progress: null,
        checklist: [],
        when: null,
        minutes: null,
        needsCode: false,
        action: {
          kind: "link",
          label: "View",
          href: `/student/activities/${act.id}`,
          primary: false,
        },
      });
  const byId = new Map(input.assignments.map((a) => [a.id, a]));
  const urgency = byUrgency(rows, byId);
  // Jon, Oct 14 2026: corrections are "almost like an advertisement… especially when they got
  // below an 80 percent", so below-the-line scores lead the corrections rows, lowest first.
  const lift = (r: ToDoRow) => {
    const a = r.kind === "corrections" && r.assignmentId ? byId.get(r.assignmentId) : undefined;
    if (!a) return [1, 0] as const;
    const pct = a.firstPercent ?? 0;
    return [pct < a.retakeThreshold ? 0 : 1, pct] as const;
  };
  const todo = rows
    .filter((r) => r.group === "todo")
    .sort(
      (x, y) =>
        TODO_ORDER.indexOf(x.kind) - TODO_ORDER.indexOf(y.kind) ||
        lift(x)[0] - lift(y)[0] ||
        lift(x)[1] - lift(y)[1] ||
        urgency(x, y)
    );
  const higher = rows.filter((r) => r.group === "higher").sort(urgency);
  const waiting = rows
    .filter((r) => r.group === "waiting")
    .sort((x, y) => WAITING_ORDER.indexOf(x.kind) - WAITING_ORDER.indexOf(y.kind) || urgency(x, y));
  const count = todo.length;
  return {
    todo,
    higher,
    waiting,
    count,
    headline:
      count === 0
        ? "You're all caught up."
        : `You have ${count} ${plural(count, "thing", "things")} to do.`,
  };
}

// ---------------------------------------------------------------------------
// The tabs
// ---------------------------------------------------------------------------

export const HOME_TABS = ["assessments", "practice", "results"] as const;
export type HomeTab = (typeof HOME_TABS)[number];

/** `?tab=` on the student home, so a row can open a tab and Back returns to the last one. */
export function homeTab(v: string | string[] | null | undefined): HomeTab {
  const s = Array.isArray(v) ? v[0] : v;
  return HOME_TABS.find((t) => t === s) ?? "assessments";
}

// ---------------------------------------------------------------------------
// The Assessments tab, grouped by status
// ---------------------------------------------------------------------------

export type StatusSection = "open" | "soon" | "closed";

export const STATUS_TITLE: Record<StatusSection, string> = {
  open: "Open now",
  soon: "Opens soon",
  closed: "Closed",
};

/** The corrections states a student still has work in (submitted ones wait on the teacher). */
const CORRECTIONS_TO_DO = new Set<StudentCardState>([
  "corrections_needed",
  "corrections_to_full",
  "corrections_returned",
]);

/**
 * Rule (Jon, Oct 14 2026, plan step 3): **Open now** (open to the student, a reopen included, or
 * with an attempt still open), soonest due first, no due date last; **Opens soon**, soonest first;
 * **Closed**, newest first. Each card keeps its own pill and button.
 */
export function assessmentsByStatus(
  list: StudentAssignment[]
): Record<StatusSection, StudentAssignment[]> {
  const out: Record<StatusSection, StudentAssignment[]> = { open: [], soon: [], closed: [] };
  for (const a of list)
    out[
      a.status === "open" || a.state === "in_progress"
        ? "open"
        : a.status === "scheduled"
          ? "soon"
          : "closed"
    ].push(a);
  const at = (d: Date | null, none: number) => d?.getTime() ?? none;
  const due = (a: StudentAssignment) => a.reopenedUntil ?? a.closesAt;
  out.open.sort(
    (x, y) => at(due(x), Infinity) - at(due(y), Infinity) || x.title.localeCompare(y.title)
  );
  out.soon.sort(
    (x, y) => at(x.opensAt, Infinity) - at(y.opensAt, Infinity) || x.title.localeCompare(y.title)
  );
  out.closed.sort(
    (x, y) => at(y.closesAt, 0) - at(x.closesAt, 0) || x.title.localeCompare(y.title)
  );
  return out;
}

/** "Show closed · 5 · 2 have corrections to do": closed tests where corrections are still the student's. */
export function closedCorrectionsCount(closed: StudentAssignment[]): number {
  return closed.filter((a) => CORRECTIONS_TO_DO.has(a.state)).length;
}

/** The type tag on a card (Jon: "Formative tag and Summative would be good too"). */
export const TYPE_LABEL: Record<StudentAssignment["type"], string> = {
  practice: "Practice",
  formative: "Formative",
  summative: "Summative",
};
