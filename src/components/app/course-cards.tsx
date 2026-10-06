"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "cn";
import type { ActionResult } from "@/lib/authz";
import { courseInitials } from "@/lib/course-focus";
import type { CourseCard } from "@/lib/queries/dashboard";

/**
 * Dashboard course cards (docs/course-focus-plan.md, ticket 6): the Dashboard
 * always shows every course; each card is the door into one. Clicking focuses
 * that course and opens its Practice page. Coral numbers are things waiting.
 */
export function CourseCards({
  cards,
  currentId,
  pick,
}: {
  cards: CourseCard[];
  currentId: string | null;
  pick: (courseId: string | null) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (cards.length === 0) return null;

  function enter(id: string) {
    start(async () => {
      if (id !== currentId) {
        const r = await pick(id);
        if (!r.ok) return;
      }
      router.push("/app/practice");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Your courses" data-course-cards>
      <h2 className="text-lg">Your courses</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const waiting = c.needsGrading + c.correctionsAwaiting;
          const isCurrent = c.id === currentId;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => enter(c.id)}
                disabled={pending}
                data-course-card={c.id}
                aria-current={isCurrent ? "true" : undefined}
                className={cn(
                  "flex h-full w-full flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70",
                  isCurrent ? "border-brand" : "border-border"
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-md bg-coral text-sm font-bold text-white"
                  >
                    {courseInitials(c.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base leading-tight font-medium">
                      {c.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {isCurrent ? "In focus" : "Open this course"}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs text-muted-foreground tabular">
                  <div>
                    <dt>Classes</dt>
                    <dd className="text-base font-semibold text-foreground">{c.classes}</dd>
                  </div>
                  <div>
                    <dt>Open tests</dt>
                    <dd className="text-base font-semibold text-foreground">{c.openTests}</dd>
                  </div>
                  <div>
                    <dt>Practice</dt>
                    <dd className="text-base font-semibold text-foreground">{c.practice}</dd>
                  </div>
                </dl>
                <p
                  className={cn(
                    "text-xs",
                    waiting > 0 ? "font-medium text-coral-deep" : "text-muted-foreground"
                  )}
                >
                  {waiting === 0
                    ? "Nothing waiting"
                    : [
                        c.needsGrading ? `${c.needsGrading} to grade` : null,
                        c.correctionsAwaiting
                          ? `${c.correctionsAwaiting} ${c.correctionsAwaiting === 1 ? "correction set" : "correction sets"}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
