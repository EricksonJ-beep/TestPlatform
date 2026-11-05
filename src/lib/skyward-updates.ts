/**
 * Skyward updates (Jon, Nov 5 2026: "an efficient process to know what grades need to be changed in
 * Skyward after I have already imported the bulk of them"). Bloom remembers the score it last handed
 * Jon for each student in each Skyward column (a download, or "mark as entered"); this lists the
 * counting scores that differ from it now, with what moved them (the score history, R7). Pure: the
 * query module reads marks, files and history.
 */
import type { FinalBasis } from "@/db/schema";
import { skywardScore, type SkywardFile } from "@/lib/skyward";

export type SkywardMark = {
  columnKey: string;
  studentId: string;
  score: number;
  recordedAt: Date;
};

export type HistoryEntry = {
  studentId: string;
  percent: number;
  basis: FinalBasis | null;
  at: Date;
};

export type SkywardChange = {
  columnKey: string;
  studentId: string;
  firstName: string;
  lastName: string;
  /** What Skyward has; null when Bloom never handed one over (taken after the last export). */
  from: number | null;
  /** The counting score now, as Skyward takes it. */
  to: number;
  /** What moved it, in Jon's words: "relearning path", "corrections", "retake", "regrade", "new score". */
  reason: string;
  /** When it changed (the latest history step after the mark); null when unknown. */
  at: Date | null;
};

const RAISE: Partial<Record<FinalBasis, string>> = {
  relearning_path: "relearning path",
  corrections_to_90: "corrections",
  corrections_to_threshold: "corrections",
  corrections_to_full: "corrections",
};

/**
 * Rule: for each file's student with a counting score, compare it (as Skyward takes it) to the mark.
 * Changed: no mark yet, or a different score. The reason is the student's latest score change after
 * the mark (a drop is a regrade; a rise is named by its basis, else a retake); with no mark it is a
 * new score. A student with no counting score is left out (nothing to type in yet).
 */
export function skywardChanges(input: {
  files: Pick<SkywardFile, "key" | "students">[];
  marks: SkywardMark[];
  history: HistoryEntry[];
}): SkywardChange[] {
  const markBy = new Map(input.marks.map((m) => [`${m.columnKey}:${m.studentId}`, m]));
  const historyBy = new Map<string, HistoryEntry[]>();
  for (const h of input.history) {
    const list = historyBy.get(h.studentId) ?? [];
    list.push(h);
    historyBy.set(h.studentId, list);
  }
  for (const list of historyBy.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());
  const out: SkywardChange[] = [];
  for (const file of input.files)
    for (const s of file.students) {
      if (!s.id) continue;
      const to = skywardScore(s.percent);
      if (to === null) continue;
      const mark = markBy.get(`${file.key}:${s.id}`);
      if (mark && mark.score === to) continue;
      const after = (historyBy.get(s.id) ?? []).filter(
        (h) => !mark || h.at.getTime() > mark.recordedAt.getTime()
      );
      const last = after.at(-1) ?? null;
      const reason = !mark
        ? "new score"
        : to < mark.score
          ? "regrade"
          : ((last?.basis && RAISE[last.basis]) ?? "retake");
      out.push({
        columnKey: file.key,
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        from: mark?.score ?? null,
        to,
        reason,
        at: last?.at ?? null,
      });
    }
  return out.sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName) ||
      a.columnKey.localeCompare(b.columnKey)
  );
}

/**
 * "Start tracking: I entered everything up to <date>" (Jon's bulk import came before Bloom kept
 * marks). Rule, per file and student with a counting score: no score change after the date → what
 * Skyward has is today's score; a whole-assignment file (a test) whose score changed → the score as
 * of the date (the history's last step on or before it), none when they had no score yet; a quiz's
 * per-target file whose score changed → no mark (the history keeps whole-assignment percents only),
 * so it shows as an update to make.
 */
export function marksAsOf(input: {
  files: Pick<SkywardFile, "key" | "students">[];
  history: HistoryEntry[];
  asOf: Date;
  wholeKey: string;
}): { columnKey: string; studentId: string; score: number }[] {
  const t = input.asOf.getTime();
  const out: { columnKey: string; studentId: string; score: number }[] = [];
  for (const file of input.files)
    for (const s of file.students) {
      if (!s.id) continue;
      const now = skywardScore(s.percent);
      if (now === null) continue;
      const mine = input.history
        .filter((h) => h.studentId === s.id)
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      const changedAfter = mine.some((h) => h.at.getTime() > t);
      if (!changedAfter) {
        out.push({ columnKey: file.key, studentId: s.id, score: now });
        continue;
      }
      if (file.key !== input.wholeKey) continue;
      const before = mine.filter((h) => h.at.getTime() <= t).at(-1);
      const score = before ? skywardScore(before.percent) : null;
      if (score !== null) out.push({ columnKey: file.key, studentId: s.id, score });
    }
  return out;
}
