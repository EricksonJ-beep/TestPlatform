import { Check, Clock, Lock, X } from "lucide-react";
import { cn } from "cn";
import { showsScore, TYPE_LABEL, type ToDoRow } from "@/lib/student-home";
import { LocalTime } from "@/components/local-time";

/**
 * One to-do row's words (Jon, Oct 14 2026, docs/student-home-plan.md): the title, why it's on the
 * list, the teacher's note, a summative's checklist, when, and progress. The student home and the
 * teacher's student panel both render it, so the teacher reads exactly what the student reads.
 * `hideScores` (the teacher's "Hide scores", decision 6) reads the why line without the student's
 * scores and drops any other line that shows a percent.
 */
export function ToDoRowBody({
  r,
  hideScores = false,
  heading: Heading = "h3",
}: {
  r: ToDoRow;
  hideScores?: boolean;
  /** The title's level where the list sits deeper (the teacher's panel). */
  heading?: "h3" | "h4";
}) {
  const why = hideScores && r.why && showsScore(r.why) ? r.whyWithoutScores : r.why;
  const progress = r.progress && !(hideScores && showsScore(r.progress.label)) ? r.progress : null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Heading className="text-base font-medium">{r.title}</Heading>
        {r.type ? (
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {TYPE_LABEL[r.type]}
          </span>
        ) : null}
        {r.className ? <span className="text-xs text-muted-foreground">{r.className}</span> : null}
      </div>
      {why ? <p className="text-sm">{why}</p> : null}
      {r.note ? (
        <p className="rounded-md bg-warning-soft px-2 py-1 text-sm text-warning-foreground">
          Your teacher: “{r.note}”
        </p>
      ) : null}
      {r.checklist.length ? (
        <ul className="flex flex-col gap-0.5 text-xs" aria-label="Relearning checklist">
          {r.checklist.map((t) => (
            <li key={t.code} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="font-medium tabular">{t.code}</span>
              <Gate label="corrections" ok={t.corrections} />
              <Gate label="activity" ok={t.activity} />
              <Gate label="practice" ok={t.practice} />
            </li>
          ))}
        </ul>
      ) : null}
      <Meta r={r} />
      {progress ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground tabular">
          <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className="block h-full bg-brand"
              style={{
                width: `${progress.max > 0 ? (progress.value / progress.max) * 100 : 0}%`,
              }}
            />
          </span>
          {progress.label}
        </p>
      ) : null}
    </div>
  );
}

function Meta({ r }: { r: ToDoRow }) {
  if (!r.when && !r.minutes && !r.needsCode) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {r.when ? (
        <span data-when>
          {r.when.label} <LocalTime date={r.when.at} />
        </span>
      ) : null}
      {r.minutes ? (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          {r.minutes} min
        </span>
      ) : null}
      {r.needsCode ? (
        <span className="inline-flex items-center gap-1">
          <Lock className="size-3.5" aria-hidden />
          Code from your teacher
        </span>
      ) : null}
    </p>
  );
}

function Gate({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        ok ? "text-success-foreground" : "text-muted-foreground"
      )}
    >
      {label}
      {ok ? (
        <Check className="size-3.5" aria-label="done" />
      ) : (
        <X className="size-3.5" aria-label="not yet" />
      )}
    </span>
  );
}
