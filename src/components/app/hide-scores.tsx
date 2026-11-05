"use client";

import { cn } from "cn";
import { deviceFlag } from "./device-flag";

/**
 * "Hide scores" (Jon, Oct 13 2026, dashboard plan decision 6: the Dashboard itself is the
 * projector view) covers the whole page: the gradebook, the "Needs you" rows and Recent activity.
 * Remembered per browser; every part of the page reads the same store (`deviceFlag`).
 */
const hidden = deviceFlag("bloom.gradebook.hideScores");

/** Whether scores are hidden on the Dashboard right now. */
export const useHideScores = hidden.use;

/** Turn "Hide scores" on or off for this browser; every reader on the page follows. */
export const setHideScores = hidden.set;

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
  const isHidden = useHideScores();
  return (
    <div className={cn("group/scores", className)} data-hide-scores={isHidden ? "" : undefined}>
      {children}
    </div>
  );
}
