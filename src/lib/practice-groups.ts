/**
 * Group the teacher's practice content for /app/practice (Jon, Oct 1 2026):
 * one basket per course, then one collapsible row per unit, with a
 * "Needs attention" row first for anything a unit row would hide: drafts,
 * items with no target, and sets with no questions. Pure.
 */
import { groupByCourse } from "@/lib/group-by-course";
import type { ActivitySummary, PracticeSetSummary } from "@/lib/queries/practice";

export type PracticeItem = PracticeSetSummary | ActivitySummary;

export type UnitGroup = {
  /** Unit id, or "none" for targets without a unit. */
  id: string;
  name: string;
  items: PracticeItem[];
  sets: number;
  activities: number;
};

export type CourseGroup = {
  course: string;
  total: number;
  attention: PracticeItem[];
  units: UnitGroup[];
};

export type AttentionReason = "draft" | "no_target" | "no_questions";

/** Why an item is listed under Needs attention; empty when it files under its unit. */
export function attentionReasons(item: PracticeItem): AttentionReason[] {
  const out: AttentionReason[] = [];
  if (!item.isPublished) out.push("draft");
  if (item.targets.length === 0) out.push("no_target");
  if (item.kind === "practice_set" && item.questions === 0) out.push("no_questions");
  return out;
}

export const ATTENTION_TEXT: Record<AttentionReason, string> = {
  draft: "draft",
  no_target: "no target",
  no_questions: "no questions",
};

export function groupPractice(items: PracticeItem[]): CourseGroup[] {
  return groupByCourse(items).map(({ course, items }) => {
    const attention: PracticeItem[] = [];
    const units = new Map<string, UnitGroup & { sortOrder: number }>();
    for (const item of items) {
      if (attentionReasons(item).length) {
        attention.push(item);
        continue;
      }
      const unit = item.targets[0].unit ?? null;
      const key = unit?.id ?? "none";
      const g =
        units.get(key) ??
        units
          .set(key, {
            id: key,
            name: unit?.name ?? "No unit",
            items: [],
            sets: 0,
            activities: 0,
            sortOrder: unit?.sortOrder ?? Number.MAX_SAFE_INTEGER,
          })
          .get(key)!;
      g.items.push(item);
      if (item.kind === "practice_set") g.sets++;
      else g.activities++;
    }
    return {
      course,
      total: items.length,
      attention,
      units: [...units.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map(({ sortOrder: _s, ...g }) => g),
    };
  });
}

/** Case-insensitive match on title, target code, or target title. */
export function matchesQuery(item: PracticeItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    item.targets.some((t) => t.code.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
  );
}
