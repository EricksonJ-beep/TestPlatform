import { requireOwner, requireTeacher } from "@/lib/authz";
import { feedGroups, parseFeedFilter } from "@/lib/activity-filter";
import { listClassActivity, listRecentActivity } from "@/lib/activity-log";
import { currentResumeCode } from "@/lib/attempt-pause";
import { periodLabel } from "@/lib/class-focus";
import { getCurrentClass, getCurrentCourse } from "@/lib/current-course";
import { needsYouCounts } from "@/lib/needs-you";
import { getClassGradebook } from "@/lib/queries/class-gradebook";
import { getNeedsYou } from "@/lib/queries/dashboard";
import { getDashboardVersion } from "@/lib/queries/dashboard-version";
import { ClassGradebookSection } from "@/components/app/class-gradebook";
import { LiveRefresh } from "@/components/app/live-refresh";
import { NeedsYouChips, NeedsYouInbox } from "@/components/app/needs-you";
import { RecentActivity } from "@/components/app/recent-activity";
import { ResumeCodeHeader } from "@/components/app/resume-code-button";

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

/**
 * The Dashboard (Jon, Oct 13 2026, docs/dashboard-plan.md): "a page that allows me to control
 * and see all of the requests or things that I can monitor". The header carries the live resume
 * code and "N things need you", which is exactly the rows in "Needs you" (all courses) below.
 * Under it, the class gradebook for the sidebar course, on the period picked last (decisions 1
 * and 8). The course cards, number tiles, Recent results and Class at a glance are gone (the
 * glance lives on in the summative column footers); Recent activity stays, with its filters in
 * the address (decision 10). The page keeps itself current: `LiveRefresh` polls a coarse version
 * stamp every 15 s while the tab is visible and refreshes when it moves (build step 5).
 */
export default async function DashboardPage({ searchParams }: PageProps<"/app">) {
  const session = await requireTeacher();
  const focus = await getCurrentCourse(session.userId).then(async ({ current }) => ({
    course: current,
    ...(await getCurrentClass(session.userId, current?.id ?? null)),
  }));
  const cls = focus.current;
  // The period is one of the teacher's own classes (getCurrentClass lists only those); the guard
  // runs anyway before anything of the class is read.
  if (cls) await requireOwner({ type: "class", id: cls.id });
  // The live stamp is read before the page's data, so a change landing in between is caught by
  // the next poll instead of being missed.
  const version = await getDashboardVersion(session.userId, cls?.id ?? null);
  const filter = parseFeedFilter(await searchParams, !!cls);
  const feed = {
    since: daysAgo(filter.days),
    groups: feedGroups(filter),
    limit: filter.days === 3 ? 150 : 60,
  };
  const [inbox, code, activity, gradebook] = await Promise.all([
    getNeedsYou(session.userId),
    currentResumeCode(session.userId),
    cls && filter.scope === "class"
      ? listClassActivity(cls.id, feed)
      : listRecentActivity(session.userId, feed),
    cls ? getClassGradebook(cls.id) : null,
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

      <ClassGradebookSection
        course={focus.course}
        classes={focus.classes}
        currentClassId={cls?.id ?? null}
        gradebook={gradebook}
        live={<LiveRefresh classId={cls?.id ?? null} version={version} />}
      />

      <RecentActivity
        rows={activity}
        filter={filter}
        hasClass={!!cls}
        classId={cls?.id ?? null}
        classLabel={cls ? periodLabel(cls) : null}
      />
    </div>
  );
}
