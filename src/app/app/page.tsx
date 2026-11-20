import { requireOwner, requireTeacher } from "@/lib/authz";
import { closeExpiredAttempts } from "@/lib/attempt-sweep";
import { feedGroups, feedQuery, parseFeedFilter } from "@/lib/activity-filter";
import { listClassActivity, listRecentActivity } from "@/lib/activity-log";
import { currentResumeCode } from "@/lib/attempt-pause";
import { getCurrentClass, getCurrentCourse } from "@/lib/current-course";
import { getClassGradebook } from "@/lib/queries/class-gradebook";
import { getNeedsYou } from "@/lib/queries/dashboard";
import { getDashboardVersion } from "@/lib/queries/dashboard-version";
import { LiveRefresh } from "@/components/app/live-refresh";
import { HideScoresScope } from "@/components/app/hide-scores";
import { RecentActivity } from "@/components/app/recent-activity";
import { ResumeCodeHeader } from "@/components/app/resume-code-button";
import { ClassHome } from "@/components/home/class-home";
import { Greeting } from "@/components/home/greeting";
import { PeriodSegments } from "@/components/home/period-segments";
import { SCHOOL_TIME_ZONE } from "@/lib/reopen";
import { hourLabel } from "@/lib/teacher-home";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

/**
 * The teacher home (Jon, Oct 13 2026, docs/dashboard-plan.md: "a page that allows me to control
 * and see all of the requests or things that I can monitor"; drawn as the home pages redesign,
 * BLOOM_HOME_REDESIGN.md §3). The header carries the greeting, the sidebar course's class periods
 * (it opens on the one picked last, decisions 1 and 8) and the live resume code. Under it the page
 * is in one of two modes for that class (`ClassHome`): live while someone is testing or paused,
 * quiet otherwise. Recent activity stays, with its filters in the address (decision 10). The page
 * keeps itself current: `LiveRefresh` polls a coarse version stamp every 15 s while the tab is
 * visible and refreshes when it moves (build step 5), which is also what switches the mode.
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
  // Tests left open past their time limit are submitted before the page reads them (H3.2).
  await closeExpiredAttempts({ ownerId: session.userId });
  const filter = parseFeedFilter(await searchParams, !!cls);
  const version = await getDashboardVersion(session.userId, cls?.id ?? null, new Date(), filter);
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
  const period = cls ? hourLabel(cls) : null;
  // The greeting is by the teacher's own clock; the server renders the school's hour and the
  // browser corrects it (the server's own hour said "Good afternoon" at 10:49 AM).
  const schoolHour =
    Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: SCHOOL_TIME_ZONE,
      }).format(new Date())
    ) % 24;

  // "Hide scores" (decision 6) covers the whole page: the gradebook, Needs you, Recent activity.
  return (
    <HideScoresScope className="bloom-home mx-auto flex max-w-[1400px] flex-col gap-6 md:px-4 md:pt-2 md:pb-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-3">
          <Greeting firstName={session.firstName} schoolHour={schoolHour} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {focus.course ? (
              <span
                className="text-[15px] font-semibold"
                title="Every test assigned this term. Switch courses in the sidebar."
              >
                {focus.course.name}
              </span>
            ) : null}
            {focus.classes.length > 1 || (focus.classes.length === 1 && focus.classes[0].period) ? (
              <PeriodSegments classes={focus.classes} currentId={cls?.id ?? null} />
            ) : null}
            <LiveRefresh
              classId={cls?.id ?? null}
              feed={feedQuery(filter, !!cls)}
              version={version}
            />
          </div>
        </div>
        <ResumeCodeHeader
          initial={code ? { code: code.code, expiresAt: code.expiresAt.toISOString() } : null}
        />
      </div>

      <ClassHome course={focus.course} period={period} gradebook={gradebook} inbox={inbox} />

      <RecentActivity
        rows={activity}
        filter={filter}
        hasClass={!!cls}
        classId={cls?.id ?? null}
        classLabel={period}
      />
    </HideScoresScope>
  );
}
