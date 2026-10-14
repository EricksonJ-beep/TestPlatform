/**
 * The class gradebook's status tags (Jon, Oct 13 2026: "a complete gradebook view for the class
 * so I can see who needs to take what without having to go into each assessment"; research notes
 * C, "Gradebook cells"). The teacher layer on top of the student's own card state
 * (`deriveCardState`): what waits on the teacher, who is testing right now, what the student
 * still owes, what is quiet, and what is done, one tag per cell. Pure: no database, no clock of
 * its own.
 */
import type { CardState } from "@/lib/card-state";
import type { SetSummary } from "@/lib/corrections";
import type { RequestBlocker } from "@/lib/needs-you";
import { practiceOwed } from "@/lib/quiz-practice";
import type { RetakePlan, RetakeTarget } from "@/lib/retakes";
import { movedUp, startOfWeek } from "@/lib/tiers";

export type CellKind =
  // Your move: these count in "N things need you".
  | "asked"
  | "request"
  | "check_corrections"
  | "to_grade"
  | "check_activity"
  // Testing now
  | "taking"
  | "paused"
  // Left open with the time used up: submitted when they come back (quiet)
  | "out_of_time"
  // Student owes
  | "missing"
  | "not_started"
  | "corrections_needed"
  | "sent_back"
  | "relearning"
  | "retake_needed"
  // Your OK, optional (not counted)
  | "ready"
  // Quiet
  | "can_retake"
  | "corrections_to_full"
  | "unlocked"
  | "opens"
  // Done
  | "done";

/** Precedence (research notes C): when more than one tag applies, the earlier one wins. */
export const CELL_ORDER: CellKind[] = [
  "asked",
  "request",
  "check_corrections",
  "to_grade",
  "check_activity",
  "taking",
  "paused",
  "out_of_time",
  "missing",
  "not_started",
  "corrections_needed",
  "sent_back",
  "relearning",
  "retake_needed",
  "ready",
  "can_retake",
  "corrections_to_full",
  "unlocked",
  "opens",
  "done",
];

export type CellGroup = "your_move" | "testing" | "owes" | "your_ok" | "quiet" | "done";

/**
 * Which group each tag sits in. "Corrections → 100%" is the student's move, not a quiet
 * "optional" (Jon, Oct 13 2026, decision 2: "Do corrections → 100%", not "optional").
 */
export const CELL_GROUP: Record<CellKind, CellGroup> = {
  asked: "your_move",
  request: "your_move",
  check_corrections: "your_move",
  to_grade: "your_move",
  check_activity: "your_move",
  taking: "testing",
  paused: "testing",
  out_of_time: "quiet",
  missing: "owes",
  not_started: "owes",
  corrections_needed: "owes",
  sent_back: "owes",
  relearning: "owes",
  retake_needed: "owes",
  corrections_to_full: "owes",
  ready: "your_ok",
  can_retake: "quiet",
  unlocked: "quiet",
  opens: "quiet",
  done: "done",
};

/** Bloom colour per group: coral, brand, warning, a coral outline, muted, success. */
export type CellTone = "coral" | "brand" | "warning" | "coral_outline" | "muted" | "success";

const GROUP_TONE: Record<CellGroup, CellTone> = {
  your_move: "coral",
  testing: "brand",
  owes: "warning",
  your_ok: "coral_outline",
  quiet: "muted",
  done: "success",
};

/** What a summative's locked retake targets still need, in checklist order. */
export type RelearningNeed = "corrections" | "activity" | "practice";

export function relearningNeeds(targets: RetakeTarget[], plan: RetakePlan): RelearningNeed[] {
  const locked = new Set(plan.locked);
  const out = new Set<RelearningNeed>();
  for (const t of targets) {
    if (!locked.has(t.id)) continue;
    if (!t.gate.correctionsOk) out.add("corrections");
    if (!t.gate.activityOk) out.add("activity");
    if (!t.gate.practiceOk) out.add("practice");
  }
  return (["corrections", "activity", "practice"] as const).filter((n) => out.has(n));
}

export type CellInput = {
  /** The student's own card (`deriveCardState`). */
  card: CardState;
  attemptsUsed: number;
  /**
   * The open attempt, if any: paused (`currentPause`), asked to finish, out of time (`outOfTime`:
   * the time limit ran out first, so nobody is in it), and how far along.
   */
  live: {
    paused: boolean;
    asked: boolean;
    outOfTime?: boolean;
    answered: number;
    total: number;
  } | null;
  /** A current retake request (`staleRequest` says it isn't a leftover). */
  requested: boolean;
  /** Correction sets on this student's attempts waiting for the teacher's approval. */
  correctionsToCheck: number;
  /** Written answers on finished attempts with no score yet. */
  toGrade: number;
  /** Finished relearning activities on this test's retake targets waiting to be checked off. */
  activitiesToCheck: number;
  /** The latest finished attempt's corrections set; null when nothing is in scope. */
  corrections: Pick<SetSummary, "started" | "needed"> | null;
  /** Summatives: the retake picture from the stored gate rows. */
  retake: { targets: RetakeTarget[]; plan: RetakePlan } | null;
  /** The teacher unlocked the next try and something else still stops it (`requestBlocker`). */
  unlockedBlocker: RequestBlocker | null;
  opensAt: Date | null;
};

