import type { Metadata } from "next";
import { requireTeacher } from "@/lib/authz";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Practice sets" };

export default async function Page() {
  await requireTeacher();
  return (
    <ComingSoon
      title="Practice sets"
      description="Publish always-open practice and relearning activities tagged to learning targets."
    />
  );
}
