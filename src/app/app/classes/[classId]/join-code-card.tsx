"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { regenerateJoinCode, setJoinOpen } from "../actions";

/** The class join code: post it in Google Classroom; students claim their name with it. */
export function JoinCodeCard({
  classId,
  code,
  open,
}: {
  classId: string;
  code: string | null;
  open: boolean;
}) {
  const { run, pending, error } = useAction();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = code ? `${origin}/join?code=${encodeURIComponent(code)}` : "";

  async function copy(what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(what === "code" ? (code ?? "") : link);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked; the text is visible to copy by hand */
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="join-title">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="join-title" className="text-sm font-medium">
          Join code
        </h2>
        <span
          className={`ml-auto rounded-md px-2 py-0.5 text-xs font-medium ${open ? "bg-success-soft text-success-foreground" : "bg-muted text-muted-foreground"}`}
        >
          {open ? "Open" : "Closed"}
        </span>
      </div>
      {code ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span
            className="rounded-lg bg-brand-soft px-4 py-2 font-mono text-2xl font-semibold tracking-widest text-brand-deep"
            data-join-code
          >
            {code}
          </span>
          <Button variant="outline" size="sm" onClick={() => copy("code")}>
            {copied === "code" ? (
              <Check data-icon="inline-start" aria-hidden />
            ) : (
              <Copy data-icon="inline-start" aria-hidden />
            )}
            {copied === "code" ? "Copied" : "Copy code"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => copy("link")}>
            {copied === "link" ? (
              <Check data-icon="inline-start" aria-hidden />
            ) : (
              <Copy data-icon="inline-start" aria-hidden />
            )}
            {copied === "link" ? "Copied" : "Copy join link"}
          </Button>
        </div>
      ) : null}
      <p className="mt-3 text-sm text-muted-foreground">
        {code
          ? "Students go to the join page, enter this code, pick their name from your list, and choose a password. No email needed."
          : "Create a code, post it in Google Classroom, and students join by picking their name and choosing a password."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant={code ? "ghost" : "default"}
          size="sm"
          disabled={pending}
          onClick={() => run(regenerateJoinCode(classId))}
        >
          <RefreshCw data-icon="inline-start" aria-hidden />
          {code ? "New code" : "Create a join code"}
        </Button>
        {code ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(setJoinOpen(classId, !open))}
          >
            {open ? "Close joining" : "Reopen joining"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-error-foreground">{error}</p> : null}
    </section>
  );
}
