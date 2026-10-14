import { parseFeedFilter } from "@/lib/activity-filter";
import { requireOwner, requireTeacher, withAuthzRoute } from "@/lib/authz";
import { getDashboardVersion } from "@/lib/queries/dashboard-version";

export const dynamic = "force-dynamic";

/**
 * The Dashboard's coarse version stamp, polled every 15 s while the page is open and visible
 * (Jon, Oct 13 2026, dashboard plan build step 5); the page refreshes only when it changes.
 * `?class=` is the class the gradebook shows: owner only. Without it, the teacher's own stamp.
 * The page's Recent activity filter rides along (`feed`, `kinds`, `logins`, `days`), so the stamp
 * moves only on events the feed shows.
 */
export const GET = withAuthzRoute(async (req) => {
  const params = new URL(req.url).searchParams;
  const classId = params.get("class");
  const session = classId
    ? await requireOwner({ type: "class", id: classId })
    : await requireTeacher();
  const feed = parseFeedFilter(Object.fromEntries(params), !!classId);
  const version = await getDashboardVersion(session.userId, classId, new Date(), feed);
  return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
});
