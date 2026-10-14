"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";

const WIDE = "(min-width: 640px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * A section that starts collapsed on a phone and open from `sm` up (Jon, Oct 14 2026: "Waiting on
 * your teacher" shouldn't push the tabs off a phone screen). Once the student opens or closes it,
 * their choice holds. Server render is open, so nothing hides without JavaScript.
 */
export function PhoneCollapsible({
  summary,
  children,
  className,
  summaryClassName,
  ...data
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
} & Record<`data-${string}`, string>) {
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => true
  );
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? wide;
  return (
    <details
      open={open}
      onToggle={(e) => {
        if (e.currentTarget.open !== open) setChosen(e.currentTarget.open);
      }}
      className={cn("group", className)}
      {...data}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 select-none [&::-webkit-details-marker]:hidden",
          summaryClassName
        )}
      >
        {summary}
        <ChevronDown
          className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      {children}
    </details>
  );
}
