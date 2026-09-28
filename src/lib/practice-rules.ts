/**
 * Practice sets and relearning activities (PLAN.md §3.7, Ticket 1.13): the
 * pure rules. A practice attempt is complete when every question has been
 * answered once; its percent counts only auto-graded items. An activity is
 * complete when its kind's rule is met: video ≥ 90% watched, reading scrolled
 * to the end and confirmed, link opened and confirmed, guided notes with every
 * prompt answered. Worksheets complete from their own webhook (Ticket 1.14).
 */
import type { CompletionEvidence, ServedQuestion } from "@/db/schema";

export type ActivityKind = "video" | "reading" | "link" | "guided_notes" | "worksheet";

export const VIDEO_WATCH_THRESHOLD = 90;
export const GUIDED_NOTES_MIN_PROMPTS = 2;
export const GUIDED_NOTES_MAX_PROMPTS = 5;

export const KIND_LABEL: Record<ActivityKind, string> = {
  video: "Video",
  reading: "Reading",
  link: "Link",
  guided_notes: "Guided notes",
  worksheet: "Worksheet",
};

/** What a student must do, in their words, per kind. */
export const KIND_RULE: Record<ActivityKind, string> = {
  video: "Watch at least 90% of the video.",
  reading: "Read to the end, then mark it finished.",
  link: "Open the link, then mark it finished.",
  guided_notes: "Answer every prompt.",
  worksheet: "Submit the worksheet.",
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
  }
}

/** One answered practice item, stored in `practice_attempts.answers` keyed by question id. */
export type PracticeAnswer = {
  answer: unknown;
  /** null when the question needs a human (never graded in practice). */
  isCorrect: boolean | null;
  pointsEarned: number | null;
  pointsPossible: number;
  answeredAt: string;
};

export type PracticeProgress = {
  answered: number;
  total: number;
  complete: boolean;
  /** Auto-graded items only; manual items are practice, not points. */
  score: number;
  maxScore: number;
  percent: number | null;
};

/** Rule: complete = every served question answered once; percent over the auto-graded items. */
export function practiceProgress(
  questionSet: ServedQuestion[],
  answers: Record<string, PracticeAnswer>
): PracticeProgress {
  let answered = 0;
  let score = 0;
  let maxScore = 0;
  for (const q of questionSet) {
    const a = answers[q.questionId];
    if (!a) continue;
    answered++;
    if (a.pointsEarned === null) continue;
    score += a.pointsEarned;
    maxScore += a.pointsPossible;
  }
  const total = questionSet.length;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    answered,
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
