"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, withAuthz } from "@/lib/authz";
import { rememberClass } from "@/lib/current-course";

/**
 * Pick the class period the Dashboard gradebook shows (Jon, Oct 13 2026, dashboard plan decision
 * 8: it always opens on the period picked last). Owner only: another teacher's class is refused
 * and nothing is remembered. The page re-checks the cookie against the sidebar course on read.
 */
export const pickDashboardClass = withAuthz(async (classId: string) => {
  await requireOwner({ type: "class", id: classId });
  await rememberClass(classId);
  revalidatePath("/app");
  return { classId };
});
