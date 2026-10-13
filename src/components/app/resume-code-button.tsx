"use client";

import { useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction } from "@/components/use-action";
import { getResumeCode } from "@/app/app/results/actions";

/**
 * Finish later (Jon, Oct 13 2026): the code to put on the board so students
 * with a paused test can finish it in class. One code works for every one of
 * the teacher's classes and lasts one class period; "New code" ends it early.
 */
export function ResumeCodeButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<{ code: string; expiresAt: string } | null>(null);
  const { run, pending, error } = useAction();
  const load = (fresh: boolean) => run(getResumeCode(fresh), (d) => setShown(d));

  return (
    <>
      <Button
        variant={variant}
        onClick={() => {
          setOpen(true);
          load(false);
        }}
        data-resume-code-button
      >
        <KeyRound data-icon="inline-start" aria-hidden />
        Resume code
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume code</DialogTitle>
            <DialogDescription>
              Put this on the board. Students with a paused test type it to finish in class. It
              works for all your classes until it runs out.
            </DialogDescription>
          </DialogHeader>
          <p
            className="py-4 text-center font-mono text-6xl font-semibold tracking-[0.3em] text-brand-deep"
            data-resume-code
          >
            {shown?.code ?? "······"}
          </p>
          <p className="text-center text-sm text-muted-foreground">
            {shown
              ? `Good until ${new Date(shown.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : pending
                ? "Getting a code…"
                : ""}
          </p>
          {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => load(true)}>
              <RefreshCw data-icon="inline-start" aria-hidden />
              New code
            </Button>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
