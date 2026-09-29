"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowUp, Pause, Play } from "lucide-react";
import { cn } from "cn";
import type { TierBoard, TierCard } from "@/lib/queries/tiers";
import type { ReadinessState } from "@/lib/tiers";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";

/** Dates arrive as strings after the page serializes the initial board and the route returns JSON. */
type Board = Omit<TierBoard, "generatedAt" | "assignment"> & {
  generatedAt: string;
  assignment: Omit<TierBoard["assignment"], "closesAt"> & { closesAt: string | null };
};

const POLL_MS = 7000;

const TIER = {
  1: {
    title: "Tier 1 · Proficient",
    hint: "0 targets below threshold",
    tone: "border-success/50",
    head: "bg-success-soft text-success-foreground",
  },
  2: {
    title: "Tier 2 · Targeted relearning",
    hint: "",
    tone: "border-warning/50",
    head: "bg-warning-soft text-warning-foreground",
  },
  3: {
    title: "Tier 3 · Needs intervention",
    hint: "",
    tone: "border-coral/50",
    head: "bg-coral-soft text-[#B93E27]",
  },
} as const;

const READY: Record<ReadinessState, { label: string; cls: string }> = {
  not_ready: { label: "not ready", cls: "bg-coral-soft text-[#B93E27]" },
  ready: { label: "ready", cls: "bg-success-soft text-success-foreground" },
  proficient: { label: "✓", cls: "bg-muted text-muted-foreground" },
  retaken: { label: "retaken", cls: "bg-brand-soft text-brand-deep" },
};

/**
 * Three columns that refresh on their own (polling every few seconds, only
 * re-rendering when something changed), meant to be projected on a relearning
 * day. Click a card for that student's relearning monitor.
 */
