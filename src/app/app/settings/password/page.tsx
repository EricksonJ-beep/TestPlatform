import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { passwordPolicy } from "@/lib/password";
import { ChangePasswordForm } from "@/components/app/change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function TeacherPasswordPage() {
  await requireTeacher();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <Link
        href="/app/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Settings
      </Link>
      <h1 className="text-2xl">Change your password</h1>
      <ChangePasswordForm doneHref="/app/settings" minLength={passwordPolicy.minLength} />
    </div>
  );
}
