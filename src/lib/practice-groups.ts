/**
 * Group the teacher's practice content for /app/practice (Jon, Oct 1 2026):
 * one basket per course, then one collapsible row per unit, with a
 * "Needs attention" row first for anything a unit row would hide: drafts,
 * items with no target, and sets with no questions. Pure.
 */
import { groupByCourse } from "@/lib/group-by-course";
import type { ActivitySummary, PracticeSetSummary } from "@/lib/queries/practice";
import type { UnitRef } from "@/lib/unit-shelves";

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

/**
 * `allUnits` (Jon, Oct 6 2026: "add Unit 1, 3, 4, 5, 6 … so they are ready to
 * go"): every unit of each course gets a row, empty ones included, so there is
 * always a place to look for (and later drop) a unit's practice. Without it,
 * only units that already hold something are listed.
 */
export function groupPractice(items: PracticeItem[], allUnits: UnitRef[] = []): CourseGroup[] {
  return groupByCourse(items).map(({ course, items }) => {
    const attention: PracticeItem[] = [];
    const units = new Map<string, UnitGroup & { sortOrder: number }>();
    const courseIds = new Set(items.map((i) => i.courseId));
    for (const u of allUnits) {
      if (!courseIds.has(u.courseId)) continue;
      units.set(u.id, {
        id: u.id,
        name: u.name,
        items: [],
        sets: 0,
        activities: 0,
        sortOrder: u.sortOrder,
      });
    }
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

export type UnitBucket<T> = { id: string; name: string; items: T[] };

/**
 * Student side (Jon, Oct 2 2026): bucket a course's published practice by
 * unit, like Google Classroom topics, in unit order; items whose target has
 * no unit go last under "Other practice". Order within a unit is kept.
 */
export function groupByUnit<
  T extends { targets: { unit?: { id: string; name: string; sortOrder: number } | null }[] },
>(items: T[]): UnitBucket<T>[] {
  const buckets = new Map<string, UnitBucket<T> & { sortOrder: number }>();
  for (const item of items) {
    const unit = item.targets[0]?.unit ?? null;
    const key = unit?.id ?? "none";
    const b =
      buckets.get(key) ??
      buckets
        .set(key, {
          id: key,
          name: unit?.name ?? "Other practice",
          items: [],
          sortOrder: unit?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        })
        .get(key)!;
    b.items.push(item);
  }
  return [...buckets.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ sortOrder: _s, ...b }) => b);
}
