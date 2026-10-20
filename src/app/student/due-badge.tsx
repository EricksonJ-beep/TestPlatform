"use client";

import { useSyncExternalStore } from "react";
import { cn } from "cn";

const subscribe = () => () => {};

/** Days from today to `at` in the viewer's time zone: 0 today, 1 tomorrow; null on the server. */
function daysAway(at: Date): number | null {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(at) - start(new Date())) / 86_400_000);
}

/**
 * "Due today" / "Due tomorrow" on a home row (Jon, Oct 20 2026: "bring attention to urgent
 * things"), worked out in the student's own time zone, so it shows only after the page loads.
 */
export function DueBadge({ at }: { at: Date }) {
  const days = useSyncExternalStore(
    subscribe,
    () => daysAway(new Date(at)),
    () => null
  );
  if (days !== 0 && days !== 1) return null;
  return (
    <span
      className={cn(
        "self-start rounded-md px-2 py-0.5 text-xs font-bold tracking-wide uppercase",
        days === 0 ? "bg-coral-deep text-white" : "bg-warning-soft text-warning-foreground"
      )}
      data-due={days === 0 ? "today" : "tomorrow"}
    >
      {days === 0 ? "Due today" : "Due tomorrow"}
    </span>
  );
}
