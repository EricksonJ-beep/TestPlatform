"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** "Due today", "Due tomorrow" or "Due Nov 21", by the day in the given clock. */
function words(at: Date, timeZone?: string): string {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone });
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (day(at) === day(today)) return "Due today";
  if (day(at) === day(tomorrow)) return "Due tomorrow";
  return `Due ${at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })}`;
}

/**
 * The "do this now" panel's urgency pill (home pages redesign §5.2; Jon, Oct 20 2026: "bring
 * attention to urgent things"): pink with ink text. Worked out in the student's own time zone;
 * the server renders the school's day and the browser corrects it.
 */
export function UrgencyPill({ at, schoolTimeZone }: { at: Date; schoolTimeZone: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => words(new Date(at)),
    () => words(new Date(at), schoolTimeZone)
  );
  return (
    <span
      className="inline-flex min-h-8 items-center rounded-full bg-eosin px-3 text-sm font-bold text-ink"
      data-due
    >
      {text}
    </span>
  );
}
