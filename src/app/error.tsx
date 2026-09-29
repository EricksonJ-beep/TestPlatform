"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Last-resort error screen. Nothing a student typed is lost: answers autosave as they go. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-full max-w-lg items-center px-4 py-16">
      <div className="flex w-full flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center">
        <AlertTriangle className="size-8 text-[#B93E27]" aria-hidden />
        <h1 className="text-xl">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          Your work is saved as you go, so nothing is lost. Try again; if it keeps happening, tell
          your teacher what you were doing.
          {error.digest ? (
            <span className="block text-xs text-muted-foreground/80">Reference {error.digest}</span>
          ) : null}
        </p>
        <div className="flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
            Go home
          </Button>
        </div>
      </div>
    </main>
  );
}