export function TierBoardView({ initial }: { initial: Board }) {
  const router = useRouter();
  const [board, setBoard] = useState<Board>(initial);
  const [live, setLive] = useState(true);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [sortReadiness, setSortReadiness] = useState(true);
  const allPeriods = board.allPeriods;

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(
          `/api/results/${board.assignment.id}/tiers?all=${allPeriods ? 1 : 0}`,
          {
            cache: "no-store",
          }
        );
        if (!r.ok || cancelled) return;
        const next = (await r.json()) as Board;
        setLastPoll(new Date());
        setBoard((prev) =>
          next.version === prev.version && next.allPeriods === prev.allPeriods ? prev : next
        );
      } catch {
        /* the next tick retries */
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [live, board.assignment.id, allPeriods]);

  const columns = useMemo(
    () =>
      [1, 2, 3].map((tier) => ({
        tier: tier as 1 | 2 | 3,
        cards: board.cards.filter((c) => c.tier === tier),
      })),
    [board.cards]
  );
  const tableRows = useMemo(() => {
    const rows = [...board.cards];
    if (sortReadiness)
      rows.sort((a, b) => a.sortKey - b.sortKey || a.lastName.localeCompare(b.lastName));
    else
      rows.sort(
        (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
      );
    return rows;
  }, [board.cards, sortReadiness]);
  const total = board.cards.length;

  return (
    <div className="flex flex-col gap-4" data-tier-board data-version={board.version}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">{board.assignment.title}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular">
            <span>{allPeriods ? "All periods" : board.assignment.className}</span>
            <span>{board.assignment.threshold}% threshold</span>
            <span>Tier 2 up to {board.assignment.tier2Max} below</span>
            <span>
              {board.assignment.status === "open"
                ? "Retake window open"
                : board.assignment.status === "closed"
                  ? "Window closed"
                  : "Not open yet"}
            </span>
            {board.unscored.length ? (
              <span>
                {board.unscored.length} not scored yet
                {board.unscored.some((u) => u.inProgress)
                  ? ` (${board.unscored.filter((u) => u.inProgress).length} in progress)`
                  : ""}
              </span>
            ) : null}
          </p>
        </div>
        {board.periods.length > 1 ? (
          <select
            aria-label="Periods"
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
            value={allPeriods ? "all" : "one"}
            onChange={(e) =>
              router.push(
                `/app/results/${board.assignment.id}/tiers${e.target.value === "all" ? "?all=1" : ""}`
              )
            }
          >
            <option value="one">{board.assignment.className}</option>
            <option value="all">All periods ({board.periods.length})</option>
          </select>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => setLive((l) => !l)} aria-pressed={live}>
          {live ? (
            <Pause data-icon="inline-start" aria-hidden />
          ) : (
            <Play data-icon="inline-start" aria-hidden />
          )}
          {live ? "Live" : "Paused"}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        {columns.map((c) => (
          <div key={c.tier} className={cn("rounded-lg px-3 py-2", TIER[c.tier].head)}>
            <span className="font-heading text-2xl font-semibold tabular" data-tier-count={c.tier}>
              {c.cards.length}
            </span>
            <span className="ml-2 text-xs">
              {total ? Math.round((c.cards.length / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((col) => (
          <section
            key={col.tier}
            className={cn(
              "flex min-h-64 flex-col gap-2 rounded-lg border-2 bg-card p-2",
              TIER[col.tier].tone
            )}
            aria-label={TIER[col.tier].title}
            data-tier-column={col.tier}
          >
            <h2 className="px-1 text-sm font-medium">
              {TIER[col.tier].title}
              <span className="ml-1 font-normal text-muted-foreground">
                {col.tier === 1
                  ? "· 0 below"
                  : col.tier === 2
                    ? `· 1–${board.assignment.tier2Max} below`
                    : `· ${board.assignment.tier2Max + 1}+ below`}
              </span>
            </h2>
            {col.cards.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">Nobody here.</p>
            ) : (
              col.cards.map((c) => (
                <StudentCard
                  key={`${c.assignmentId}:${c.studentId}`}
                  c={c}
                  showPeriod={allPeriods}
                />
              ))
            )}
          </section>
        ))}
      </div>

      <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground tabular">
        <span data-moved-up-week>
          {board.movedUpThisWeek} {board.movedUpThisWeek === 1 ? "student" : "students"} moved up a
          tier this week
        </span>
        {board.mostMissed ? (
          <span>
            Most-missed target:{" "}
            <span className="font-medium text-foreground">
              {board.mostMissed.code} · {board.mostMissed.title}
            </span>{" "}
            ({board.mostMissed.below} below, avg {Math.round(board.mostMissed.average)}%)
          </span>
        ) : null}
        <span className="ml-auto text-xs">
          {live ? `Refreshes every ${POLL_MS / 1000} s` : "Paused"}
          {lastPoll
            ? ` · checked ${lastPoll.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
            : ""}
        </span>
      </p>

      <section className="flex flex-col gap-2" aria-labelledby="readiness-heading">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="readiness-heading" className="text-lg">
            Class readiness
          </h2>
          <button
            type="button"
            className="text-sm font-medium text-brand-deep hover:underline"
            onClick={() => setSortReadiness((s) => !s)}
          >
            {sortReadiness ? "Sorted: least ready first" : "Sorted: by name"}
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-readiness-table>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                {board.targets.map((t) => (
                  <th key={t.id} className="px-2 py-2 text-center font-medium" title={t.title}>
                    {t.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((c) => (
                <tr
                  key={`${c.assignmentId}:${c.studentId}`}
                  className="border-b border-border last:border-0"
                  data-readiness-row={c.studentId}
                >
                  <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                    <Link
                      href={`/app/results/${c.assignmentId}/students/${c.studentId}`}
                      className="hover:underline"
                    >
                      {c.lastName}, {c.firstName}
                    </Link>
                    {showPeriodTag(allPeriods, c.period)}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.stageLabel}</td>
                  {board.targets.map((t) => {
                    const r = c.readiness[t.id];
                    return (
                      <td key={t.id} className="px-2 py-1.5 text-center">
                        {r ? (
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-xs font-medium",
                              READY[r].cls
                            )}
                          >
                            {READY[r].label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function showPeriodTag(show: boolean, period: string) {
  return show ? (
    <span className="ml-1 text-xs font-normal text-muted-foreground">{period}</span>
  ) : null;
}

function StudentCard({ c, showPeriod }: { c: TierCard; showPeriod: boolean }) {
  return (
    <Link
      href={`/app/results/${c.assignmentId}/students/${c.studentId}`}
      className={cn(
        "block rounded-md border border-border bg-background px-3 py-2 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        c.movedUpToday && "ring-2 ring-success/60"
      )}
      data-tier-card={c.studentId}
      data-stage={c.stage}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">
          {c.lastName}, {c.firstName}
        </span>
        {showPeriodTag(showPeriod, c.period)}
        <span className="ml-auto text-xs text-muted-foreground tabular">
          {Math.round(c.percent)}%
        </span>
        {c.movedUpToday ? (
          <span
            className="inline-flex items-center gap-0.5 rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-medium text-success-foreground"
            data-moved-up
          >
            <ArrowUp className="size-3" aria-hidden /> today
          </span>
        ) : null}
      </div>
      {c.required.length || c.optional.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {c.required.map((t) => (
            <TargetChip
              key={t.id}
              code={t.code}
              percent={t.percent}
              tone="required"
              className="h-5"
            />
          ))}
          {c.optional.map((t) => (
            <TargetChip
              key={t.id}
              code={t.code}
              percent={t.percent}
              tone="optional"
              className="h-5"
            />
          ))}
        </div>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">{c.stageLabel}</p>
    </Link>
  );
}
