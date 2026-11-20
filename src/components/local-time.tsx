"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export type TimeMode = "datetime" | "date" | "time" | "at" | "day-at";

/** Days from today to `d` in the viewer's time zone: 0 today, 1 tomorrow. */
function daysAway(d: Date): number {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(d) - start(new Date())) / 86_400_000);
}

function format(d: Date, mode: TimeMode): string {
  // "at 2:45 PM" today, "Nov 21 at 2:45 PM" on another day; "day-at" names today and tomorrow.
  if (mode === "at" || mode === "day-at") {
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const days = daysAway(d);
    if (days === 0) return mode === "at" ? `at ${time}` : `today at ${time}`;
    if (days === 1 && mode === "day-at") return `tomorrow at ${time}`;
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${time}`;
  }
  if (mode === "date") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (mode === "time")
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Renders a timestamp in the viewer's time zone without a hydration mismatch:
 * the server snapshot is a neutral UTC string, swapped for local time on the client.
 */
export function LocalTime({
  date,
  mode = "datetime",
  className,
}: {
  date: Date | string | null | undefined;
  mode?: TimeMode;
  className?: string;
}) {
  const d = date ? new Date(date) : null;
  const text = useSyncExternalStore(
    subscribe,
    () => (d ? format(d, mode) : ""),
    () => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "")
  );
  if (!d) return null;
  return (
    <time dateTime={d.toISOString()} className={className}>
      {text}
    </time>
  );
}

/** The browser's UTC offset in minutes (0 during server render), for datetime-local forms. */
export function useTzOffset(): number {
  return useSyncExternalStore(
    subscribe,
    () => new Date().getTimezoneOffset(),
    () => 0
  );
}