export type CellTag = {
  kind: CellKind;
  group: CellGroup;
  tone: CellTone;
  /** Counts in "N things need you". */
  needsYou: boolean;
  /** A retake state on a closed test: retakes can't start once closed, so it reads "· closed" in grey. */
  closed: boolean;
  /** To grade (n). */
  toGrade: number;
  /** Taking it: answered of served. */
  progress: { answered: number; total: number } | null;
  /**
   * Corrections needed: started of needed, the count the student's own row shows (a saved draft
   * counts; the set goes in all at once, so nothing is turned in while it is owed).
   */
  corrections: { started: number; needed: number } | null;
  /** Retake needed: the codes of the targets below the line. */
  targets: string[];
  /** Relearning: what the checklist still needs. */
  needs: RelearningNeed[];
  /** Relearning on a quiz (Jon, Oct 14 2026, R3): the codes of the missed targets still to practise. */
  practice: string[];
  /** Unlocked: what still stops the start. */
  blocker: RequestBlocker | null;
  /** Opens: when the test opens. */
  opensAt: Date | null;
};

/** The student's part of the tag, from their card (null while an attempt is open). */
function studentKind(input: CellInput): { kind: CellKind; closed: boolean } | null {
  const { card } = input;
  if (input.live) return null;
  const closed = card.status === "closed";
  const own = (kind: CellKind, isClosed = false) => ({ kind, closed: isClosed });
  if (input.attemptsUsed === 0)
    return own(card.status === "scheduled" ? "opens" : closed ? "missing" : "not_started");
  switch (card.cycle) {
    // Corrections stay open after a test closes (research notes A2), so these show either way.
    case "corrections_needed":
      return own("corrections_needed");
    case "corrections_to_full":
      return own("corrections_to_full");
    case "corrections_returned":
      return own("sent_back");
    case "corrections_submitted":
      return own("check_corrections");
    // Retakes can't start once a test closes: the retake states say so.
    case "relearning":
      return own("relearning", closed);
    case "retake_required":
      return own("retake_needed", closed);
    case "awaiting_unlock":
      if (!closed) return own("ready");
      return input.retake?.plan.required.length ? own("retake_needed", true) : own("done");
    case "retake_available":
      if (input.unlockedBlocker) return own("unlocked");
      // Past the cap's window the student asks for it, as on a closed test (Oct 14 2026).
      return own(closed || card.windowClosed ? "done" : "can_retake");
    default:
      return own(input.unlockedBlocker ? "unlocked" : "done");
  }
}

/**
 * Rule (research notes C, Jon's decisions 2–5): one tag per cell, the first that applies in
 * `CELL_ORDER`. The teacher's moves (asked to finish, a current retake request, corrections to
 * check, answers to grade, an activity to check off) and testing now (taking it, paused; an open
 * test whose time ran out first is "Time's up · not submitted", quiet, never Taking it) sit on
 * top of the student's own card state, which supplies the rest: Missing (closed, never started),
 * Not started, the corrections and relearning states (even on a closed test), Retake needed,
 * Ready (needs your OK, not asked), Can retake, Corrections → 100%, Unlocked (approved but still
 * blocked), Opens, Done. Corrections are owed with "Retakes need my OK" on too (Jon, Oct 14 2026,
 * decision 4); in a CVTC course they never are (Oct 13 2026); a quiz's missed targets need
 * practice before its retake ("Relearning (needs: practice U2.LT1)", decision 5); all of it comes
 * through the card.
 */
export function cellTag(input: CellInput): CellTag {
  const applies = new Map<CellKind, boolean>();
  if (input.live)
    applies.set(
      input.live.paused
        ? input.live.asked
          ? "asked"
          : "paused"
        : input.live.outOfTime
          ? "out_of_time"
          : "taking",
      false
    );
  if (input.requested) applies.set("request", false);
  if (input.correctionsToCheck > 0) applies.set("check_corrections", false);
  if (input.toGrade > 0) applies.set("to_grade", false);
  if (input.activitiesToCheck > 0) applies.set("check_activity", false);
  const own = studentKind(input);
  if (own && !applies.has(own.kind)) applies.set(own.kind, own.closed);
  const kind = CELL_ORDER.find((k) => applies.has(k)) ?? "done";
  const closed = applies.get(kind) ?? false;
  const group = CELL_GROUP[kind];
  const retake = input.retake;
  const practice = practiceOwed(input.card.quizPractice).map((t) => t.code);
  return {
    kind,
    group,
    tone: closed ? "muted" : GROUP_TONE[group],
    needsYou: group === "your_move",
    closed,
    toGrade: input.toGrade,
    progress: input.live ? { answered: input.live.answered, total: input.live.total } : null,
    corrections: input.corrections
      ? { started: input.corrections.started, needed: input.corrections.needed }
      : null,
    targets: retake
      ? retake.targets.filter((t) => retake.plan.required.includes(t.id)).map((t) => t.code)
      : [],
    needs: retake
      ? relearningNeeds(retake.targets, retake.plan)
      : practice.length
        ? ["practice"]
        : [],
    practice,
    blocker: kind === "unlocked" ? input.unlockedBlocker : null,
    opensAt: input.opensAt,
  };
}

