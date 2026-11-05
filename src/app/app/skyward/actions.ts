"use server";

import { revalidatePath } from "next/cache";
import { ActionError, requireOwner, withAuthz } from "@/lib/authz";
import { getSkywardExport } from "@/lib/queries/skyward";
import { schoolDate } from "@/lib/reopen";
import {
  changedRowsOnly,
  endOfSchoolDay,
  recordSkywardMarks,
  startSkywardTracking,
} from "@/lib/queries/skyward-updates";

function refresh() {
  revalidatePath("/app/skyward");
  revalidatePath("/app");
}

/**
 * "Mark as entered" (Skyward updates, Nov 5 2026): Jon typed these changes into Skyward by hand, so
 * Skyward now has today's scores for them. `fileKey` narrows it to one Skyward column; null marks
 * every changed row of the assignment. Owner only.
 */
export const markSkywardEntered = withAuthz(
  async (assignmentId: string, fileKey: string | null) => {
    await requireOwner({ type: "assignment", id: assignmentId });
    const data = await getSkywardExport(assignmentId);
    if (!data) throw new ActionError("That assignment is gone.", 404);
    const files = (await changedRowsOnly(data)).filter(
      (f) => fileKey === null || f.key === fileKey
    );
    const marked = await recordSkywardMarks(assignmentId, files, "marked");
    refresh();
    return { marked };
  }
);

/**
 * "Start tracking: I entered everything in Skyward up to <date>" for one course (Skyward updates):
 * Bloom works out what Skyward had then from the score history, so the page lists what changed
 * after. Assignments already tracked are left alone. Owner only.
 */
export const startTrackingSkyward = withAuthz(async (courseId: string, date: string) => {
  const session = await requireOwner({ type: "course", id: courseId });
  const asOf = endOfSchoolDay(date);
  if (!asOf) throw new ActionError("Pick a date.", 400);
  const t = schoolDate(new Date());
  const today = `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
  if (date > today) throw new ActionError("Pick today or an earlier day.", 400);
  const out = await startSkywardTracking(session.userId, courseId, asOf);
  refresh();
  return out;
});
