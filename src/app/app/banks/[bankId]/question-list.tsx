import { TargetChip } from "@/components/targets/target-chip";
import { Badge } from "@/components/ui/badge";
import type { BankQuestionRow } from "@/lib/queries/banks";
import { BLOOM_LABEL, TYPE_LABEL } from "@/lib/question-types";

function gradingSummary(q: BankQuestionRow): string | null {
  const c = (q.gradingConfig ?? {}) as Record<string, unknown>;
  switch (q.type) {
    case "fill_blank":
      return `Accepted: ${((c.acceptedAnswers as string[]) ?? []).join(" | ")}`;
    case "short_answer":
      return (c.keywords as string[])?.length
        ? `Keywords: ${(c.keywords as string[]).join(" | ")}`
        : "Graded by hand";
    case "numeric": {
      const unit = c.unit ? ` ${c.unit}` : "";
      if (c.mode === "range") return `Answer: ${c.min}–${c.max}${unit}`;
      if (c.mode === "tolerance") return `Answer: ${c.answer}${unit} ± ${c.tolerance}`;
      if (c.mode === "percent_tolerance") return `Answer: ${c.answer}${unit} ± ${c.percent}%`;
      return `Answer: ${c.answer}${unit}`;
    }
    case "extended_response":
      return "Graded by hand";
    default:
      return null;
  }
}

/** Read-only question list with expandable details. Editing arrives in Ticket 1.3. */
export function QuestionList({ questions }: { questions: BankQuestionRow[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {questions.map((q) => {
        const summary = gradingSummary(q);
        return (
          <li key={q.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 text-sm hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                <Badge variant="secondary" className="mt-0.5 shrink-0">
                  {TYPE_LABEL[q.type]}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2">{q.stem}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {q.targets.map((t) => (
                      <TargetChip key={t.id} code={t.code} title={t.title} />
                    ))}
                    {q.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs leading-5 text-muted-foreground tabular">
                  <div>
                    {q.points} {q.points === 1 ? "pt" : "pts"}
                  </div>
                  <div>
                    D{q.difficulty}
                    {q.bloom ? ` · ${BLOOM_LABEL[q.bloom]}` : ""}
                  </div>
                </div>
              </summary>
              <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                {q.options.length ? (
                  <ol className="mb-2 grid gap-1">
                    {q.options.map((o, i) => (
                      <li
                        key={i}
                        className={o.isCorrect ? "font-medium text-success-foreground" : ""}
                      >
                        <span className="mr-2 tabular">{String.fromCharCode(97 + i)}.</span>
                        {o.content}
                        {o.matchText ? (
                          <span className="text-muted-foreground"> :: {o.matchText}</span>
                        ) : null}
                        {o.correctPosition ? (
                          <span className="text-muted-foreground">
                            {" "}
                            (position {o.correctPosition})
                          </span>
                        ) : null}
                        {o.isCorrect ? " ✓" : ""}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {summary ? <p className="mb-1">{summary}</p> : null}
                {q.explanation ? (
                  <p className="mb-1">
                    <span className="font-medium">Explanation:</span> {q.explanation}
                  </p>
                ) : null}
                {q.mediaUrl ? <p className="truncate">Image: {q.mediaUrl}</p> : null}
                {q.videoUrl ? <p className="truncate">Video: {q.videoUrl}</p> : null}
                <p className="mt-2 text-xs">
                  {[
                    q.topic,
                    q.stimulusRef ? `Stimulus: ${q.stimulusRef}` : null,
                    q.externalId ? `ID ${q.externalId}` : null,
                    `v${q.version}`,
                    q.grading === "manual" ? "manual grading" : "auto-graded",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
