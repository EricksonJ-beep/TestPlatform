/**
 * A content pack's Read · Watch · Do block (relearning revamp R4 / C2), and its checks. Pure, so
 * the pack checker (scripts/check-pack.ts) and the applier (`src/lib/content-packs.ts`) share it.
 */
import type { QuickCheck, RelearningSectionBody } from "@/db/schema";

/**
 * Read · Watch · Do for one target (relearning revamp R4 / C2): the teacher's option in that mode,
 * with its core and extension sections in order. Matched by teacher, target and mode; sections
 * update in place by position (part + order) so a student partway through keeps their progress.
 */
export type PackRelearning = {
  /** A learning-target code in this course. */
  target: string;
  mode: "read" | "watch" | "do";
  title: string;
  description?: string;
  /** Default true. */
  published?: boolean;
  sections: {
    part: "core" | "extension";
    title?: string;
    /** 1–30; default 3. */
    minutes?: number;
    body: RelearningSectionBody;
    checks?: QuickCheck[];
    /** The extension's one optional short answer. */
    shortAnswer?: string;
  }[];
};

/** What's wrong with a pack's Read · Watch · Do option, if anything (checked before anything is written). */
export function relearningIssues(r: PackRelearning): string[] {
  const out: string[] = [];
  const where = `relearning ${r.target} ${r.mode}`;
  if (!["read", "watch", "do"].includes(r.mode))
    out.push(`${where}: mode must be read, watch or do`);
  if (!r.title?.trim()) out.push(`${where}: needs a title`);
  if (!r.sections?.length) out.push(`${where}: needs at least one section`);
  if (!r.sections?.some((s) => s.part === "core")) out.push(`${where}: needs a core section`);
  const checkIds = new Set<string>();
  for (const [i, sec] of (r.sections ?? []).entries()) {
    const at = `${where} section ${i + 1}`;
    if (sec.part !== "core" && sec.part !== "extension")
      out.push(`${at}: part must be core or extension`);
    if (sec.minutes !== undefined && !(sec.minutes >= 1 && sec.minutes <= 30))
      out.push(`${at}: minutes must be 1–30`);
    const b = sec.body;
    if (!b || typeof b !== "object") {
      out.push(`${at}: needs a body`);
      continue;
    }
    if (b.type === "text" && !b.text?.trim()) out.push(`${at}: text is empty`);
    if (b.type === "video" && !/^[\w-]{11}$/.test(b.youtubeId ?? ""))
      out.push(`${at}: youtubeId must be an 11-character YouTube id`);
    if (b.type === "interactive" && !b.page?.startsWith("/activities/"))
      out.push(`${at}: page must be a hosted page under /activities/`);
    if (b.type === "flashcards" && !b.cards?.length) out.push(`${at}: needs cards`);
    if (b.type === "worked_steps" && !b.steps?.length) out.push(`${at}: needs steps`);
    if (!["text", "video", "interactive", "flashcards", "worked_steps"].includes(b.type))
      out.push(`${at}: unknown body type`);
    for (const c of sec.checks ?? []) {
      if (!c.id || checkIds.has(c.id)) out.push(`${at}: check ids must be unique (${c.id})`);
      checkIds.add(c.id);
      if (c.kind === "multiple_choice" && !(c.options ?? []).some((o) => o.id === c.answer))
        out.push(`${at}: check ${c.id}'s answer isn't one of its options`);
      if (c.kind === "fill_blank" && !(Array.isArray(c.answer) ? c.answer.length : c.answer))
        out.push(`${at}: check ${c.id} needs an accepted answer`);
      if (
        c.afterStepId &&
        !(b.type === "worked_steps" && b.steps.some((st) => st.id === c.afterStepId))
      )
        out.push(`${at}: check ${c.id} follows a step that isn't there`);
    }
  }
  return out;
}
