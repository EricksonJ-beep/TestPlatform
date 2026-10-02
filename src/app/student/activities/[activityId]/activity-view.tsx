"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ExternalLink } from "lucide-react";
import { cn } from "cn";
import {
  INTERACTIVE_MESSAGE_SOURCE,
  KIND_LABEL,
  KIND_RULE,
  markWatched,
  VIDEO_WATCH_THRESHOLD,
  watchPercent,
} from "@/lib/practice-rules";
import type { StudentActivityView } from "@/lib/queries/practice";
import { RichText } from "@/components/rich-text";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { finishActivity } from "../../practice/actions";

type Done = { completed: boolean; awaitingTeacher: boolean };

/** The student-facing activity page: the content, its rule, and a completion that the server verifies. */
export function ActivityView({ view }: { view: StudentActivityView }) {
  const router = useRouter();
  const [done, setDone] = useState<Done>({
    completed: !!view.completion,
    awaitingTeacher:
      !!view.completion && view.requiresTeacherVerification && !view.completion.teacherVerified,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const finish = useCallback(
    async (evidence: Record<string, unknown>) => {
      setSaving(true);
      setError(null);
      const r = await finishActivity(view.id, evidence);
      setSaving(false);
      if (r.ok) {
        setDone(r.data);
        router.refresh();
      } else setError(r.error);
      return r.ok;
    },
    [view.id, router]
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4" data-activity-view={view.id}>
      <Link
        href="/student"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Home
      </Link>
      <div>
        <h1 className="text-2xl">{view.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span>{KIND_LABEL[view.kind]}</span>
          {view.courseName ? <span>· {view.courseName}</span> : null}
          {view.targets.map((t) => (
            <TargetChip key={t.id} code={t.code} title={t.title} className="h-5" />
          ))}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">To complete: {KIND_RULE[view.kind]}</p>
      </div>

      {done.completed ? (
        <p
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium",
            done.awaitingTeacher
              ? "bg-warning-soft text-warning-foreground"
              : "bg-success-soft text-success-foreground"
          )}
          data-activity-done={done.awaitingTeacher ? "pending" : "done"}
        >
          <Check className="size-4" aria-hidden />
          {done.awaitingTeacher
            ? "Marked finished. Your teacher will confirm it before it counts toward a retake."
            : "Done. This counts toward your retake checklist."}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-error-soft px-4 py-2 text-sm text-error-foreground"
        >
          {error}
        </p>
      ) : null}

      {view.content && view.kind !== "reading" ? (
        <Prose text={view.content} className="rounded-lg border border-border bg-card px-5 py-4" />
      ) : null}

      {view.kind === "video" && view.url ? (
        <VideoActivity url={view.url} done={done.completed} saving={saving} onFinish={finish} />
      ) : view.kind === "reading" ? (
        <ReadingActivity
          content={view.content ?? ""}
          done={done.completed}
          saving={saving}
          onFinish={finish}
        />
      ) : view.kind === "link" && view.url ? (
        <LinkActivity url={view.url} done={done.completed} saving={saving} onFinish={finish} />
      ) : view.kind === "interactive" && view.url ? (
        <InteractiveActivity
          url={view.url}
          done={done.completed}
          result={view.completion?.evidence?.interactive ?? null}
          onFinish={finish}
        />
      ) : view.kind === "worksheet" ? (
        <WorksheetActivity url={view.url} done={done.completed} />
      ) : view.kind === "guided_notes" ? (
        <GuidedNotesActivity
          prompts={view.prompts ?? []}
          initial={view.completion?.evidence?.answers ?? {}}
          done={done.completed}
          saving={saving}
          onFinish={finish}
        />
      ) : (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          This activity isn&apos;t ready yet. Check back soon.
        </p>
      )}
    </div>
  );
}

/** Paragraphs split on blank lines, each through Bloom's light markup. */
function Prose({ text, className }: { text: string; className?: string }) {
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <div className={cn("flex flex-col gap-3 text-[15px] leading-relaxed", className)}>
      {paras.map((p, i) => (
        <RichText key={i} text={p} as="p" className="whitespace-pre-wrap" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive page (Jon, Oct 2 2026): an embedded page such as the skin-model
// labeling practice; it posts { source: "bloom-practice", type: "complete", … }
// to its parent when every label is placed, and that message is the evidence.
// ---------------------------------------------------------------------------

type InteractiveResult = {
  total: number;
  firstTry: number;
  misses: number;
  seconds: number;
  missedTerms: string[];
};

function InteractiveActivity({
  url,
  done,
  result,
  onFinish,
}: {
  url: string;
  done: boolean;
  result: InteractiveResult | null;
  onFinish: (e: Record<string, unknown>) => Promise<boolean>;
}) {
  const [last, setLast] = useState<InteractiveResult | null>(result);
  const reported = useRef(false);
  useEffect(() => {
    // Only trust messages from the page we embedded: same origin for /activities/…, else its host.
    // Computed here, not during render: there is no `window` on the server.
    let expectedOrigin = window.location.origin;
    try {
      expectedOrigin = new URL(url, window.location.href).origin;
    } catch {
      /* keep the app's own origin */
    }
    function onMessage(e: MessageEvent) {
      if (e.origin !== expectedOrigin) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || d.source !== INTERACTIVE_MESSAGE_SOURCE || d.type !== "complete") return;
      if (reported.current) return;
      reported.current = true;
      const r: InteractiveResult = {
        total: Number(d.total) || 0,
        firstTry: Number(d.firstTry) || 0,
        misses: Number(d.misses) || 0,
        seconds: Number(d.seconds) || 0,
        missedTerms: Array.isArray(d.missedTerms) ? d.missedTerms.map(String) : [],
      };
      setLast(r);
      void onFinish({ interactive: { ...r, activity: d.activity } }).then((ok) => {
        if (!ok) reported.current = false;
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [url, onFinish]);
  return (
    <section className="flex flex-col gap-3" data-interactive-activity>
      {last ? (
        <p
          className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-interactive-result
        >
          {last.firstTry} of {last.total} on the first try, {last.misses}{" "}
          {last.misses === 1 ? "miss" : "misses"}
          {last.missedTerms.length ? ` (${last.missedTerms.join(", ")})` : ""}.
          {done ? " You can keep practicing; this stays complete." : ""}
        </p>
      ) : null}
      <iframe
        src={url}
        title="Activity"
        className="h-[1300px] w-full rounded-lg border border-border bg-white"
        allow="fullscreen"
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="size-3" aria-hidden /> Open in its own tab (completion still counts
        only here)
      </a>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Video: YouTube IFrame API or an uploaded file; ≥90% of seconds actually played
// ---------------------------------------------------------------------------

export function youtubeId(url: string): string | null {
  const m =
    url.match(/youtu\.be\/([\w-]{6,})/) ??
    url.match(/[?&]v=([\w-]{6,})/) ??
    url.match(/youtube\.com\/(?:embed|shorts|live)\/([\w-]{6,})/);
  return m ? m[1] : null;
}

type YTPlayer = { getCurrentTime(): number; getDuration(): number; destroy(): void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, number>;
      events?: Record<string, () => void>;
    }
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function VideoActivity({
  url,
  done,
  saving,
  onFinish,
}: {
  url: string;
  done: boolean;
  saving: boolean;
  onFinish: (e: Record<string, unknown>) => Promise<boolean>;
}) {
  const ytId = youtubeId(url);
  const [percent, setPercent] = useState(0);
  const watched = useRef(new Set<number>());
  const last = useRef<number | null>(null);
  const sent = useRef(done);
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const tick = useCallback((now: number, duration: number) => {
    if (!duration || !Number.isFinite(duration)) return;
    if (last.current !== null) watched.current = markWatched(watched.current, last.current, now);
    last.current = now;
    const pct = watchPercent(watched.current, duration);
    setPercent(pct);
    if (pct >= VIDEO_WATCH_THRESHOLD && !sent.current) {
      sent.current = true;
      void onFinishRef.current({ watchPercent: pct }).then((ok) => {
        if (!ok) sent.current = false;
      });
    }
  }, []);

  // YouTube: load the IFrame API once, then poll the player each second.
  useEffect(() => {
    if (!ytId || !hostRef.current) return;
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const host = hostRef.current;
    const create = () => {
      if (!window.YT) return;
      const el = document.createElement("div");
      host.replaceChildren(el);
      player = new window.YT.Player(el, {
        videoId: ytId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            timer = setInterval(() => {
              if (player) tick(player.getCurrentTime(), player.getDuration());
            }, 1000);
          },
        },
      });
    };
    if (window.YT?.Player) create();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        create();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(s);
      }
    }
    return () => {
      if (timer) clearInterval(timer);
      player?.destroy();
    };
  }, [ytId, tick]);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      {ytId ? (
        <div className="aspect-video w-full overflow-hidden rounded-md bg-black [&>iframe]:h-full [&>iframe]:w-full">
          <div ref={hostRef} className="h-full w-full" />
        </div>
      ) : (
        <video
          ref={videoRef}
          src={url}
          controls
          playsInline
          className="w-full rounded-md bg-black"
          onTimeUpdate={(e) => tick(e.currentTarget.currentTime, e.currentTarget.duration)}
        />
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn(
              "h-full transition-[width]",
              percent >= VIDEO_WATCH_THRESHOLD || done ? "bg-success" : "bg-brand"
            )}
            style={{ width: `${done ? 100 : Math.min(100, percent)}%` }}
          />
        </div>
        <span className="text-muted-foreground tabular" data-watch-percent>
          {done ? "Watched" : `Watched ${Math.floor(percent)}% · 90% needed`}
        </span>
        {!done && percent >= VIDEO_WATCH_THRESHOLD ? (
          <Button
            size="sm"
            disabled={saving}
            onClick={() => void onFinish({ watchPercent: percent })}
          >
            Mark watched
          </Button>
        ) : null}
      </div>
      {ytId ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:underline"
        >
          Video won&apos;t play? Open on YouTube (watching there doesn&apos;t count).
        </a>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reading: scrolled to the end + "I finished"
// ---------------------------------------------------------------------------

function ReadingActivity({
  content,
  done,
  saving,
  onFinish,
}: {
  content: string;
  done: boolean;
  saving: boolean;
  onFinish: (e: Record<string, unknown>) => Promise<boolean>;
}) {
  const [atEnd, setAtEnd] = useState(done);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!endRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setAtEnd(true);
      },
      { threshold: 0.1 }
    );
    io.observe(endRef.current);
    return () => io.disconnect();
  }, []);
  return (
    <section className="flex flex-col gap-3">
      <article className="rounded-lg border border-border bg-card px-5 py-4">
        <Prose text={content} />
        <div ref={endRef} className="h-px" aria-hidden data-reading-end />
      </article>
      {!done ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span className="mr-auto text-muted-foreground">
            {atEnd ? "You reached the end." : "Scroll to the end, then mark it finished."}
          </span>
          <Button
            size="lg"
            disabled={!atEnd || saving}
            onClick={() => void onFinish({ scrolledToEnd: true, confirmed: true })}
            data-finish
          >
            I finished
          </Button>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Link: opened + "I finished" (optionally teacher-verified)
// ---------------------------------------------------------------------------

function LinkActivity({
  url,
  done,
  saving,
  onFinish,
}: {
  url: string;
  done: boolean;
  saving: boolean;
  onFinish: (e: Record<string, unknown>) => Promise<boolean>;
}) {
  const [opened, setOpened] = useState(done);
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep the raw url */
  }
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4 text-sm">
      <Button
        size="lg"
        variant={opened ? "outline" : "default"}
        nativeButton={false}
        className="self-start"
        render={<a href={url} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} />}
      >
        <ExternalLink data-icon="inline-start" aria-hidden />
        Open {host}
      </Button>
      {!done ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="mr-auto text-muted-foreground">
            {opened ? "When you're done there, mark it finished." : "Open the link first."}
          </span>
          <Button
            size="lg"
            disabled={!opened || saving}
            onClick={() => void onFinish({ confirmed: true })}
            data-finish
          >
            I finished
          </Button>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Worksheet: completes from the worksheet's own final submit (Ticket 1.14)
// ---------------------------------------------------------------------------

function WorksheetActivity({ url, done }: { url: string | null; done: boolean }) {
  if (!url)
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Your teacher hasn&apos;t added this worksheet&apos;s link yet. Use the link from Google
        Classroom; your submit still counts here.
      </p>
    );
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4 text-sm">
      <Button
        size="lg"
        variant={done ? "outline" : "default"}
        nativeButton={false}
        className="self-start"
        render={<a href={url} target="_blank" rel="noreferrer" />}
      >
        <ExternalLink data-icon="inline-start" aria-hidden />
        Open the worksheet
      </Button>
      <p className="text-muted-foreground">
        Sign in there with your Cadott Google account. When you press its final Submit, this page
        updates on its own.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Guided notes: every prompt answered
// ---------------------------------------------------------------------------

function GuidedNotesActivity({
  prompts,
  initial,
  done,
  saving,
  onFinish,
}: {
  prompts: { id: string; prompt: string }[];
  initial: Record<string, string>;
  done: boolean;
  saving: boolean;
  onFinish: (e: Record<string, unknown>) => Promise<boolean>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const blank = prompts.filter((p) => !(answers[p.id] ?? "").trim()).length;
  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onFinish({ answers });
      }}
    >
      {prompts.map((p, i) => (
        <div key={p.id} className="grid gap-1.5">
          <label htmlFor={`gn-${p.id}`} className="text-[15px] leading-snug">
            <span className="mr-1 text-muted-foreground tabular">{i + 1}.</span>
            <RichText text={p.prompt} />
          </label>
          <Textarea
            id={`gn-${p.id}`}
            rows={3}
            value={answers[p.id] ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
            placeholder="In your own words…"
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="mr-auto text-muted-foreground tabular">
          {blank === 0
            ? done
              ? "Saved. You can revise and resubmit."
              : "Every prompt answered."
            : `${blank} ${blank === 1 ? "prompt" : "prompts"} left`}
        </span>
        <Button type="submit" size="lg" disabled={blank > 0 || saving} data-finish>
          {done ? "Save changes" : "Submit notes"}
        </Button>
      </div>
    </form>
  );
}
