/**
 * Relearning activities: Read · Watch · Do (Jon, Nov 2–4 2026; docs/relearning-revamp-plan.md
 * rules A1–A6 and Q3, ticket R4). Pure: which option a target uses for a mode, which sections a
 * bundle serves, what the picker offers, when a section and a whole row are done, and how a quick
 * check is graded. The server half is `src/lib/relearning-server.ts`; the path rule that reads
 * a finished bundle is `src/lib/relearning-path.ts`.
 */
import type { QuickCheck, RelearningProgress, RelearningSectionBody } from "@/db/schema";

export type RelearningMode = "read" | "watch" | "do";

/** The picker's order (A1). */
export const MODES: RelearningMode[] = ["read", "watch", "do"];

export const MODE_LABEL: Record<RelearningMode, string> = {
  read: "Read",
  watch: "Watch",
  do: "Do",
};

export const MODE_EMOJI: Record<RelearningMode, string> = { read: "📖", watch: "🎬", do: "🧩" };

/** The picker card's line when the teacher's option has no description of its own. */
export const MODE_LINE: Record<RelearningMode, string> = {
  read: "A short reading with examples and quick checks along the way.",
  watch: "A video that pauses for a quick check now and then.",
  do: "Hands-on: sort, match, flip cards or work a problem one step at a time.",
};

/**
 * A5: where a target with no option in the chosen mode falls back to. Read first (it always
 * plays), then Do, then Watch (a video can be blocked by Restricted Mode, A6).
 */
export const FALLBACK_ORDER: RelearningMode[] = ["read", "do", "watch"];

/** Watch: the share of a video segment that has to play (A3; the same 90% as v2 videos). */
export const WATCH_PERCENT = 90;

/** The optional short answer in an extension (decision 7): long enough to be a real sentence. */
export const SHORT_ANSWER_MIN = 15;

export type SectionInfo = {
  id: string;
  part: "core" | "extension";
  sortOrder: number;
  title: string | null;
  body: RelearningSectionBody;
  checks: QuickCheck[];
  shortAnswerPrompt: string | null;
  estMinutes: number;
  mediaAssetId: string | null;
};

export type OptionInfo = {
  id: string;
  learningTargetId: string;
  mode: RelearningMode;
  title: string;
  description: string | null;
  sections: SectionInfo[];
};

/**
 * Q3 / A2: a bundle of one target serves core + extension (about 10 min); a quiz bundle of two or
 * three serves cores only (about 3–5 min each). A test target is always a bundle of its own.
 */
export function servesExtension(bundleSize: number): boolean {
  return bundleSize <= 1;
}

/** A target's option for a mode: that mode's, else the first built in `FALLBACK_ORDER` (A5). */
export function optionFor(options: OptionInfo[], mode: RelearningMode): OptionInfo | null {
  const usable = options.filter((o) => o.sections.length > 0);
  return (
    usable.find((o) => o.mode === mode) ??
    FALLBACK_ORDER.map((m) => usable.find((o) => o.mode === m)).find(Boolean) ??
    null
  );
}

/** An option's sections a bundle serves: its cores, then (when it serves them) its extensions. */
export function sectionsFor(option: OptionInfo, withExtension: boolean): SectionInfo[] {
  const part = (s: SectionInfo) => (s.part === "core" ? 0 : 1);
  return option.sections
    .filter((s) => withExtension || s.part === "core")
    .sort((a, b) => part(a) - part(b) || a.sortOrder - b.sortOrder);
}

export type ModeChoice = {
  mode: RelearningMode;
  /** The option's own headline when one target, else the mode's name. */
  title: string;
  line: string;
  /** "About N min": the sections this bundle would serve, added up. */
  minutes: number;
  /** Targets that use another mode's option because this one isn't built for them (A5). */
  fallbackFor: string[];
};

/**
 * A4 / A5: the picker's cards for these targets, in Read · Watch · Do order. A mode shows when at
 * least one target has it built; a target without it borrows its fallback. Targets with nothing
 * built at all are left to the teacher's check-off (`unbuilt`); with every target unbuilt there
 * are no cards.
 */
export function modeChoices(
  optionsByTarget: Map<string, OptionInfo[]>,
  targetIds: string[]
): { choices: ModeChoice[]; unbuilt: string[] } {
  const withExtension = servesExtension(targetIds.length);
  const unbuilt = targetIds.filter((t) => !optionFor(optionsByTarget.get(t) ?? [], "read"));
  const choices: ModeChoice[] = [];
  for (const mode of MODES) {
    const exact = targetIds
      .map((t) =>
        (optionsByTarget.get(t) ?? []).find((o) => o.mode === mode && o.sections.length > 0)
      )
      .filter((o): o is OptionInfo => !!o);
    if (exact.length === 0) continue;
    let minutes = 0;
    const fallbackFor: string[] = [];
    for (const t of targetIds) {
      const opt = optionFor(optionsByTarget.get(t) ?? [], mode);
      if (!opt) continue;
      if (opt.mode !== mode) fallbackFor.push(t);
      minutes += sectionsFor(opt, withExtension).reduce((sum, s) => sum + s.estMinutes, 0);
    }
    const single = targetIds.length === 1 ? exact[0] : null;
    choices.push({
      mode,
      title: single?.title ?? MODE_LABEL[mode],
      line: single?.description ?? MODE_LINE[mode],
      minutes,
      fallbackFor,
    });
  }
  return { choices, unbuilt };
}

