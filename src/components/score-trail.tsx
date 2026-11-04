import { cn } from "cn";
import { trailDetail, trailText, type ScoreStep } from "@/lib/score-trail";

/**
 * A score's trail, "40 → 80 → 95" (relearning revamp G1, R7), every step named and dated in the
 * tooltip and for screen readers. `prefix` leads the visible words ("from").
 */
export function ScoreTrail({
  steps,
  prefix,
  className,
}: {
  steps: ScoreStep[];
  prefix?: string;
  className?: string;
}) {
  const detail = trailDetail(steps);
  return (
    <span className={cn("tabular", className)} title={detail} data-trail>
      <span aria-hidden>
        {prefix ? `${prefix} ` : null}
        {trailText(steps)}
      </span>
      <span className="sr-only">Score history: {detail}</span>
    </span>
  );
}

/** The trail as a list, one step per line: "80% · relearning path · Nov 4". */
export function ScoreTrailList({ steps }: { steps: ScoreStep[] }) {
  const day = (d: Date) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "America/Chicago",
    });
  return (
    <ol className="flex flex-col gap-0.5 text-sm" data-trail-list>
      {steps.map((s, i) => (
        <li key={`${s.label}:${i}`} className="tabular">
          <span className={cn(i === steps.length - 1 && "font-semibold")}>
            {Math.round(s.percent)}%
          </span>{" "}
          <span className="text-muted-foreground">
            · {s.label} · {day(s.at)}
          </span>
        </li>
      ))}
    </ol>
  );
}
