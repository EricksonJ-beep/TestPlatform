import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStudent } from "@/lib/authz";
import { passwordPolicy } from "@/lib/password";
import { ChangePasswordForm } from "@/components/app/change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function StudentPasswordPage() {
  await requireStudent();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <Link
        href="/student"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Home
      </Link>
      <div>
        <h1 className="text-2xl">Change your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Forgot it? Your teacher can reset it from the class roster.
        </p>
      </div>
      <ChangePasswordForm doneHref="/student" minLength={passwordPolicy.minLength} />
    </div>
  );
}
