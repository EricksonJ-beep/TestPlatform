import type { Metadata } from "next";
import { requireTeacher } from "@/lib/authz";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  await requireTeacher();
  return <ComingSoon title="Settings" description="Account, password, and course settings." />;
}
