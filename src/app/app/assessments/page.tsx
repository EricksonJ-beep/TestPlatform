import type { Metadata } from "next";
import { requireTeacher } from "@/lib/authz";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Assessments" };

export default async function Page() {
  await requireTeacher();
  return (
    <ComingSoon
      title="Assessments"
      description="Build practice, formative, and summative tests from your banks, with pools per learning target."
    />
  );
}