/** Times on the tags, in Bloom's school time zone (as `startReasonText` writes them). */
export type TagFormat = { time: (d: Date) => string; date: (d: Date) => string };

export const CENTRAL: TagFormat = {
  time: (d) =>
    d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    }),
  date: (d) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }),
};

const NEED_TEXT: Record<RelearningNeed, string> = {
  corrections: "corrections",
  activity: "activity",
  practice: "practice",
};

/** What still stops an unlocked try, after "Unlocked · ". */
function unlockedText(b: RequestBlocker | null, fmt: TagFormat): string {
  if (!b) return "waiting";
  switch (b.reason) {
    case "wait":
      return `after ${fmt.time(b.at)}`;
    case "window_closed":
      return "retake window closed";
    case "closed":
      return "test closed";
    case "not_open":
      return "test not open yet";
    case "no_attempts_left":
      return "no tries left";
    case "no_retake":
      return "no retake at their score";
    case "corrections":
      return "corrections not done";
    case "practice":
      return `practice ${b.codes.join(", ")} not done`;
    case "gates":
      return "relearning not done";
    case "nothing_selected":
      return "no target picked";
  }
}

/** The tag's words, e.g. "Corrections needed 3/8", "Retake needed (LT3, LT4) · closed". */
export function tagLabel(tag: CellTag, fmt: TagFormat = CENTRAL): string {
  const closed = tag.closed ? " · closed" : "";
  switch (tag.kind) {
    case "asked":
      return "Asked to finish";
    case "request":
      return "Retake request";
    case "check_corrections":
      return "Check corrections";
    case "to_grade":
      return `To grade (${tag.toGrade})`;
    case "check_activity":
      return "Check off activity";
    case "taking":
      return tag.progress
        ? `Taking it ${tag.progress.answered}/${tag.progress.total}`
        : "Taking it";
    case "paused":
      return "Paused";
    case "out_of_time":
      return "Time's up · not submitted";
    case "missing":
      return "Missing";
    case "not_started":
      return "Not started";
    case "corrections_needed":
      return tag.corrections
        ? `Corrections needed ${tag.corrections.started}/${tag.corrections.needed}`
        : "Corrections needed";
    case "sent_back":
      return "Sent back";
    case "relearning":
      return tag.needs.length
        ? `Relearning (needs: ${tag.needs.map((n) => (n === "practice" && tag.practice.length ? `practice ${tag.practice.join(", ")}` : NEED_TEXT[n])).join(", ")})${closed}`
        : `Relearning${closed}`;
    case "retake_needed":
      return tag.targets.length
        ? `Retake needed (${tag.targets.join(", ")})${closed}`
        : `Retake needed${closed}`;
    case "ready":
      return "Ready, needs your OK";
    case "can_retake":
      return "Can retake";
    case "corrections_to_full":
      return "Corrections → 100%";
    case "unlocked":
      return `Unlocked · ${unlockedText(tag.blocker, fmt)}`;
    case "opens":
      return tag.opensAt ? `Opens ${fmt.date(tag.opensAt)}` : "Opens soon";
    case "done":
      return "Done";
  }
}

// ---------------------------------------------------------------------------
// Column footers
// ---------------------------------------------------------------------------

export type ColumnFooter = {
  /** Enrolled students with a counting score (they finished an attempt). */
  done: number;
  enrolled: number;
  /** Average of the counting scores (`assignment_final_scores`), not of every attempt; null when none. */
  average: number | null;
  /** Summatives: students per tier (Class at a glance, folded in; Jon's decision 9). */
  tiers: { 1: number; 2: number; 3: number } | null;
  /** Summatives: students whose last tier change, since Monday, was up. */
  movedUpThisWeek: number;
};

/** Rule (Jon's decision 9; research notes C): done/enrolled, average counting score, tier counts, up N this week. */
export function columnFooter(input: {
  type: "practice" | "formative" | "summative";
  enrolled: number;
  /** The counting scores of the enrolled students who have one. */
  finals: {
    percent: number;
    tier: number | null;
    previousTier: number | null;
    tierChangedAt: Date | null;
  }[];
  now: Date;
}): ColumnFooter {
  const { finals } = input;
  const summative = input.type === "summative";
  const week = startOfWeek(input.now);
  return {
    done: finals.length,
    enrolled: input.enrolled,
    average: finals.length ? finals.reduce((n, f) => n + f.percent, 0) / finals.length : null,
    tiers: summative
      ? {
          1: finals.filter((f) => f.tier === 1).length,
          2: finals.filter((f) => f.tier === 2).length,
          3: finals.filter((f) => f.tier === 3).length,
        }
      : null,
    movedUpThisWeek: summative ? finals.filter((f) => movedUp(f, week)).length : 0,
  };
}
