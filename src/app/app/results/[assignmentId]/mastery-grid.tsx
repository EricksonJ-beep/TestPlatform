import Link from "next/link";
import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { richTextToPlain } from "@/lib/richtext";
import {
  classAverages,
  HARD_QUESTION_MAX,
  HEAT_LABEL,
  heatBand,
  type HeatBand,
} from "@/lib/mastery";
import type { ItemStat, MasteryGrid } from "@/lib/queries/results";

/** Cell colors per band; dark text on the pale fills, white on the strong ones. */
const HEAT_CLASS: Record<HeatBand, string> = {
  full: "bg-success text-white",
  high: "bg-success-soft text-success-foreground",
  mid: "bg-warning-soft text-warning-foreground",
  low: "bg-error text-white",
};

/** Students down the side, one column per learning target, heat-coded by best percent. */
export function MasteryHeatmap({ grid }: { grid: MasteryGrid }) {
  const { targets, rows } = grid;
  const avg = classAverages(
    targets.map((t) => t.id),
    rows
  );
  return (
    <section className="flex flex-col gap-3" aria-labelledby="mastery-heading">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="mastery-heading" className="text-lg">
          Mastery by learning target
        </h2>
        <ul className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(HEAT_CLASS) as HeatBand[]).map((b) => (
            <li key={b} className="flex items-center gap-1">
              <span className={`inline-block size-3 rounded-sm ${HEAT_CLASS[b]}`} aria-hidden />
              {HEAT_LABEL[b]}
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm" data-mastery-grid>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Student
              </th>
              {targets.map((t) => (
                <th
                  key={t.id}
                  scope="col"
                  className="px-2 py-2 text-center font-medium"
                  title={t.title}
                >
                  {t.code}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Overall
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.studentId} className="border-b border-border last:border-0">
                <th scope="row" className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                  {s.lastName}, {s.firstName}
                </th>
                {targets.map((t) => {
                  const p = s.percents[t.id];
                  if (p === undefined)
                    return (
                      <td key={t.id} className="px-2 py-1.5 text-center text-muted-foreground">
                        —
                      </td>
                    );
                  const band = heatBand(p);
                  return (
                    <td key={t.id} className="p-1">
                      <span
                        className={`block rounded-md py-1 text-center font-semibold tabular ${HEAT_CLASS[band]}`}
                        data-band={band}
                      >
                        {Math.round(p)}%
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-semibold tabular">
                  {s.overall === null ? (
                    <span className="font-normal text-muted-foreground">—</span>
                  ) : (
                    `${Math.round(s.overall)}%`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40" data-class-average>
                <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  Class average
                  {avg.overall ? (
                    <span className="block text-xs font-normal text-muted-foreground tabular">
                      {avg.overall.students} {avg.overall.students === 1 ? "student" : "students"}{" "}
                      with a score
                    </span>
                  ) : null}
                </th>
                {targets.map((t) => {
                  const a = avg.byTarget[t.id];
                  if (!a)
                    return (
                      <td key={t.id} className="px-2 py-2 text-center text-muted-foreground">
                        —
                      </td>
                    );
                  const band = heatBand(a.average);
                  return (
                    <td key={t.id} className="p-1">
                      <span
                        className={`block rounded-md py-1 text-center font-semibold tabular ${HEAT_CLASS[band]}`}
                        data-band={band}
                        title={`${a.students} ${a.students === 1 ? "student" : "students"}`}
                      >
                        {Math.round(a.average)}%
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-semibold tabular" data-class-overall>
                  {avg.overall ? (
                    `${Math.round(avg.overall.average)}%`
                  ) : (
                    <span className="font-normal text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}

/** Questions the class got right half the time or less: bad item, or a real gap. */
export function HardQuestions({
  items,
  assignmentId,
}: {
  items: ItemStat[];
  assignmentId?: string;
}) {
  const hard = items.filter((i) => i.rate !== null && i.rate <= HARD_QUESTION_MAX);
  const back = assignmentId ? `?back=${encodeURIComponent(`/app/results/${assignmentId}`)}` : "";
  return (
    <section className="flex flex-col gap-3" aria-labelledby="hard-heading">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 id="hard-heading" className="text-lg">
            Questions under 50% correct
          </h2>
          <p className="text-sm text-muted-foreground">
            Across every submitted attempt. Worth a look: is it a poor question, or something to
            reteach?
          </p>
        </div>
        {assignmentId && items.length > 0 ? (
          <Button
            nativeButton={false}
            render={<Link href={`/app/results/${assignmentId}/review`} />}
          >
            <Presentation data-icon="inline-start" aria-hidden />
            Review with the class
          </Button>
        ) : null}
      </div>
      {hard.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {items.length === 0 ? "No submissions yet." : "None — every question is above 50%."}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {hard.map((q) => (
            <li key={q.questionId} className="flex items-start gap-3 px-4 py-3" data-hard-question>
              <span className="mt-0.5 inline-flex min-w-12 justify-center rounded-md bg-error-soft px-2 py-0.5 text-xs font-semibold text-error-foreground tabular">
                {Math.round((q.rate ?? 0) * 100)}%
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{richTextToPlain(q.stem)}</p>
                <p className="text-xs text-muted-foreground tabular">
                  {q.targetCode ? `${q.targetCode} · ` : ""}
                  {q.correct} of {q.answered} correct · {q.type.replace(/_/g, " ")} ·{" "}
                  <Link
                    href={`/app/banks/${q.bankId}/questions/${q.questionId}${back}`}
                    className="font-medium text-brand-deep hover:underline"
                  >
                    Edit question
                  </Link>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
