import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
      <h1 className="text-xl">Log in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use your school email and password.</p>
      <LoginForm next={next} />
      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        Forgot your password? Ask your teacher to reset it.
        <br />
        Teacher without an account?{" "}
        <Link href="/signup" className="font-medium text-brand-deep hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
