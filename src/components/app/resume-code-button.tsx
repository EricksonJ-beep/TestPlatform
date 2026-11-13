"use client";

import { useEffect, useState } from "react";
import { KeyRound, Maximize2, RefreshCw } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction } from "@/components/use-action";
import { getResumeCode, setResumeCodeStarts } from "@/app/app/results/actions";

type Shown = { code: string; expiresAt: string };

/**
 * Finish later (Jon, Oct 13 2026): the code to put on the board so students
 * with a paused test can finish it in class. One code works for every one of
 * the teacher's classes and lasts one class period; "New code" ends it early.
 * With "Also starts tests" on (Jon, Nov 13 2026; the switch is in the Dashboard header), the
 * same code is accepted as the access code on any of the teacher's tests.
 */
export function ResumeCodeButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [startsTests, setStartsTests] = useState(false);
  const { run, pending, error } = useAction();
  const load = (fresh: boolean) =>
    run(getResumeCode(fresh), (d) => {
      setShown(d);
      setStartsTests(d.startsTests);
    });

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
      <ResumeCodeDialog
        open={open}
        onOpenChange={setOpen}
        shown={shown}
        startsTests={startsTests}
        pending={pending}
        error={error}
        onNew={() => load(true)}
      />
    </>
  );
}

/**
 * The Dashboard header's live resume code (Jon, Oct 13 2026, dashboard plan): the current code
 * and when it runs out, always in view, with Show big for the board and New code. With no code
 * running, one click gets one. A code issued anywhere else (a Results page, another tab) arrives
 * with the next live refresh, and the header follows it.
 *
 * "Also starts tests" (Jon, Nov 13 2026: "have the resume code on the board and have it be a
 * master password if I wanted"): while ticked, the code is also accepted in place of the access
 * code on any of the teacher's tests. The choice is the teacher's and stays until changed.
 */
export function ResumeCodeHeader({
  initial,
  startsTests,
}: {
  initial: Shown | null;
  startsTests: boolean;
}) {
  const [shown, setShown] = useState<Shown | null>(initial);
  const [starts, setStarts] = useState(startsTests);
  const [seenStarts, setSeenStarts] = useState(startsTests);
  if (seenStarts !== startsTests) {
    setSeenStarts(startsTests);
    setStarts(startsTests);
  }
  const toggle = useAction();
  const [open, setOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  // Follow the server's code when it changes (set during render, React's "adjust state on a
  // prop change" pattern, so the old code never flashes after a refresh).
  const initialKey = initial ? `${initial.code}|${initial.expiresAt}` : "";
  const [seenKey, setSeenKey] = useState(initialKey);
  if (seenKey !== initialKey) {
    setSeenKey(initialKey);
    setShown(initial);
    setExpired(false);
  }
  const { run, pending, error } = useAction();
  const load = (fresh: boolean) =>
    run(getResumeCode(fresh), (d) => {
      setShown(d);
      setExpired(false);
    });

  // The code stops working at its time; say so rather than show a dead code.
  useEffect(() => {
    if (!shown) return;
    const ms = Math.max(0, new Date(shown.expiresAt).getTime() - Date.now());
    const t = setTimeout(() => setExpired(true), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [shown]);

  const live = shown && !expired ? shown : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-resume-header>
      <KeyRound className="size-4 text-muted-foreground" aria-hidden />
      {live ? (
        <>
          <span>
            Resume code{" "}
            <span
              className="font-mono font-semibold tracking-widest text-brand-deep"
              data-resume-code
            >
              {live.code}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · good until <LocalTime date={live.expiresAt} mode="time" />
            </span>
          </span>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Maximize2 data-icon="inline-start" aria-hidden />
            Show big
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => load(true)}>
            <RefreshCw data-icon="inline-start" aria-hidden />
            New code
          </Button>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">
            {shown ? "Your resume code ran out." : "No resume code running."}
          </span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => load(false)}>
            {pending ? "Getting a code…" : "Get resume code"}
          </Button>
        </>
      )}
      <label
        className="flex items-center gap-1.5 text-muted-foreground"
        title="While ticked, students can type the resume code in place of the access code to start any of your tests. Windows, attempts and retake rules still apply."
      >
        <Checkbox
          checked={starts}
          disabled={toggle.pending}
          onCheckedChange={(on) => {
            toggle.run(setResumeCodeStarts(on === true), (d) => setStarts(d.startsTests));
          }}
          data-resume-starts-tests
        />
        Also starts tests
      </label>
      {error || toggle.error ? (
        <span className="text-xs text-error-foreground">{error ?? toggle.error}</span>
      ) : null}
      <ResumeCodeDialog
        open={open}
        onOpenChange={setOpen}
        shown={live}
        startsTests={starts}
        pending={pending}
        error={error}
        onNew={() => load(true)}
      />
    </div>
  );
}

function ResumeCodeDialog({
  open,
  onOpenChange,
  shown,
  startsTests,
  pending,
  error,
  onNew,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shown: Shown | null;
  startsTests: boolean;
  pending: boolean;
  error: string | null;
  onNew: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resume code</DialogTitle>
          <DialogDescription>
            {startsTests
              ? "Put this on the board. Students type it to finish a paused test, or as the access code to start any of your tests. It works for all your classes until it runs out."
              : "Put this on the board. Students with a paused test type it to finish in class. It works for all your classes until it runs out."}
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
          <Button variant="ghost" disabled={pending} onClick={onNew}>
            <RefreshCw data-icon="inline-start" aria-hidden />
            New code
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
