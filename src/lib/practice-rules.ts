/**
 * Practice sets and relearning activities (PLAN.md §3.7, Ticket 1.13): the
 * pure rules. A practice attempt is complete when every question is closed
 * (right, or its answer revealed); its percent counts only auto-graded items. An activity is
 * complete when its kind's rule is met: video ≥ 90% watched, reading scrolled
 * to the end and confirmed, link opened and confirmed, guided notes with every
 * prompt answered. Worksheets complete from their own webhook (Ticket 1.14).
 */
import type { CompletionEvidence, ServedQuestion } from "@/db/schema";

export type ActivityKind =
  "video" | "reading" | "link" | "guided_notes" | "worksheet" | "interactive";

/** What an interactive page must send (`postMessage`) for Bloom to count it done. */
export const INTERACTIVE_MESSAGE_SOURCE = "bloom-practice";

export const VIDEO_WATCH_THRESHOLD = 90;
export const GUIDED_NOTES_MIN_PROMPTS = 2;
export const GUIDED_NOTES_MAX_PROMPTS = 5;

export const KIND_LABEL: Record<ActivityKind, string> = {
  video: "Video",
  reading: "Reading",
  link: "Link",
  guided_notes: "Guided notes",
  worksheet: "Worksheet",
  interactive: "Interactive page",
};

/** What a student must do, in their words, per kind. */
export const KIND_RULE: Record<ActivityKind, string> = {
  video: "Watch at least 90% of the video.",
  reading: "Read to the end, then mark it finished.",
  link: "Open the link, then mark it finished.",
  guided_notes: "Answer every prompt.",
  worksheet: "Submit the worksheet.",
  interactive: "Finish the activity on the page; it reports back when everything is placed.",
};

export type CompletionCheck =
  { ok: true; evidence: CompletionEvidence } | { ok: false; reason: string };

/**
 * Rule: the evidence a student's browser reports must satisfy the kind's
 * completion rule; anything else is refused with a reason they can act on.
 */
export function checkActivityCompletion(input: {
  kind: ActivityKind;
  evidence: CompletionEvidence;
  prompts: { id: string; prompt: string }[] | null;
}): CompletionCheck {
  const e = input.evidence;
  switch (input.kind) {
    case "video": {
      const pct = typeof e.watchPercent === "number" ? e.watchPercent : 0;
      if (pct < VIDEO_WATCH_THRESHOLD)
        return { ok: false, reason: `Keep watching: ${Math.floor(pct)}% so far, 90% needed.` };
      return { ok: true, evidence: { watchPercent: Math.min(100, Math.round(pct)) } };
    }
    case "reading":
      if (!e.scrolledToEnd) return { ok: false, reason: "Scroll to the end of the reading first." };
      if (!e.confirmed) return { ok: false, reason: "Mark it finished when you are done." };
      return { ok: true, evidence: { scrolledToEnd: true, confirmed: true } };
    case "link":
      if (!e.confirmed) return { ok: false, reason: "Open the link, then mark it finished." };
      return { ok: true, evidence: { confirmed: true } };
    case "guided_notes": {
      const prompts = input.prompts ?? [];
      const answers = e.answers ?? {};
      if (prompts.length === 0) return { ok: false, reason: "This activity has no prompts yet." };
      const blank = prompts.filter((p) => !(answers[p.id] ?? "").trim());
      if (blank.length)
        return {
          ok: false,
          reason: `Answer every prompt (${blank.length} ${blank.length === 1 ? "is" : "are"} blank).`,
        };
      const kept: Record<string, string> = {};
      for (const p of prompts) kept[p.id] = answers[p.id].trim().slice(0, 5000);
      return { ok: true, evidence: { answers: kept } };
    }
    case "worksheet":
      return { ok: false, reason: "Worksheets complete when the worksheet itself is submitted." };
    case "interactive": {
      // The embedded page reports { total, firstTry, misses, seconds, missedTerms } when every
      // label is placed; Bloom keeps those numbers as the evidence and shows them to the teacher.
      const r = e.interactive;
      if (!r || typeof r.total !== "number" || r.total < 1)
        return { ok: false, reason: "Finish the activity on the page first." };
      const clamp = (n: unknown, max: number) =>
        Math.max(0, Math.min(max, Math.round(typeof n === "number" && Number.isFinite(n) ? n : 0)));
      return {
        ok: true,
        evidence: {
          interactive: {
            activity: typeof r.activity === "string" ? r.activity.slice(0, 80) : undefined,
            total: clamp(r.total, 1000),
            firstTry: clamp(r.firstTry, clamp(r.total, 1000)),
            misses: clamp(r.misses, 100_000),
            seconds: clamp(r.seconds, 86_400),
            missedTerms: (Array.isArray(r.missedTerms) ? r.missedTerms : [])
              .filter((t): t is string => typeof t === "string")
              .slice(0, 200)
              .map((t) => t.slice(0, 120)),
          },
        },
      };
    }
  }
}

