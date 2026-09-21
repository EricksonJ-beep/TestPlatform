import type { Metadata } from "next";
import { requireTeacher } from "@/lib/authz";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Assign" };

export default async function Page() {
  await requireTeacher();
  return (
    <ComingSoon
      title="Assign"
      description="Send an assessment to a class with a window, access code, time limit, and attempt policy."
    />
  );
}
