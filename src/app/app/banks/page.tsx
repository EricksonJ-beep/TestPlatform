import type { Metadata } from "next";
import { requireTeacher } from "@/lib/authz";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Question banks" };

export default async function Page() {
  await requireTeacher();
  return (
    <ComingSoon
      title="Question banks"
      description="Course → unit → topic banks with filters, tags, pools, and CSV import land first in Phase 1."
    />
  );
}
