import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Teacher sign-up" };

export default function SignupPage() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
      <h1 className="text-xl">Create a teacher account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You need the invite code from Jon. Students don&apos;t sign up here; their teacher adds them
        to a class.
      </p>
      <SignupForm />
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-deep hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
