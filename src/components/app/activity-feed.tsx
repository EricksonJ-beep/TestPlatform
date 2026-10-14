import Link from "next/link";
import {
  CheckCircle2,
  CirclePause,
  ClipboardList,
  Hand,
  KeyRound,
  Layers,
  LogIn,
  MessageCircleQuestion,
  PlayCircle,
  Send,
  Users,
} from "lucide-react";
import {
  activityLine,
  activityScore,
  type ActivityKind,
  type ActivityRow,
} from "@/lib/activity-log";
import { feedDay } from "@/lib/activity-filter";
import { placeLabel } from "@/lib/needs-you";
import { LocalTime } from "@/components/local-time";

const ICON: Record<ActivityKind, typeof LogIn> = {
  login: LogIn,
  class_joined: Users,
  attempt_started: PlayCircle,
  attempt_submitted: Send,
  corrections_submitted: ClipboardList,
  practice_completed: Layers,
  activity_completed: CheckCircle2,
  retake_requested: Hand,
  test_paused: CirclePause,
  resume_requested: MessageCircleQuestion,
  resumed: KeyRound,
};

/**
 * A list of logged milestones, optionally with the student's name, where it happened (course ·
 * period, for a feed across classes) and a date heading per day.
 */
export function ActivityFeed({
  rows,
  showName = true,
  showPlace = false,
  groupByDay = false,
  emptyText = "No activity yet.",
}: {
  rows: ActivityRow[];
  showName?: boolean;
  showPlace?: boolean;
  groupByDay?: boolean;
  emptyText?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }
  const groups: { day: string; rows: ActivityRow[] }[] = [];
  for (const r of rows) {
    const day = groupByDay ? feedDay(new Date(r.createdAt)) : "";
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(r);
    else groups.push({ day, rows: [r] });
  }
  return (
    <div className="flex flex-col gap-3" data-activity-feed>
      {groups.map((g, gi) => (
        <section key={g.day || gi} className="rounded-lg border border-border bg-card">
          {groupByDay ? (
            <h3 className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
              <LocalTime date={g.rows[0].createdAt} mode="date" />
            </h3>
          ) : null}
          <ul className="divide-y divide-border">
            {g.rows.map((r) => {
              const Icon = ICON[r.kind] ?? LogIn;
              // The Dashboard's "Hide scores" (decision 6) hides the percent, not the line.
              const score = activityScore(r);
              const line = (
                <>
                  {activityLine(r)}
                  {score ? (
                    <span className="group-data-[hide-scores]/scores:hidden" data-score>
                      {score}
                    </span>
                  ) : null}
                </>
              );
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-2 text-sm"
                  data-activity={r.kind}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    {showName ? (
                      <span className="font-medium">
                        {r.firstName} {r.lastName}
                      </span>
                    ) : null}
                    {showName ? " · " : ""}
                    {showPlace && r.place ? (
                      <span className="text-muted-foreground" data-activity-place>
                        {placeLabel(r.place)} ·{" "}
                      </span>
                    ) : null}
                    {r.assignmentId ? (
                      <Link href={`/app/results/${r.assignmentId}`} className="hover:underline">
                        {line}
                      </Link>
                    ) : (
                      line
                    )}
                  </span>
                  <LocalTime
                    date={r.createdAt}
                    mode={groupByDay ? "time" : "datetime"}
                    className="shrink-0 text-xs text-muted-foreground tabular"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
