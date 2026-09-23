import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getDashboardCounts, getRecentResults } from "@/lib/queries/dashboard";
import { MetricCard } from "@/components/app/metric-card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const TYPE_LABEL = {
  practice: "Practice",
  formative: "Formative",
  summative: "Summative",
} as const;

export default async function DashboardPage() {
  const session = await requireTeacher();
  const [counts, recent] = await Promise.all([
    getDashboardCounts(session.userId),
    getRecentResults(session.userId),
  ]);
  const attention = counts.needsGrading;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl">
          {greeting()}, {session.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {attention === 0
            ? "Nothing is waiting on you right now."
            : `${attention} ${attention === 1 ? "thing needs" : "things need"} your attention.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <MetricCard
          label="Needs grading"
          value={counts.needsGrading}
          hint="Submitted, not yet graded"
          href="/app/results"
          attention
        />
        <MetricCard
          label="Open tests"
          value={counts.openTests}
          hint="Assignments students can take now"
          href="/app/assign"
        />
        <MetricCard
          label="Questions"
          value={counts.questions}
          hint="In your banks"
          href="/app/banks"
        />
        <MetricCard label="Classes" value={counts.classes} hint="This term" href="/app/classes" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent results</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No results yet"
                description="When students finish a quiz or test, the latest class results show up here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.assignmentId} className="flex items-center gap-3 px-6 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/app/results/${r.assignmentId}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {r.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{r.className}</p>
                    </div>
                    <Badge variant={r.type === "summative" ? "default" : "secondary"}>
                      {TYPE_LABEL[r.type]}
                    </Badge>
                    <span className="w-16 text-right text-muted-foreground tabular">
                      {r.submitted}/{r.enrolled}
                    </span>
                    <span className="w-12 text-right font-medium tabular">
                      {r.averagePercent === null ? "—" : `${Math.round(r.averagePercent)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Get set up</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Step
              n={1}
              done={counts.classes > 0}
              title="Create a class and add students"
              href="/app/classes"
              cta="Classes"
            />
            <Step
              n={2}
              done={counts.questions > 0}
              title="Start a question bank (or import a CSV)"
              href="/app/banks"
              cta="Question banks"
              soon
            />
            <Step
              n={3}
              done={counts.openTests > 0}
              title="Build a quiz and assign it"
              href="/app/assessments"
              cta="Assessments"
              soon
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Step({
  n,
  done,
  title,
  href,
  cta,
  soon = false,
}: {
  n: number;
  done: boolean;
  title: string;
  href: string;
  cta: string;
  soon?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          done
            ? "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-xs font-semibold text-white"
            : "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-deep"
        }
      >
        {done ? "✓" : n}
      </span>
      <span className="flex-1">{title}</span>
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href} />}>
        {soon ? `${cta} (Phase 1)` : cta}
      </Button>
    </div>
  );
}
