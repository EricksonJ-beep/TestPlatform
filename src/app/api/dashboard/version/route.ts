import { requireOwner, requireTeacher, withAuthzRoute } from "@/lib/authz";
import { getDashboardVersion } from "@/lib/queries/dashboard-version";

export const dynamic = "force-dynamic";

/**
 * The Dashboard's coarse version stamp, polled every 15 s while the page is open and visible
 * (Jon, Oct 13 2026, dashboard plan build step 5); the page refreshes only when it changes.
 * `?class=` is the class the gradebook shows: owner only. Without it, the teacher's own stamp.
 */
export const GET = withAuthzRoute(async (req) => {
  const classId = new URL(req.url).searchParams.get("class");
  const session = classId
    ? await requireOwner({ type: "class", id: classId })
    : await requireTeacher();
  const version = await getDashboardVersion(session.userId, classId);
  return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
});
