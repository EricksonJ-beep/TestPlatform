/**
 * Recent activity filters (Jon, Oct 13 2026, dashboard plan decision 10: "kept, with filters
 * (this class | all classes; by kind; logins off by default)"). Pure: which group each logged
 * event belongs to, and the filter as it travels in the Dashboard's address
 * (`/app?feed=all&kinds=tests,pauses&logins=1&days=3`), so a refresh or the live poll keeps it.
 */
import type { ActivityDetail, ActivityKind } from "@/lib/activity-log";

/** The kind chips, in the order they show. Logins are a separate switch, off by default. */
export const FEED_GROUPS = ["tests", "retakes", "corrections", "practice", "pauses"] as const;
export type FeedGroup = (typeof FEED_GROUPS)[number] | "logins";

export const FEED_GROUP_LABEL: Record<FeedGroup, string> = {
  tests: "Tests",
  retakes: "Retakes",
  corrections: "Corrections",
  practice: "Practice",
  pauses: "Pauses",
  logins: "Logins",
};

/** Attempt starts and submits split on the attempt number: try 1 is a test, try 2 on a retake. */
export const ATTEMPT_KINDS = ["attempt_started", "attempt_submitted"] as const;

/** The group of every other kind, whatever its detail. Class joins ride with logins. */
export const KIND_GROUP: Record<
  Exclude<ActivityKind, (typeof ATTEMPT_KINDS)[number]>,
  FeedGroup
> = {
  login: "logins",
  class_joined: "logins",
  corrections_submitted: "corrections",
  practice_completed: "practice",
  activity_completed: "practice",
  retake_requested: "retakes",
  test_paused: "pauses",
  resume_requested: "pauses",
  resumed: "pauses",
};

/** Rule: the one group a logged event belongs to (the SQL filter in `activity-log.ts` mirrors it). */
export function activityGroup(row: { kind: ActivityKind; detail: ActivityDetail }): FeedGroup {
  if (row.kind === "attempt_started" || row.kind === "attempt_submitted")
    return (row.detail.attemptNumber ?? 1) > 1 ? "retakes" : "tests";
  return KIND_GROUP[row.kind];
}

export type FeedFilter = {
  /** "class" = the gradebook's class only; "all" = every class the teacher has. */
  scope: "class" | "all";
  /** The kind chips pressed; none pressed = every kind (logins aside). */
  kinds: (typeof FEED_GROUPS)[number][];
  logins: boolean;
  /** How far back: the last 24 hours, or 3 days ("Show 3 days"). */
  days: 1 | 3;
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The filter from the Dashboard's address. "This class" is the default while the gradebook shows
 * a class (the feed sits under it); without one there is only "All classes". Unknown values fall
 * back to the defaults; pressing every kind chip is the same as pressing none.
 */
export function parseFeedFilter(params: Params, hasClass: boolean): FeedFilter {
  const raw = (one(params.kinds) ?? "").split(",");
  const kinds = FEED_GROUPS.filter((g) => raw.includes(g));
  return {
    scope: hasClass && one(params.feed) !== "all" ? "class" : "all",
    kinds: kinds.length === FEED_GROUPS.length ? [] : kinds,
    logins: one(params.logins) === "1",
    days: one(params.days) === "3" ? 3 : 1,
  };
}

/** The groups a filter shows, for the query. */
export function feedGroups(f: FeedFilter): FeedGroup[] {
  return [...(f.kinds.length ? f.kinds : FEED_GROUPS), ...(f.logins ? (["logins"] as const) : [])];
}

/** The filter as query text (`feed=all&kinds=tests,pauses&logins=1&days=3`); defaults left out. */
export function feedQuery(f: FeedFilter, hasClass: boolean): string {
  const q = new URLSearchParams();
  if (hasClass && f.scope === "all") q.set("feed", "all");
  const kinds = FEED_GROUPS.filter((g) => f.kinds.includes(g));
  if (kinds.length && kinds.length < FEED_GROUPS.length) q.set("kinds", kinds.join(","));
  if (f.logins) q.set("logins", "1");
  if (f.days === 3) q.set("days", "3");
  return q.toString().replace(/%2C/g, ",");
}

/** The Dashboard address for a filter; defaults are left out so a plain `/app` is the default. */
export function feedHref(f: FeedFilter, hasClass: boolean): string {
  const s = feedQuery(f, hasClass);
  return s ? `/app?${s}` : "/app";
}

/** The filter after pressing one kind chip. */
export function toggleKind(f: FeedFilter, g: (typeof FEED_GROUPS)[number]): FeedFilter {
  const kinds = f.kinds.includes(g) ? f.kinds.filter((k) => k !== g) : [...f.kinds, g];
  return { ...f, kinds: kinds.length === FEED_GROUPS.length ? [] : kinds };
}

/**
 * The day an event falls on for "Show 3 days" headings: the school's calendar day (Bloom's school
 * time zone, as the gradebook's times are written), not the UTC date, which would file every
 * event after 7 pm Central under the next day.
 */
export function feedDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