/**
 * Apps Script–style checking (Jon, Oct 13 2026): a wrong check leaves the
 * question open to try again, the hint unlocks after this many misses, and the
 * student may reveal the answer at any time, which closes the question.
 */
export const HINT_AFTER_MISSES = 3;

/** One practice item, stored in `practice_attempts.answers` keyed by question id. */
export type PracticeAnswer = {
  /** The last answer checked; null when the answer was revealed before any check. */
  answer: unknown;
  /** The last check's result; null when the question needs a human (never graded in practice). */
  isCorrect: boolean | null;
  pointsEarned: number | null;
  pointsPossible: number;
  answeredAt: string;
  /** Wrong checks so far. Absent on items saved under the one-try rule (before Oct 13 2026). */
  misses?: number;
  /** The student asked to see the answer. */
  revealed?: boolean;
  /** Done with: right, revealed, or read by the teacher. Absent means a one-try item, which is closed. */
  closed?: boolean;
};

export function isClosed(a: PracticeAnswer | undefined): boolean {
  return a ? (a.closed ?? true) : false;
}

export function hintUnlocked(a: PracticeAnswer | undefined): boolean {
  return (a?.misses ?? 0) >= HINT_AFTER_MISSES;
}

/**
 * Rule: a check on an open item replaces its answer and result; a wrong one
 * adds a miss and keeps it open, anything else closes it. A closed item never
 * changes.
 */
export function recordCheck(
  prior: PracticeAnswer | undefined,
  result: {
    answer: unknown;
    isCorrect: boolean | null;
    pointsEarned: number | null;
    pointsPossible: number;
  },
  at: string
): PracticeAnswer {
  if (prior && isClosed(prior)) return prior;
  const wrong = result.isCorrect === false;
  return {
    ...result,
    answeredAt: at,
    misses: (prior?.misses ?? 0) + (wrong ? 1 : 0),
    revealed: false,
    closed: !wrong,
  };
}

/**
 * Rule: revealing closes an open item as not correct, keeping whatever partial
 * points its last check earned; an item only a teacher can read carries no
 * points either way. A closed item never changes.
 */
export function recordReveal(
  prior: PracticeAnswer | undefined,
  pointsPossible: number,
  at: string,
  manual = false
): PracticeAnswer {
  if (prior && isClosed(prior)) return prior;
  return {
    answer: prior?.answer ?? null,
    isCorrect: manual ? null : false,
    pointsEarned: manual ? null : (prior?.pointsEarned ?? 0),
    pointsPossible,
    answeredAt: at,
    misses: prior?.misses ?? 0,
    revealed: true,
    closed: true,
  };
}

export type PracticeProgress = {
  /** Closed items: right, revealed, or read by the teacher. */
  answered: number;
  /** Closed items that were right without a reveal. */
  correct: number;
  total: number;
  complete: boolean;
  /** Auto-graded items only; manual items are practice, not points. */
  score: number;
  maxScore: number;
  percent: number | null;
};

/** Rule: complete = every served question closed; percent over the closed auto-graded items. */
export function practiceProgress(
  questionSet: ServedQuestion[],
  answers: Record<string, PracticeAnswer>
): PracticeProgress {
  let answered = 0;
  let correct = 0;
  let score = 0;
  let maxScore = 0;
  for (const q of questionSet) {
    const a = answers[q.questionId];
    if (!isClosed(a)) continue;
    answered++;
    if (a.isCorrect === true) correct++;
    if (a.pointsEarned === null) continue;
    score += a.pointsEarned;
    maxScore += a.pointsPossible;
  }
  const total = questionSet.length;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    answered,
    correct,
    total,
    complete: total > 0 && answered >= total,
    score: r2(score),
    maxScore: r2(maxScore),
    percent: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : null,
  };
}

/**
 * Video watch tracking: the browser reports player time once a second; a jump
 * larger than `maxStep` seconds is a seek and does not count as watched. Returns
 * the new set of watched whole seconds.
 */
export function markWatched(
  watched: Set<number>,
  fromSeconds: number,
  toSeconds: number,
  maxStep = 2
): Set<number> {
  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds)) return watched;
  const from = Math.floor(fromSeconds);
  const to = Math.floor(toSeconds);
  if (to < from || to - from > maxStep) return watched;
  const next = new Set(watched);
  for (let s = from; s <= to; s++) next.add(s);
  return next;
}

/** Percent of a video's whole seconds that were watched (0–100). */
export function watchPercent(watched: Set<number>, durationSeconds: number): number {
  const total = Math.max(1, Math.floor(durationSeconds));
  let n = 0;
  for (const s of watched) if (s >= 0 && s < total) n++;
  return Math.min(100, (n / total) * 100);
}

/** Student-facing state of a practice set or activity on the Practice tab. */
export type PracticeItemState = "not_started" | "in_progress" | "done" | "awaiting_teacher";

export const STATE_LABEL: Record<PracticeItemState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  awaiting_teacher: "Waiting for teacher",
};
