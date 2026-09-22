"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function format(d: Date, mode: "datetime" | "date" | "time"): string {
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
  mode?: "datetime" | "date" | "time";
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
