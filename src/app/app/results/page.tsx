import type { Metadata } from "next";
import { requireTeacher } from "@/lib/authz";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Results" };

export default async function Page() {
  await requireTeacher();
  return (
    <ComingSoon
      title="Results"
      description="Gradebook with every attempt and the highest score, corrections queue, and the live tier board."
    />
  );
}
