"use client";

import { useState } from "react";
import { Route } from "lucide-react";
import { useAction } from "@/components/use-action";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";
import { setCourseRelearningPath } from "../actions";

/**
 * The relearning path's course switch (relearning revamp L1). Off, it shows a date to start from;
 * scheduled, the date and a way to cancel; on, since when. A CVTC course keeps its own rules, so
 * the switch is shown but has no effect there.
 */
export function RelearningPathSetting({
  courseId,
  from,
  state,
  cvtcRules,
  today,
}: {
  courseId: string;
  from: Date | null;
  state: "off" | "scheduled" | "on";
  cvtcRules: boolean;
  /** Today's date in the school's time zone ("2026-11-04"), the earliest pick. */
  today: string;
}) {
  const { run, pending, error } = useAction();
  const [date, setDate] = useState(today);
  return (
    <section
      className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
      aria-labelledby="path-title"
      data-relearning-path={state}
    >
      <Route className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="mr-auto flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <span>
          <span id="path-title" className="font-medium">
            New relearning path
          </span>
          <span className="block text-xs text-muted-foreground">
            Corrections, then Read · Watch · Do, then a 5-question practice check. A quiz is raised
            to 80% when it&apos;s done; a test unlocks its retake. Quizzes and tests whose first
            attempt is taken from this date follow it; ones taken before keep the old rules. Turn it
            on for Physical Science and Biology together, once their content is ready.
          </span>
          {cvtcRules ? (
            <span className="mt-1 block text-xs text-warning-foreground">
              CVTC rules are on for this course, so it keeps them and the new path doesn&apos;t
              apply.
            </span>
          ) : null}
        </span>
        {state === "on" && from ? (
          <span data-path-on>
            On since <LocalTime date={from} mode="date" />.
          </span>
        ) : state === "scheduled" && from ? (
          <span className="flex flex-wrap items-center gap-2" data-path-scheduled>
            Starts <LocalTime date={from} mode="date" />.
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(setCourseRelearningPath(courseId, null))}
            >
              Cancel
            </Button>
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <label htmlFor="path-date" className="text-muted-foreground">
              Start on
            </label>
            <input
              id="path-date"
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2"
            />
            <Button
              size="sm"
              disabled={pending || !date}
              onClick={() => run(setCourseRelearningPath(courseId, date))}
              data-path-start
            >
              {date === today ? "Turn on now" : "Schedule it"}
            </Button>
          </span>
        )}
        {error ? <span className="text-error-foreground">{error}</span> : null}
      </div>
      <span
        className={`rounded-md px-2 py-0.5 text-xs font-medium ${state === "on" ? "bg-brand-soft text-brand-deep" : state === "scheduled" ? "bg-warning-soft text-warning-foreground" : "bg-muted text-muted-foreground"}`}
      >
        {pending ? "Saving…" : state === "on" ? "On" : state === "scheduled" ? "Scheduled" : "Off"}
      </span>
    </section>
  );
}
