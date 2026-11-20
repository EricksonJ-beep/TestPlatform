"use client";

import { useEffect, useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { cn } from "cn";
import { LocalTime } from "@/components/local-time";
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
import { btn } from "@/components/home/ui";
import { getMasterCode, getResumeCode, stopMasterCode } from "@/app/app/results/actions";

type Shown = { code: string; expiresAt: string };

/** What each code's card and dialog say. */
const COPY = {
  resume: {
    name: "Resume code",
    ranOut: "Your resume code ran out.",
    none: "No resume code running.",
    get: "Get resume code",
    about:
      "Put this on the board. Students with a paused test type it to finish in class. It works for all your classes until it runs out.",
  },
  master: {
    name: "Master code",
    ranOut: "Your master code ran out.",
    none: "No master code running.",
    get: "Get master code",
    about:
      "Put this on the board. Students type it in place of any test's own access code, and to reopen a paused test. It works for all your classes until it runs out.",
  },
} as const;

/**
 * Finish later (Jon, Oct 13 2026): the code to put on the board so students
 * with a paused test can finish it in class. One code works for every one of
 * the teacher's classes and lasts one class period; "New code" ends it early.
 */
export function ResumeCodeButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
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
      <ResumeCodeDialog
        open={open}
        onOpenChange={setOpen}
        shown={shown}
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
 */
export function ResumeCodeHeader({ initial }: { initial: Shown | null }) {
  return <CodeHeader kind="resume" initial={initial} />;
}

/**
 * The Dashboard header's master code (Jon, Nov 20 2026): one easy code (`frog21`) that stands in
 * for every test's own access code and the resume code until 3:30 PM, so nobody looks codes up
 * test by test. New code replaces it; Turn off ends it early.
 */
export function MasterCodeHeader({ initial }: { initial: Shown | null }) {
  return <CodeHeader kind="master" initial={initial} />;
}

function CodeHeader({ kind, initial }: { kind: keyof typeof COPY; initial: Shown | null }) {
  const copy = COPY[kind];
  const master = kind === "master";
  const [shown, setShown] = useState<Shown | null>(initial);
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
    run(master ? getMasterCode(fresh) : getResumeCode(fresh), (d) => {
      setShown(d);
      setExpired(false);
    });
  const stop = () => run(stopMasterCode(), () => setShown(null));

  // The code stops working at its time; say so rather than show a dead code.
  useEffect(() => {
    if (!shown) return;
    const ms = Math.max(0, new Date(shown.expiresAt).getTime() - Date.now());
    const t = setTimeout(() => setExpired(true), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [shown]);

  const live = shown && !expired ? shown : null;
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-5 py-4"
      {...(master ? { "data-master-header": "" } : { "data-resume-header": "" })}
    >
      {live ? (
        <>
          <p className="text-[13px] text-ink-muted">
            {copy.name}, good until{" "}
            {/* A master code made after 3:30 PM runs to tomorrow; name the day. */}
            <LocalTime date={live.expiresAt} mode={master ? "day-at" : "time"} />
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span
              className={cn(
                "font-display text-2xl leading-none font-bold text-ink",
                master ? "tracking-[0.04em]" : "tracking-[0.12em]"
              )}
              {...(master ? { "data-master-code": "" } : { "data-resume-code": "" })}
            >
              {live.code}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(btn.base, btn.primary)}
                onClick={() => setOpen(true)}
              >
                Show big
              </button>
              <button
                type="button"
                className={cn(btn.base, btn.outline)}
                disabled={pending}
                onClick={() => load(true)}
              >
                New code
              </button>
              {master ? (
                <button
                  type="button"
                  className={cn(btn.base, btn.outline)}
                  disabled={pending}
                  onClick={stop}
                >
                  Turn off
                </button>
              ) : null}
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-ink-muted">{shown ? copy.ranOut : copy.none}</p>
          <button
            type="button"
            className={cn(btn.base, btn.primary, "self-start")}
            disabled={pending}
            onClick={() => load(false)}
          >
            {pending ? "Getting a code…" : copy.get}
          </button>
        </>
      )}
      {error ? <span className="text-[13px] text-eosin-text">{error}</span> : null}
      <ResumeCodeDialog
        kind={kind}
        open={open}
        onOpenChange={setOpen}
        shown={live}
        pending={pending}
        error={error}
        onNew={() => load(true)}
      />
    </div>
  );
}

function ResumeCodeDialog({
  kind = "resume",
  open,
  onOpenChange,
  shown,
  pending,
  error,
  onNew,
}: {
  kind?: keyof typeof COPY;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shown: Shown | null;
  pending: boolean;
  error: string | null;
  onNew: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY[kind].name}</DialogTitle>
          <DialogDescription>{COPY[kind].about}</DialogDescription>
        </DialogHeader>
        <p
          className={cn(
            "py-4 text-center font-mono font-semibold text-brand-deep",
            // A word and a number is longer than six characters; keep it on one line.
            kind === "master" ? "text-5xl tracking-[0.08em] break-all" : "text-6xl tracking-[0.3em]"
          )}
          {...(kind === "master" ? { "data-master-code": "" } : { "data-resume-code": "" })}
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
