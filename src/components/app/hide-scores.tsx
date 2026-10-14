"use client";

import { useSyncExternalStore } from "react";
import { cn } from "cn";

/**
 * "Hide scores" (Jon, Oct 13 2026, dashboard plan decision 6: the Dashboard itself is the
 * projector view) covers the whole page: the gradebook, the "Needs you" rows and Recent activity.
 * Remembered per browser; useSyncExternalStore keeps the server render (scores shown) and the
 * browser's choice in sync, and every part of the page reads the same store.
 */
const HIDE_KEY = "bloom.gradebook.hideScores";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether scores are hidden on the Dashboard right now. */
export function useHideScores(): boolean {
  return useSyncExternalStore(subscribe, readHidden, () => false);
}

/** Turn "Hide scores" on or off for this browser; every reader on the page follows. */
export function setHideScores(value: boolean) {
  try {
    localStorage.setItem(HIDE_KEY, value ? "1" : "0");
  } catch {
    /* private mode etc. */
  }
  listeners.forEach((cb) => cb());
}

/**
 * The Dashboard's wrapper: server-rendered parts (Recent activity) mark each score with
 * `group-data-[hide-scores]/scores:hidden`, and this sets the attribute while the switch is on.
 */
export function HideScoresScope({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const hidden = useHideScores();
  return (
    <div className={cn("group/scores", className)} data-hide-scores={hidden ? "" : undefined}>
      {children}
    </div>
  );
}
