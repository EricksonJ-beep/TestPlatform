import { requireTeacher } from "@/lib/authz";
import { listRecentActivity } from "@/lib/activity-log";
import { currentResumeCode } from "@/lib/attempt-pause";
import { needsYouCounts } from "@/lib/needs-you";
import { getNeedsYou } from "@/lib/queries/dashboard";
import { ActivityFeed } from "@/components/app/activity-feed";
import { NeedsYouChips, NeedsYouInbox } from "@/components/app/needs-you";
import { ResumeCodeHeader } from "@/components/app/resume-code-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * The Dashboard (Jon, Oct 13 2026, docs/dashboard-plan.md): "a page that allows me to control
 * and see all of the requests or things that I can monitor". The header carries the live resume
 * code and "N things need you", which is exactly the rows in "Needs you" (all courses) below.
 * The course cards, number tiles, Recent results and Class at a glance are gone; Recent activity
 * stays.
 */
export default async function DashboardPage() {
  const session = await requireTeacher();
  const [inbox, code, activity] = await Promise.all([
    getNeedsYou(session.userId),
    currentResumeCode(session.userId),
    listRecentActivity(session.userId, { hours: 24, limit: 25 }),
  ]);
  const counts = needsYouCounts(inbox);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">
            {greeting()}, {session.firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground" data-needs-total={counts.total}>
            {counts.total === 0
              ? "Nothing is waiting on you."
              : `${counts.total} ${counts.total === 1 ? "thing needs" : "things need"} you.`}
          </p>
          <NeedsYouChips counts={counts} />
        </div>
        <ResumeCodeHeader
          initial={code ? { code: code.code, expiresAt: code.expiresAt.toISOString() } : null}
        />
      </div>

      <NeedsYouInbox inbox={inbox} />

      <Card data-recent-activity>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            What your students did in the last 24 hours. Each class page has the full log.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="[&_section]:rounded-none [&_section]:border-0">
            <ActivityFeed rows={activity} emptyText="Nothing logged in the last 24 hours." />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
