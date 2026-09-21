import type { Metadata } from "next";
import { requireTeacher } from "@/lib/authz";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Shared" };

export default async function Page() {
  await requireTeacher();
  return (
    <ComingSoon
      title="Shared"
      description="Banks and assessments your colleague has shared with you appear here."
    />
  );
}
