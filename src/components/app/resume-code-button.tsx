"use client";

import { useEffect, useState } from "react";
import { KeyRound, Maximize2, Pencil, Power, RefreshCw, Sparkles } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";
import { endTodaysCode, getResumeCode, setTodaysCode } from "@/app/app/results/actions";
import { suggestCode, type CodeLength } from "@/lib/todays-code";

type Shown = { code: string; expiresAt: string };

/**
 * Today's code (Jon, Nov 20 2026; the resume code of Oct 13 2026): the one code to put on the
 * board. It works for every one of the teacher's classes: it resumes a paused test and opens
 * any test that asks for an access code. The teacher types their own (a word and numbers) for
 * this hour or the rest of the school day, or takes a random one for the hour; "Turn off" ends
 * it early.
 */
export function ResumeCodeButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const { run, pending, error, fieldErrors } = useAction();
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
        Today&apos;s code
      </Button>
      <ResumeCodeDialog
        open={open}
        onOpenChange={setOpen}
        shown={shown}
        pending={pending}
        error={error}
        fieldErrors={fieldErrors}
        onNew={() => load(true)}
        onSet={(code, length, done) =>
          run(setTodaysCode({ code, length }), (d) => {
            setShown(d);
            done();
          })
        }
        onOff={() => run(endTodaysCode(), () => setShown(null))}
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
  const [setting, setSetting] = useState(false);
  const { run, pending, error, fieldErrors } = useAction();
  const load = (fresh: boolean) =>
    run(getResumeCode(fresh), (d) => {
      setShown(d);
      setExpired(false);
    });
  const openDialog = (set: boolean) => {
    setSetting(set);
    setOpen(true);
  };

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
            Today&apos;s code{" "}
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
          <Button size="sm" variant="outline" onClick={() => openDialog(false)}>
            <Maximize2 data-icon="inline-start" aria-hidden />
            Show big
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openDialog(true)} data-code-change>
            <Pencil data-icon="inline-start" aria-hidden />
            Change
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(endTodaysCode(), () => setShown(null))}
            data-code-off
          >
            <Power data-icon="inline-start" aria-hidden />
            Turn off
          </Button>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">
            {shown ? "Today's code ran out." : "No code running."}
          </span>
          <Button size="sm" variant="outline" onClick={() => openDialog(true)} data-code-set>
            <Pencil data-icon="inline-start" aria-hidden />
            Set today&apos;s code
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => load(false)}>
            Random code
          </Button>
        </>
      )}
      {error && !open ? <span className="text-xs text-error-foreground">{error}</span> : null}
      <ResumeCodeDialog
        open={open}
        onOpenChange={setOpen}
        shown={live}
        pending={pending}
        error={error}
        fieldErrors={fieldErrors}
        startSetting={setting}
        onNew={() => load(true)}
        onSet={(code, length, done) =>
          run(setTodaysCode({ code, length }), (d) => {
            setShown(d);
            setExpired(false);
            done();
          })
        }
        onOff={() => run(endTodaysCode(), () => setShown(null))}
      />
    </div>
  );
}

function ResumeCodeDialog({
  open,
  onOpenChange,
  shown,
  pending,
  error,
  fieldErrors,
  startSetting = false,
  onNew,
  onSet,
  onOff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shown: Shown | null;
  pending: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]>;
  /** Open on the "set my own" form rather than the big code. */
  startSetting?: boolean;
  onNew: () => void;
  onSet: (code: string, length: CodeLength, done: () => void) => void;
  onOff: () => void;
}) {
  const [setting, setSetting] = useState(startSetting);
  const [typed, setTyped] = useState("");
  const [length, setLength] = useState<CodeLength>("day");
  // Each opening starts where the button that opened it asked (set during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setSetting(startSetting);
      setTyped("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{setting ? "Set today's code" : "Today's code"}</DialogTitle>
          <DialogDescription>
            {setting
              ? "Pick a word and a couple of numbers you can say out loud. It replaces the code that is running now."
              : "Put this on the board. It works for all your classes until it runs out: it resumes a paused test and opens any test that asks for a code."}
          </DialogDescription>
        </DialogHeader>
        {setting ? (
          <form
            className="flex flex-col gap-4"
            data-code-form
            onSubmit={(e) => {
              e.preventDefault();
              onSet(typed, length, () => setSetting(false));
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="todays-code">Code</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="todays-code"
                  name="code"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={30}
                  className="h-11 max-w-56 font-mono text-lg"
                  placeholder="coffee123"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setTyped(suggestCode())}
                  data-code-suggest
                >
                  <Sparkles data-icon="inline-start" aria-hidden />
                  Suggest one
                </Button>
              </div>
              <FieldError errors={fieldErrors} name="code" />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Good for</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Good for">
                {(
                  [
                    ["day", "The rest of the school day (4:00 PM)"],
                    ["hour", "This hour (50 minutes)"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={length === value ? "default" : "outline"}
                    aria-pressed={length === value}
                    onClick={() => setLength(value)}
                    data-code-length={value}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              While it runs, a test&apos;s own access code is not the only way in. Closed tests stay
              closed, and retake rules still apply.
            </p>
            {error && !fieldErrors.code?.length ? (
              <p className="text-sm text-error-foreground">{error}</p>
            ) : null}
            <DialogFooter>
              {shown ? (
                <Button type="button" variant="ghost" onClick={() => setSetting(false)}>
                  Back
                </Button>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Use this code"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <p
              className={`py-4 text-center font-mono font-semibold break-all text-brand-deep ${
                (shown?.code.length ?? 6) <= 10
                  ? "text-4xl tracking-[0.15em] sm:text-6xl"
                  : "text-3xl tracking-wider sm:text-4xl"
              }`}
              data-resume-code
            >
              {shown?.code ?? "······"}
            </p>
            <p className="text-center text-sm text-muted-foreground">
              {shown
                ? `Good until ${new Date(shown.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : pending
                  ? "Getting a code…"
                  : "No code is running."}
            </p>
            {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
            <DialogFooter>
              {shown ? (
                <Button variant="ghost" disabled={pending} onClick={onOff} data-code-off>
                  <Power data-icon="inline-start" aria-hidden />
                  Turn off
                </Button>
              ) : null}
              <Button variant="ghost" disabled={pending} onClick={onNew}>
                <RefreshCw data-icon="inline-start" aria-hidden />
                Random code
              </Button>
              <Button variant="outline" onClick={() => setSetting(true)} data-code-change>
                <Pencil data-icon="inline-start" aria-hidden />
                Set my own
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