/** What a section asks for besides its quick checks (A3), in the student's words. */
export function sectionRule(body: RelearningSectionBody): string {
  switch (body.type) {
    case "text":
      return "Read to the end.";
    case "video":
      return `Watch at least ${WATCH_PERCENT}% of the video.`;
    case "interactive":
      return "Finish the activity on the page.";
    case "flashcards":
      return "Flip every card.";
    case "worked_steps":
      return "Show every step.";
  }
}

/**
 * A3: a section is done when every quick check is answered right (unlimited tries), its own part
 * is met (read to the end, 90% watched, the page reported done, every card flipped, every step
 * shown), and its short answer, when it has one, is written.
 */
export function sectionDone(
  section: Pick<SectionInfo, "id" | "body" | "shortAnswerPrompt"> & { checks: { id: string }[] },
  progress: RelearningProgress
): boolean {
  const checksOk = section.checks.every((c) => progress.checks?.[c.id]?.correct === true);
  if (!checksOk) return false;
  const p = progress.sections?.[section.id] ?? {};
  const own =
    section.body.type === "text"
      ? p.scrolledToEnd === true
      : section.body.type === "video"
        ? (p.watchPercent ?? 0) >= WATCH_PERCENT
        : p.completed === true;
  if (!own) return false;
  if (section.shortAnswerPrompt)
    return (progress.shortAnswers?.[section.id] ?? "").trim().length >= SHORT_ANSWER_MIN;
  return true;
}

/**
 * A row (one target's relearning) is done when every section it served is done. A section the
 * teacher has since deleted counts as done, so an edit never strands a student; a row with no
 * option (nothing built, A5) finishes only by the teacher's check-off.
 */
export function rowDone(
  row: { optionId: string | null; servedSectionIds: string[] },
  sections: Map<string, SectionInfo>,
  progress: RelearningProgress
): boolean {
  if (!row.optionId || row.servedSectionIds.length === 0) return false;
  return row.servedSectionIds.every((id) => {
    const s = sections.get(id);
    return !s || sectionDone(s, progress);
  });
}

/** A fill-in answer as compared: case, spacing and a closing period don't matter. */
function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/\.$/, "").toLowerCase();
}

/** A quick check, graded on the server (the key never reaches the browser). */
export function gradeCheck(check: QuickCheck, answer: string): boolean {
  if (typeof answer !== "string" || !answer.trim()) return false;
  if (check.kind === "multiple_choice") return answer === check.answer;
  const accepted = Array.isArray(check.answer) ? check.answer : [check.answer];
  return accepted.some((a) => norm(a) === norm(answer));
}

/** A quick check as the student's browser gets it: no key, and the explanation only once right. */
export type PublicCheck = Omit<QuickCheck, "answer" | "explanation">;

export function publicCheck(check: QuickCheck): PublicCheck {
  return {
    id: check.id,
    kind: check.kind,
    prompt: check.prompt,
    ...(check.options ? { options: check.options } : {}),
    ...(check.atSeconds !== undefined ? { atSeconds: check.atSeconds } : {}),
    ...(check.afterStepId ? { afterStepId: check.afterStepId } : {}),
  };
}

/**
 * A video segment's watched share: whole seconds played inside [start, end), over its length.
 * `end` is the video's duration when the segment runs to the end.
 */
export function segmentWatchPercent(watched: Set<number>, start: number, end: number): number {
  const from = Math.max(0, Math.floor(start));
  const to = Math.floor(end);
  const total = Math.max(1, to - from);
  let n = 0;
  for (const s of watched) if (s >= from && s < to) n++;
  return Math.min(100, (n / total) * 100);
}

/** Watch: the first unanswered check whose time has come (the video pauses for it). */
export function dueCheck(
  checks: QuickCheck[],
  progress: RelearningProgress,
  atSeconds: number
): QuickCheck | null {
  return (
    checks
      .filter((c) => c.atSeconds !== undefined && progress.checks?.[c.id]?.correct !== true)
      .sort((a, b) => a.atSeconds! - b.atSeconds!)
      .find((c) => atSeconds >= c.atSeconds!) ?? null
  );
}
