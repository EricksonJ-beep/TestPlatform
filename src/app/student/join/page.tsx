import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStudent } from "@/lib/authz";
import { JoinAnotherForm } from "./join-another-form";

export const metadata: Metadata = { title: "Join a class" };

/** A signed-in student adds a class with its code. */
export default async function StudentJoinPage() {
  await requireStudent();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <Link
        href="/student"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl">Join a class</h1>
      <p className="text-sm text-muted-foreground">
        Enter the code your teacher posted. Your existing login keeps working for every class.
      </p>
      <JoinAnotherForm />
    </div>
  );
}
