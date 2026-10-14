import Link from "next/link";
import { Hourglass, ListTodo, TrendingUp } from "lucide-react";
import { cn } from "cn";
import type { StudentToDo, ToDoGroup, ToDoRow } from "@/lib/student-home";
import { ToDoRowBody } from "@/components/todo-row";
import { Button } from "@/components/ui/button";
import { AskAnnouncer } from "./ask-announcer";
import { RequestRetakeButton } from "./assignments/[assignmentId]/request-retake-button";
import { PhoneCollapsible } from "./phone-collapsible";

/** Full width and 44px tall below `sm`, so a thumb finds it; normal size from `sm` up. */
const ROW_BUTTON = "h-11 w-full sm:h-9 sm:w-auto";

/**
 * The student home's list (Jon, Oct 14 2026, docs/student-home-plan.md "Student home"): To do
 * (always shown; what "You have N things to do" counts), then "Want a higher score?", then
 * "Waiting on your teacher", collapsed on a phone. Rows come from `buildStudentToDo`. Asking to
 * retake from a row is announced, and focus follows the row to Waiting (`AskAnnouncer`).
 */
export function ToDoList({ list }: { list: StudentToDo }) {
  return (
    <AskAnnouncer>
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
    </AskAnnouncer>
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
      <ToDoRowBody r={r} />
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
