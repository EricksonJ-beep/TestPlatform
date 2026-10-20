import Link from "next/link";
import { Hourglass, PencilLine, Play, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { HomeLane, HomeLanes, ToDoRow } from "@/lib/student-home";
import { ToDoRowBody } from "@/components/todo-row";
import { Button } from "@/components/ui/button";
import { AskAnnouncer } from "./ask-announcer";
import { RequestRetakeButton } from "./assignments/[assignmentId]/request-retake-button";
import { DueBadge } from "./due-badge";
import { PhoneCollapsible } from "./phone-collapsible";

const LANE: Record<
  HomeLane,
  {
    n: number;
    title: string;
    sub: string;
    icon: LucideIcon;
    box: string;
    tone: string;
    /** The lane's main button, so the three lanes read apart at a glance. */
    button: string;
    empty: string;
  }
> = {
  now: {
    n: 1,
    title: "Now",
    sub: "Do this first",
    icon: Play,
    box: "bg-coral-soft",
    tone: "text-[#b93e27]",
    button: "",
    empty: "Nothing to start right now. New tests and quizzes show up here.",
  },
  fix: {
    n: 2,
    title: "Fix it",
    sub: "Corrections",
    icon: PencilLine,
    box: "bg-warning-soft",
    tone: "text-warning-foreground",
    button: "bg-foreground text-background hover:bg-foreground/85",
    empty: "No corrections to do.",
  },
  level: {
    n: 3,
    title: "Level up",
    sub: "Retakes",
    icon: TrendingUp,
    box: "bg-brand-soft",
    tone: "text-brand-deep",
    button: "bg-brand text-white hover:bg-brand-deep",
    empty: "No retakes waiting.",
  },
};

/**
 * The student home's three lanes (Jon, Oct 20 2026: "Three lanes", the design canvas's option B):
 * **1 · Now** (a test to take), **2 · Fix it** (corrections and the steps that unlock a retake),
 * **3 · Level up** (retakes and asking for one), each its own color, side by side from `md` and
 * stacked on a phone. Waiting on your teacher sits at the foot of Level up, collapsed on a phone.
 * Rows come from `homeLanes`. Asking to retake from a row is announced, and focus follows the row
 * to Waiting (`AskAnnouncer`).
 */
export function ToDoList({ lanes }: { lanes: HomeLanes }) {
  return (
    <AskAnnouncer>
      <div className="grid items-start gap-5 md:grid-cols-3">
        <Lane lane="now" rows={lanes.now} />
        <Lane lane="fix" rows={lanes.fix} />
        <Lane lane="level" rows={lanes.level}>
          {lanes.waiting.length ? (
            <PhoneCollapsible
              className="rounded-xl border border-dashed border-brand/40 bg-card/70"
              data-todo-group="waiting"
              summaryClassName="px-4 py-3"
              summary={
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Hourglass className="size-4 text-muted-foreground" aria-hidden />
                  Waiting on your teacher
                  <span className="font-normal text-muted-foreground tabular">
                    · {lanes.waiting.length}
                  </span>
                </h3>
              }
            >
              <ul className="flex flex-col gap-2 px-3 pb-3">
                {lanes.waiting.map((r) => (
                  <Card key={r.key} r={r} lane="level" quiet />
                ))}
              </ul>
            </PhoneCollapsible>
          ) : null}
        </Lane>
      </div>
    </AskAnnouncer>
  );
}

function Lane({
  lane,
  rows,
  children,
}: {
  lane: HomeLane;
  rows: ToDoRow[];
  children?: React.ReactNode;
}) {
  const l = LANE[lane];
  const id = `lane-${lane}`;
  return (
    <section
      aria-labelledby={id}
      className={cn("flex flex-col gap-3 rounded-2xl p-3", l.box)}
      data-lane={lane}
      data-todo-group={lane === "level" ? "higher" : "todo"}
    >
      <div className={cn("flex items-center gap-2 px-1 pt-1", l.tone)}>
        <l.icon className="size-4" aria-hidden />
        <h2 id={id} className="text-sm font-extrabold tracking-wider uppercase">
          {l.n} · {l.title}
          <span className="sr-only">
            : {rows.length} {rows.length === 1 ? "item" : "items"}
          </span>
        </h2>
        <span className="ml-auto text-xs font-semibold">{l.sub}</span>
        <span
          aria-hidden
          className="inline-flex min-w-6 justify-center rounded-full bg-card px-2 text-xs font-bold tabular"
        >
          {rows.length}
        </span>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <Card key={r.key} r={r} lane={lane} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-current/25 px-4 py-3 text-sm text-muted-foreground">
          {l.empty}
        </p>
      )}
      {children}
    </section>
  );
}

function Card({ r, lane, quiet = false }: { r: ToDoRow; lane: HomeLane; quiet?: boolean }) {
  const a = r.action;
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-4",
        quiet ? "border border-border" : "shadow-sm ring-1 ring-black/5"
      )}
      data-todo-kind={r.kind}
      data-assignment={r.assignmentId ?? undefined}
    >
      {r.when && !quiet ? <DueBadge at={r.when.at} /> : null}
      <ToDoRowBody r={r} />
      {a?.kind === "link" ? (
        <Button
          size="lg"
          variant={a.primary ? "default" : "outline"}
          className={cn("h-11 w-full", a.primary && LANE[lane].button)}
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
