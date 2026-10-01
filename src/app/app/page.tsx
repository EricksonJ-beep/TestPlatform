import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getDashboardCounts, getRecentResults, listRetakeRequests } from "@/lib/queries/dashboard";
import { getClassGlance } from "@/lib/queries/tiers";
import { ClassGlance } from "@/components/app/class-glance";
import { MetricCard } from "@/components/app/metric-card";
import { RetakeRequests } from "@/components/app/retake-requests";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
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
  const [counts, recent, glance, requests] = await Promise.all([
    getDashboardCounts(session.userId),
    getRecentResults(session.userId),
    getClassGlance(session.userId),
    listRetakeRequests(session.userId),
  ]);
  const attention = counts.needsGrading + counts.correctionsAwaiting + counts.retakeRequests;

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
          label="Corrections"
          value={counts.correctionsAwaiting}
          hint="Sets awaiting your approval"
          href="/app/results/corrections"
          attention={counts.correctionsAwaiting > 0}
        />
        <MetricCard label="Classes" value={counts.classes} hint="This term" href="/app/classes" />
      </div>

      <RetakeRequests rows={requests} />

      <ClassGlance rows={glance} />

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
    </div>
  );
}
