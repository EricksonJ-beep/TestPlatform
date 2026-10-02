"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ExternalLink, FileText, Layers, Link2, PlayCircle, Puzzle } from "lucide-react";
import { cn } from "cn";
import { KIND_LABEL, STATE_LABEL, type PracticeItemState } from "@/lib/practice-rules";
import type { StudentActivity, StudentPracticeSet } from "@/lib/queries/practice";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { startPractice } from "./practice/actions";

const ICON = {
  video: PlayCircle,
  reading: BookOpen,
  link: Link2,
  guided_notes: FileText,
  interactive: Puzzle,
  worksheet: FileText,
} as const;

const PILL: Record<PracticeItemState, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-brand-soft text-brand-deep",
  done: "bg-success-soft text-success-foreground",
  awaiting_teacher: "bg-warning-soft text-warning-foreground",
};

function Pill({ state }: { state: PracticeItemState }) {
  return (
    <span
      className={cn("rounded-md px-2 py-0.5 text-xs font-medium", PILL[state])}
      data-state={state}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

export function ActivityCard({ a, compact = false }: { a: StudentActivity; compact?: boolean }) {
  const Icon = ICON[a.kind];
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card",
        compact ? "px-3 py-2" : "p-4"
      )}
      data-activity={a.id}
    >
      <Icon className="size-5 shrink-0 text-brand-deep" aria-hidden />
      <div className="mr-auto min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("font-medium", compact ? "text-sm" : "text-base")}>{a.title}</h3>
          <Pill state={a.state} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{KIND_LABEL[a.kind]}</span>
          {a.targets.map((t) => (
            <TargetChip key={t.id} code={t.code} title={t.title} className="h-5" />
          ))}
        </p>
      </div>
      <Button
        size={compact ? "sm" : "lg"}
        variant={a.state === "not_started" ? "default" : "outline"}
        nativeButton={false}
        render={<Link href={`/student/activities/${a.id}`} />}
      >
        {a.state === "not_started" ? "Open" : "View"}
      </Button>
    </li>
  );
}

export function PracticeSetCard({
  s,
  compact = false,
}: {
  s: StudentPracticeSet;
  compact?: boolean;
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const label =
    s.state === "in_progress" ? "Continue" : s.state === "done" ? "Practice again" : "Start";
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card",
        compact ? "px-3 py-2" : "p-4"
      )}
      data-practice-set={s.id}
    >
      <Layers className="size-5 shrink-0 text-brand-deep" aria-hidden />
      <div className="mr-auto min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("font-medium", compact ? "text-sm" : "text-base")}>{s.title}</h3>
          <Pill state={s.state} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular">
          {s.isWorksheet ? (
            <span>Worksheet · completes when you submit it</span>
          ) : (
            <span>
              Practice set · {s.questions} {s.questions === 1 ? "question" : "questions"}
            </span>
          )}
          {s.bestPercent !== null ? <span>· best {Math.round(s.bestPercent)}%</span> : null}
          {s.attempts > 0 ? (
            <span>
              · {s.attempts} {s.attempts === 1 ? "try" : "tries"}
            </span>
          ) : null}
          {s.targets.map((t) => (
            <TargetChip key={t.id} code={t.code} title={t.title} className="h-5" />
          ))}
        </p>
        {!compact && s.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-error-foreground">{error}</p> : null}
      </div>
      {s.isWorksheet && !s.worksheetUrl ? (
        <span className="text-xs text-muted-foreground">Link coming from your teacher</span>
      ) : s.worksheetUrl ? (
        <Button
          size={compact ? "sm" : "lg"}
          variant={s.state === "done" ? "outline" : "default"}
          nativeButton={false}
          render={<a href={s.worksheetUrl} target="_blank" rel="noreferrer" />}
        >
          <ExternalLink data-icon="inline-start" aria-hidden />
          Open worksheet
        </Button>
      ) : (
        <Button
          size={compact ? "sm" : "lg"}
          variant={s.state === "done" ? "outline" : "default"}
          disabled={pending}
          onClick={() =>
            run(startPractice(s.id), ({ attemptId }) =>
              router.push(`/student/practice/${attemptId}`)
            )
          }
        >
          {pending ? "Opening…" : label}
        </Button>
      )}
    </li>
  );
}
