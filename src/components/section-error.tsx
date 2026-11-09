"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * An error inside the student or teacher area (hardening plan H6.5, Nov 9 2026). It sits inside
 * the layout, so the menu stays and one failed page doesn't take the whole screen. The wording
 * doesn't promise that nothing was lost: it says what is true, and what to do.
 */
export function SectionError({
  error,
  reset,
  who,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  who: "student" | "teacher";
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center">
      <AlertTriangle className="size-8 text-[#B93E27]" aria-hidden />
      <h1 className="text-xl">This page didn&apos;t load</h1>
      <p className="text-sm text-muted-foreground">
        {who === "student"
          ? "Answers you saw marked Saved are safe. Try again; if it keeps happening, tell your teacher what you were doing."
          : "Nothing was changed by this. Try again; if it keeps happening, the reference below finds it in the logs."}
        {error.digest ? (
          <span className="mt-1 block text-xs text-muted-foreground/80">
            Reference {error.digest}
          </span>
        ) : null}
      </p>
      <Button size="lg" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
