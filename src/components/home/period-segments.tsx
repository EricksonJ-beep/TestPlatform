"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "cn";
import type { PeriodOption } from "@/lib/current-course";
import { hourLabel } from "@/lib/teacher-home";
import { pickDashboardClass } from "@/app/app/actions";
import { segmented } from "./ui";

/**
 * The class periods of the sidebar course as a segmented control ("1st hour", "3rd hour");
 * picking one is remembered (`pickDashboardClass`, dashboard plan decision 8).
 */
export function PeriodSegments({
  classes,
  currentId,
}: {
  classes: PeriodOption[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = pending && picked ? picked : currentId;
  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <div className={segmented.track} role="group" aria-label="Class period">
        {classes.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.name}
            aria-pressed={c.id === shown}
            data-period={c.id}
            disabled={pending}
            className={cn(segmented.segment, c.id === shown ? segmented.on : segmented.off)}
            onClick={() => {
              if (c.id === currentId) return;
              setPicked(c.id);
              setError(null);
              start(async () => {
                // The action revalidates /app, which already re-renders this page with the new
                // period; a second refresh on top would render it all twice.
                const r = await pickDashboardClass(c.id);
                if (!r.ok) {
                  setError(r.error);
                  router.refresh();
                }
              });
            }}
          >
            {hourLabel(c)}
          </button>
        ))}
      </div>
      {error ? <span className="text-[13px] text-eosin-text">{error}</span> : null}
    </div>
  );
}
