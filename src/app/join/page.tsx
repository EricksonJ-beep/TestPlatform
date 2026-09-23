import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join a class" };

/** Public: students turn a class code into an account. No email needed. */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code : "";
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 py-10">
      <Link href="/" className="self-start rounded-md outline-none focus-visible:ring-2">
        <Wordmark />
      </Link>
      <h1 className="mt-8 text-2xl">Join your class</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the code your teacher posted, find your name, and choose a password.
      </p>
      <JoinForm initialCode={code} />
      <p className="mt-6 text-sm text-muted-foreground">
        Already have a Bloom login?{" "}
        <Link href="/login" className="font-medium text-brand-deep hover:underline">
          Log in
        </Link>{" "}
        and use &quot;Join a class&quot; on your home page.
      </p>
    </main>
  );
}
