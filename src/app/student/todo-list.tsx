import Link from "next/link";
import { Check, Clock, Hourglass, ListTodo, Lock, TrendingUp, X } from "lucide-react";
import { cn } from "cn";
import type { StudentToDo, ToDoGroup, ToDoRow } from "@/lib/student-home";
import { TYPE_LABEL } from "@/lib/student-home";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { RequestRetakeButton } from "./assignments/[assignmentId]/request-retake-button";
import { PhoneCollapsible } from "./phone-collapsible";

/** Full width and 44px tall below `sm`, so a thumb finds it; normal size from `sm` up. */
const ROW_BUTTON = "h-11 w-full sm:h-9 sm:w-auto";

/**
 * The student home's list (Jon, Oct 14 2026, docs/student-home-plan.md "Student home"): To do
 * (always shown; what "You have N things to do" counts), then "Want a higher score?", then
 * "Waiting on your teacher", collapsed on a phone. Rows come from `buildStudentToDo`.
 */
export function ToDoList({ list }: { list: StudentToDo }) {
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="todo-title"
        className="rounded-lg border border-brand/40 bg-card"
        data-todo-group="todo"
      >
        <GroupHeader id="todo-title" group="todo" count={list.todo.length} />
        {list.todo.length ? (
          <Rows rows={list.todo} />
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Nothing to do right now. New tests and anything your teacher sends back show up here.
          </p>
        )}
      </section>

      {list.higher.length ? (
        <section
          aria-labelledby="higher-title"
          className="rounded-lg border border-border bg-card"
          data-todo-group="higher"
        >
          <GroupHeader id="higher-title" group="higher" count={list.higher.length} />
          <Rows rows={list.higher} />
        </section>
      ) : null}

      {list.waiting.length ? (
        <PhoneCollapsible
          className="rounded-lg border border-border bg-card"
          data-todo-group="waiting"
          summaryClassName="px-4 py-2"
          summary={<GroupTitle group="waiting" count={list.waiting.length} />}
        >
          <div className="border-t border-border">
            <Rows rows={list.waiting} />
          </div>
        </PhoneCollapsible>
      ) : null}
    </div>
  );
}

const GROUP = {
  todo: { title: "To do", icon: ListTodo, tone: "text-brand-deep" },
  higher: { title: "Want a higher score?", icon: TrendingUp, tone: "text-success-foreground" },
  waiting: { title: "Waiting on your teacher", icon: Hourglass, tone: "text-muted-foreground" },
} as const;

function GroupTitle({ group, count, id }: { group: ToDoGroup; count: number; id?: string }) {
  const g = GROUP[group];
  return (
    <h2 id={id} className="flex items-center gap-2 text-sm font-medium">
      <g.icon className={cn("size-4", g.tone)} aria-hidden />
      {g.title}
      <span className="font-normal text-muted-foreground tabular">· {count}</span>
    </h2>
  );
}

function GroupHeader(props: { group: ToDoGroup; count: number; id: string }) {
  return (
    <div className="border-b border-border px-4 py-2">
      <GroupTitle {...props} />
    </div>
  );
}

function Rows({ rows }: { rows: ToDoRow[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <Row key={r.key} r={r} />
      ))}
    </ul>
  );
}

function Row({ r }: { r: ToDoRow }) {
  const a = r.action;
  return (
    <li
      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
      data-todo-kind={r.kind}
      data-assignment={r.assignmentId ?? undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className="text-base font-medium">{r.title}</h3>
          {r.type ? (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {TYPE_LABEL[r.type]}
            </span>
          ) : null}
          {r.className ? (
            <span className="text-xs text-muted-foreground">{r.className}</span>
          ) : null}
        </div>
        {r.why ? <p className="text-sm">{r.why}</p> : null}
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
        {r.progress ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground tabular">
            <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full bg-brand"
                style={{
                  width: `${r.progress.max > 0 ? (r.progress.value / r.progress.max) * 100 : 0}%`,
                }}
              />
            </span>
            {r.progress.label}
          </p>
        ) : null}
      </div>
      {a?.kind === "link" ? (
        <Button
          size="lg"
          variant={a.primary ? "default" : "outline"}
          className={ROW_BUTTON}
          aria-label={`${a.what ?? a.label}: ${r.title}`}
          nativeButton={false}
          render={<Link href={a.href} />}
        >
          {a.label}
        </Button>
      ) : a?.kind === "ask" ? (
        <RequestRetakeButton
          assignmentId={a.assignmentId}
          attemptNumber={a.attemptNumber}
          label={a.label}
          primary={a.primary}
          title={r.title}
          block
        />
      ) : null}
    </li>
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
