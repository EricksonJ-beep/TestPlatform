import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "cn";
import {
  BANDS,
  DEAL_NEED,
  THIN_DEALS,
  bandSummary,
  healthFlags,
  type BandStatus,
  type BankHealth,
} from "@/lib/bank-health";
import { TYPE_LABEL } from "@/lib/question-types";

const CHIP: Record<BandStatus, string> = {
  short: "bg-error-soft text-error-foreground",
  thin: "bg-warning-soft text-warning-foreground",
  ok: "bg-success-soft text-success-foreground",
};
const CHIP_TEXT: Record<BandStatus, string> = {
  short: "Can't fill a deal",
  thin: "Thin",
  ok: "Healthy",
};

/** The Practice bank card's line: the band counts and one chip, with the flags as its tooltip. */
export function BankHealthLine({ health }: { health: BankHealth }) {
  const summary = bandSummary(health);
  const flags = healthFlags(health);
  return (
    <p
      className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular"
      data-bank-health={health.worst}
    >
      {summary ? <span>{summary}</span> : null}
      <span
        className={cn("rounded-md px-1.5 py-0.5 font-medium", CHIP[health.worst])}
        title={flags.map((f) => f.text).join("\n") || undefined}
      >
        {CHIP_TEXT[health.worst]}
      </span>
    </p>
  );
}

/** The bank page's panel: one row per target, its bands against a deal, and its question types. */
export function BankHealthPanel({ health }: { health: BankHealth }) {
  const flags = healthFlags(health);
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      data-bank-health-panel={health.worst}
      aria-labelledby="bank-health-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="bank-health-heading" className="text-base font-medium">
          Bank health
        </h2>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
            CHIP[health.worst]
          )}
        >
          {health.worst === "ok" ? (
            <CheckCircle2 className="size-3.5" aria-hidden />
          ) : (
            <AlertTriangle className="size-3.5" aria-hidden />
          )}
          {CHIP_TEXT[health.worst]}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        What practice checks can draw: live, auto-graded questions tagged to a target. Each deal
        takes {DEAL_NEED.easy} easy, {DEAL_NEED.medium} medium and {DEAL_NEED.hard} hard. Fewer
        can&apos;t fill a deal; under {THIN_DEALS} deals&apos; worth is thin (repeats come sooner).
      </p>
      {health.targets.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Target</th>
                {BANDS.map((b) => (
                  <th key={b} className="py-1.5 pr-3 font-medium capitalize">
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {health.targets.map((t) => (
                <tr key={t.id} className="border-t border-border" data-health-target={t.code}>
                  <td className="py-2 pr-3 align-top">
                    <span className="font-medium">{t.code}</span>
                    <span className="block text-xs text-muted-foreground">{t.title}</span>
                    <span className="block text-xs text-muted-foreground" data-health-types>
                      {t.types
                        .map((x) => `${x.count} ${TYPE_LABEL[x.type].toLowerCase()}`)
                        .join(" · ")}
                    </span>
                  </td>
                  {BANDS.map((b) => (
                    <td key={b} className="py-2 pr-3 align-top">
                      <span
                        className={cn(
                          "inline-block min-w-8 rounded-md px-1.5 py-0.5 text-center",
                          t.status[b] === "ok" ? "" : CHIP[t.status[b]]
                        )}
                        title={t.status[b] === "ok" ? undefined : CHIP_TEXT[t.status[b]]}
                        data-band={b}
                        data-band-status={t.status[b]}
                      >
                        {t.bands[b]}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {flags.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {flags.map((f) => (
            <li key={f.text} className="flex items-start gap-1.5">
              <AlertTriangle
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  f.status === "short" ? "text-error" : "text-warning"
                )}
                aria-hidden
              />
              {f.text}
            </li>
          ))}
        </ul>
      ) : null}
      {health.notAutoGraded || health.untagged ? (
        <p className="text-xs text-muted-foreground">
          Not drawn by checks:{" "}
          {[
            health.notAutoGraded ? `${health.notAutoGraded} teacher-graded or short-answer` : null,
            health.untagged ? `${health.untagged} not tagged to a learning target` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          .
        </p>
      ) : null}
    </section>
  );
}
