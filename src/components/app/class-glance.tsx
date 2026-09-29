import Link from "next/link";
import type { GlanceRow } from "@/lib/queries/tiers";

/** Dashboard strip (PLAN.md §3.11): each recent summative with its tier counts, linking to the board. */
export function ClassGlance({ rows }: { rows: GlanceRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="glance-heading" data-class-glance>
      <h2 id="glance-heading" className="text-sm font-medium text-muted-foreground">
        Class at a glance
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const total = r.counts[1] + r.counts[2] + r.counts[3];
          return (
            <li key={r.assignmentId}>
              <Link
                href={`/app/results/${r.assignmentId}/tiers`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{r.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {r.className}
                  </span>
                </div>
                <div
                  className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  {total ? (
                    <>
                      <div
                        className="bg-success"
                        style={{ width: `${(r.counts[1] / total) * 100}%` }}
                      />
                      <div
                        className="bg-warning"
                        style={{ width: `${(r.counts[2] / total) * 100}%` }}
                      />
                      <div
                        className="bg-coral"
                        style={{ width: `${(r.counts[3] / total) * 100}%` }}
                      />
                    </>
                  ) : null}
                </div>
                <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular">
                  <span className="text-success-foreground">Tier 1 · {r.counts[1]}</span>
                  <span className="text-warning-foreground">Tier 2 · {r.counts[2]}</span>
                  <span className="text-[#B93E27]">Tier 3 · {r.counts[3]}</span>
                  {r.unscored ? <span>{r.unscored} not scored</span> : null}
                  {r.movedUpThisWeek ? <span>↑ {r.movedUpThisWeek} this week</span> : null}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
