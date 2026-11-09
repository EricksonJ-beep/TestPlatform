"use client";

import { isRetryable, safe } from "@/lib/safe-action";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, CheckCircle2, Circle, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import type { QuickCheck, RelearningProgress, RelearningSectionBody } from "@/db/schema";
import { activityFrameHeight } from "@/lib/hosted-activities";
import { INTERACTIVE_MESSAGE_SOURCE, markWatched } from "@/lib/practice-rules";
import {
  dueCheck,
  gradeCheck,
  SHORT_ANSWER_MIN,
  sectionDone,
  sectionRule,
  segmentWatchPercent,
  WATCH_PERCENT,
  type PublicCheck,
  type RelearningMode,
} from "@/lib/relearning";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import {
  answerRelearningCheck,
  flagRelearningVideo,
  markRelearningSection,
  saveRelearningShortAnswer,
  startRelearning,
} from "../actions";

export type ActivitySection = {
  id: string;
  part: "core" | "extension";
  title: string | null;
  body: RelearningSectionBody;
  checks: PublicCheck[];
  shortAnswerPrompt: string | null;
  estMinutes: number;
  /** Jon's own recording (A6), streamed from Bloom's storage. */
  videoUrl: string | null;
};

export type ActivityRow = {
  id: string;
  targetId: string;
  code: string;
  title: string;
  finished: boolean;
  checkedOff: boolean;
  progress: RelearningProgress;
  /** Explanations of the checks already answered right (A3). */
  explanations: Record<string, string>;
  sections: ActivitySection[];
};

type Ops = {
  progress: RelearningProgress;
  explanations: Record<string, string>;
  answer: (sectionId: string, checkId: string, answer: string) => Promise<boolean | null>;
  mark: (
    sectionId: string,
    patch: { scrolledToEnd?: boolean; watchPercent?: number; completed?: boolean }
  ) => void;
  saveShort: (sectionId: string, text: string) => Promise<boolean>;
  flag: (sectionId: string, code: string | null) => void;
};

/**
 * The relearning activity (A1–A3): every section the bundle serves, in order (a quiz's targets one
 * after another, Q3), each with its own part and its quick checks. Progress saves as the student
 * goes; when every section of every row is done the server finishes the activity and the page
 * shows the practice check. The mode can switch until then (A4), and a video that won't play
 * offers the other modes (A6).
 *
 * `preview` is the teacher's "Preview as student" in the Read · Watch · Do editor: the same
 * cards, with the option's own checks (key included) graded in the browser and nothing saved.
 */
export function RelearningActivity({
  assignmentId,
  targetId,
  mode,
  modeLabel,
  switchTo,
  rows,
  preview,
}: {
  assignmentId: string;
  targetId: string | null;
  mode: RelearningMode;
  modeLabel: string;
  switchTo: { mode: RelearningMode; label: string }[];
  rows: ActivityRow[];
  /** Preview only: the checks with their answers and explanations, by check id. */
  preview?: Record<string, QuickCheck>;
}) {
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const minutes = rows.reduce((n, r) => n + r.sections.reduce((m, s) => m + s.estMinutes, 0), 0);
  const switchMode = useCallback(
    (to: RelearningMode) =>
      startSwitch(async () => {
        if (preview) return;
        const r = await safe(startRelearning(assignmentId, to, { targetId }));
        if (r.ok) {
          setSwitchError(null);
          router.refresh();
        } else setSwitchError(r.error);
      }),
    [assignmentId, targetId, router, preview]
  );

  return (
    <section className="flex flex-col gap-4" data-relearning-activity={mode}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="font-medium">{modeLabel}</span>
        <span className="text-muted-foreground tabular">About {Math.max(1, minutes)} min</span>
        {switchTo.length ? (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Switch to</span>
            {switchTo.map((s) => (
              <Button
                key={s.mode}
                size="sm"
                variant="outline"
                disabled={switching}
                onClick={() => switchMode(s.mode)}
                data-switch-mode={s.mode}
              >
                {s.label}
              </Button>
            ))}
          </span>
        ) : null}
        {switchError ? <p className="w-full text-error-foreground">{switchError}</p> : null}
      </div>
      {rows.map((row) => (
        <RowSections
          key={row.id}
          row={row}
          stitched={rows.length > 1}
          switchTo={switchTo}
          onSwitch={switchMode}
          onFinished={() => (preview ? undefined : router.refresh())}
          preview={preview}
        />
      ))}
    </section>
  );
}

function RowSections({
  row,
  stitched,
  switchTo,
  onSwitch,
  onFinished,
  preview,
}: {
  row: ActivityRow;
  stitched: boolean;
  switchTo: { mode: RelearningMode; label: string }[];
  onSwitch: (mode: RelearningMode) => void;
  onFinished: () => void;
  preview?: Record<string, QuickCheck>;
}) {
  const [progress, setProgress] = useState<RelearningProgress>(row.progress);
  const [explanations, setExplanations] = useState(row.explanations);
  const finishedRef = useRef(row.finished);
  const done = (r: { rowFinished: boolean }) => {
    if (r.rowFinished && !finishedRef.current) {
      finishedRef.current = true;
      onFinished();
    }
  };

  const ops: Ops = {
    progress,
    explanations,
    answer: async (sectionId, checkId, answer) => {
      const r = preview
        ? previewAnswer(preview[checkId], answer)
        : await safe(answerRelearningCheck(row.id, sectionId, checkId, answer));
      if (!r.ok) return null;
      setProgress((p) => {
        const prior = p.checks?.[checkId];
        return {
          ...p,
          checks: {
            ...p.checks,
            [checkId]: {
              correct: (prior?.correct ?? false) || r.data.correct,
              tries: (prior?.tries ?? 0) + 1,
              at: new Date().toISOString(),
            },
          },
        };
      });
      if (r.data.correct && r.data.explanation)
        setExplanations((e) => ({ ...e, [checkId]: r.data.explanation! }));
      done(r.data);
      return r.data.correct;
    },
    mark: (sectionId, patch) => {
      setProgress((p) => {
        const cur = p.sections?.[sectionId] ?? {};
        return {
          ...p,
          sections: {
            ...p.sections,
            [sectionId]: {
              ...cur,
              ...(patch.scrolledToEnd ? { scrolledToEnd: true } : {}),
              ...(patch.completed ? { completed: true } : {}),
              ...(patch.watchPercent !== undefined
                ? { watchPercent: Math.max(cur.watchPercent ?? 0, patch.watchPercent) }
                : {}),
            },
          },
        };
      });
      if (preview) return;
      // Reading to the end or watching a segment: sent again a few times if it doesn't arrive,
      // so a section never shows done here and undone after a refresh (H1.5).
      const send = (triesLeft: number) =>
        void safe(markRelearningSection(row.id, sectionId, patch)).then((r) => {
          if (r.ok) done(r.data);
          else if (isRetryable(r) && triesLeft > 0) setTimeout(() => send(triesLeft - 1), 4000);
        });
      send(5);
    },
    saveShort: async (sectionId, text) => {
      const r = preview
        ? ({ ok: true, data: { rowFinished: false } } as const)
        : await safe(saveRelearningShortAnswer(row.id, sectionId, text));
      if (!r.ok) return false;
      setProgress((p) => ({ ...p, shortAnswers: { ...p.shortAnswers, [sectionId]: text } }));
      done(r.data);
      return true;
    },
    flag: (sectionId, code) => {
      if (!preview) void flagRelearningVideo(row.id, sectionId, code);
    },
  };

  return (
    <div className="flex flex-col gap-3" data-relearning-row={row.code}>
      {stitched ? (
        <h2 className="text-base font-medium">
          {row.code} <span className="font-normal text-muted-foreground">· {row.title}</span>
        </h2>
      ) : null}
      {row.sections.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          {row.finished
            ? "Your teacher checked this one off."
            : `Your teacher will give you a relearning activity for ${row.code}.`}
        </p>
      ) : null}
      {row.sections.map((s) => (
        <SectionCard key={s.id} section={s} ops={ops} switchTo={switchTo} onSwitch={onSwitch} />
      ))}
    </div>
  );
}

function SectionCard({
  section,
  ops,
  switchTo,
  onSwitch,
}: {
  section: ActivitySection;
  ops: Ops;
  switchTo: { mode: RelearningMode; label: string }[];
  onSwitch: (mode: RelearningMode) => void;
}) {
  const isDone = sectionDone(section, ops.progress);
  const b = section.body;
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card px-4 py-4 sm:px-5",
        isDone ? "border-success/40" : "border-border"
      )}
      data-section={section.id}
      data-section-done={isDone}
    >
      <header className="flex flex-wrap items-center gap-2 text-sm">
        {isDone ? (
          <CheckCircle2 className="size-5 text-success-foreground" aria-label="done" />
        ) : (
          <Circle className="size-5 text-muted-foreground" aria-label="not done yet" />
        )}
        <span className="font-medium">
          {section.title ?? (section.part === "core" ? "The key idea" : "Go further")}
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {section.part === "core" ? "Core" : "Extension"} · about {section.estMinutes} min
        </span>
        {!isDone ? (
          <span className="ml-auto text-xs text-muted-foreground">{sectionRule(b)}</span>
        ) : null}
      </header>
      {b.type === "text" ? (
        <TextBody section={section} body={b} ops={ops} />
      ) : b.type === "video" ? (
        <VideoBody section={section} body={b} ops={ops} switchTo={switchTo} onSwitch={onSwitch} />
      ) : b.type === "interactive" ? (
        <InteractiveBody section={section} body={b} ops={ops} />
      ) : b.type === "flashcards" ? (
        <FlashcardsBody section={section} body={b} ops={ops} />
      ) : (
        <WorkedStepsBody section={section} body={b} ops={ops} />
      )}
      {b.type !== "video" && b.type !== "worked_steps"
        ? section.checks.map((c) => (
            <QuickCheckCard key={c.id} check={c} section={section} ops={ops} />
          ))
        : null}
      {section.shortAnswerPrompt ? <ShortAnswer section={section} ops={ops} /> : null}
    </article>
  );
}

/** The editor's preview grades in the browser, the way the server would (nothing is saved). */
function previewAnswer(check: QuickCheck | undefined, answer: string) {
  const correct = !!check && gradeCheck(check, answer);
  return {
    ok: true as const,
    data: {
      correct,
      explanation: correct ? (check?.explanation ?? null) : null,
      rowFinished: false,
    },
  };
}

/** Bloom rich text, a blank line per paragraph (the v2 reading's look). */
export function Prose({ text }: { text: string }) {
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
      {paras.map((p, i) => (
        <RichText key={i} text={p} as="p" className="whitespace-pre-wrap" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read: the text, read to the end (A3)
// ---------------------------------------------------------------------------

function TextBody({
  section,
  body,
  ops,
}: {
  section: ActivitySection;
  body: Extract<RelearningSectionBody, { type: "text" }>;
  ops: Ops;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const reached = ops.progress.sections?.[section.id]?.scrolledToEnd === true;
  const { mark } = ops;
  useEffect(() => {
    if (reached || !endRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          mark(section.id, { scrolledToEnd: true });
        }
      },
      { threshold: 0.1 }
    );
    io.observe(endRef.current);
    return () => io.disconnect();
    // `mark` changes every render; the observer only needs the section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reached, section.id]);
  return (
    <>
      <Prose text={body.text} />
      <div ref={endRef} className="h-px" aria-hidden data-reading-end />
    </>
  );
}

// ---------------------------------------------------------------------------
// Watch: YouTube (IFrame API) or Jon's own recording; pauses for each check at its time, 90% of
// the segment watched (A1, A3); a player error flags the video and offers Read or Do (A6)
// ---------------------------------------------------------------------------

type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  pauseVideo(): void;
  playVideo(): void;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: () => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
};

/** How long the YouTube player may take to load before it counts as blocked (a school filter). */
const YOUTUBE_LOAD_MS = 15_000;

/**
 * Load the IFrame API once. `onFail` runs when the script can't load at all or never gets ready
 * (youtube.com blocked outright, not just Restricted Mode), so the student isn't left staring at
 * an empty box.
 */
function loadYouTube(onReady: () => void, onFail: () => void): () => void {
  const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) {
    onReady();
    return () => undefined;
  }
  let settled = false;
  const timer = window.setTimeout(() => {
    if (!settled && !w.YT?.Player) {
      settled = true;
      onFail();
    }
  }, YOUTUBE_LOAD_MS);
  const prev = w.onYouTubeIframeAPIReady;
  w.onYouTubeIframeAPIReady = () => {
    prev?.();
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    onReady();
  };
  let script = document.querySelector<HTMLScriptElement>(
    'script[src="https://www.youtube.com/iframe_api"]'
  );
  if (!script) {
    script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  }
  script.addEventListener("error", () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    onFail();
  });
  return () => {
    settled = true;
    window.clearTimeout(timer);
  };
}

function VideoBody({
  section,
  body,
  ops,
  switchTo,
  onSwitch,
}: {
  section: ActivitySection;
  body: Extract<RelearningSectionBody, { type: "video" }>;
  ops: Ops;
  switchTo: { mode: RelearningMode; label: string }[];
  onSwitch: (mode: RelearningMode) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const watched = useRef(new Set<number>());
  const last = useRef<number | null>(null);
  const saved = ops.progress.sections?.[section.id]?.watchPercent ?? 0;
  const reported = useRef(saved);
  const [percent, setPercent] = useState(saved);
  const [broken, setBroken] = useState(false);
  const [paused, setPaused] = useState<PublicCheck | null>(null);
  const progressRef = useRef(ops.progress);
  const opsRef = useRef(ops);
  // The player's timer reads the latest progress and callbacks, not the first render's.
  useEffect(() => {
    progressRef.current = ops.progress;
    opsRef.current = ops;
  });
  const start = body.startSeconds ?? 0;

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo();
    videoRef.current?.pause();
  }, []);
  const resume = useCallback(() => {
    playerRef.current?.playVideo();
    void videoRef.current?.play().catch(() => undefined);
  }, []);

  const tick = useCallback(
    (now: number, duration: number) => {
      if (!duration || !Number.isFinite(duration)) return;
      if (last.current !== null) watched.current = markWatched(watched.current, last.current, now);
      last.current = now;
      const end = body.endSeconds ?? duration;
      const pct = segmentWatchPercent(watched.current, start, end);
      setPercent((p) => Math.max(p, pct));
      // Report every 10 points, and the moment it crosses the line.
      if (
        pct >= reported.current + 10 ||
        (pct >= WATCH_PERCENT && reported.current < WATCH_PERCENT)
      ) {
        reported.current = pct;
        opsRef.current.mark(section.id, { watchPercent: Math.floor(pct) });
      }
      const due = dueCheck(
        section.checks.map((c) => ({ ...c, answer: "" })),
        progressRef.current,
        now
      );
      if (due) {
        pause();
        setPaused(section.checks.find((c) => c.id === due.id) ?? null);
      }
    },
    [body.endSeconds, start, section.id, section.checks, pause]
  );

  useEffect(() => {
    if (section.videoUrl || !body.youtubeId || !hostRef.current) return;
    const host = hostRef.current;
    let timer: ReturnType<typeof setInterval> | null = null;
    let player: YTPlayer | null = null;
    let cancelled = false;
    const stop = loadYouTube(
      () => {
        if (cancelled) return;
        const w = window as unknown as { YT: YTNamespace };
        const el = document.createElement("div");
        host.replaceChildren(el);
        player = new w.YT.Player(el, {
          videoId: body.youtubeId!,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            ...(body.startSeconds ? { start: Math.floor(body.startSeconds) } : {}),
            ...(body.endSeconds ? { end: Math.ceil(body.endSeconds) } : {}),
          },
          events: {
            onReady: () => {
              playerRef.current = player;
              timer = setInterval(() => {
                if (player) tick(player.getCurrentTime(), player.getDuration());
              }, 500);
            },
            // 2 bad id, 5 HTML5 error, 100 removed or private, 101/150 embedding blocked
            // (Restricted Mode lands here too).
            onError: (e) => {
              setBroken(true);
              opsRef.current.flag(section.id, String(e.data));
            },
          },
        });
      },
      () => {
        if (cancelled) return;
        setBroken(true);
        opsRef.current.flag(section.id, "blocked");
      }
    );
    return () => {
      cancelled = true;
      stop();
      if (timer) clearInterval(timer);
      player?.destroy();
      playerRef.current = null;
    };
  }, [body.youtubeId, body.startSeconds, body.endSeconds, section.videoUrl, section.id, tick]);

  if (broken) {
    return (
      <div
        className="flex flex-col gap-3 rounded-lg border border-warning/50 bg-warning-soft px-4 py-3 text-sm"
        data-video-broken
      >
        <span className="inline-flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
          This video won&apos;t play here. Pick Read or Do instead; your teacher has been told.
        </span>
        <span className="flex flex-wrap gap-2">
          {switchTo.map((s) => (
            <Button key={s.mode} size="lg" onClick={() => onSwitch(s.mode)}>
              {s.label}
            </Button>
          ))}
        </span>
      </div>
    );
  }
  const done = percent >= WATCH_PERCENT;
  return (
    <div className="flex flex-col gap-3">
      {section.videoUrl ? (
        <video
          ref={videoRef}
          src={section.videoUrl}
          controls
          playsInline
          className="w-full rounded-md bg-black"
          onLoadedMetadata={(e) => {
            if (start) e.currentTarget.currentTime = start;
          }}
          onTimeUpdate={(e) => tick(e.currentTarget.currentTime, e.currentTarget.duration)}
          onError={() => {
            setBroken(true);
            ops.flag(section.id, "media");
          }}
        />
      ) : (
        <div className="aspect-video w-full overflow-hidden rounded-md bg-black [&>iframe]:h-full [&>iframe]:w-full">
          <div ref={hostRef} className="h-full w-full" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn("h-full transition-[width]", done ? "bg-success" : "bg-brand")}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
        <span className="text-muted-foreground tabular" data-watch-percent>
          {done ? "Watched" : `Watched ${Math.floor(percent)}% · ${WATCH_PERCENT}% needed`}
        </span>
      </div>
      {paused ? (
        <div className="flex flex-col gap-2" data-video-paused={paused.id}>
          <p className="text-sm font-medium">The video paused for a quick check.</p>
          <QuickCheckCard
            check={paused}
            section={section}
            ops={ops}
            onRight={() => {
              setPaused(null);
              resume();
            }}
          />
        </div>
      ) : null}
      {/* Checks already passed stay visible with their explanations. */}
      {section.checks
        .filter((c) => c.id !== paused?.id && ops.progress.checks?.[c.id]?.correct)
        .map((c) => (
          <QuickCheckCard key={c.id} check={c} section={section} ops={ops} />
        ))}
      {/* A check with no time shows after the video. */}
      {section.checks
        .filter((c) => c.atSeconds === undefined && !ops.progress.checks?.[c.id]?.correct)
        .map((c) => (
          <QuickCheckCard key={c.id} check={c} section={section} ops={ops} />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Do: a hosted drag-and-drop page (postMessage when done), flashcards, worked steps
// ---------------------------------------------------------------------------

function InteractiveBody({
  section,
  body,
  ops,
}: {
  section: ActivitySection;
  body: Extract<RelearningSectionBody, { type: "interactive" }>;
  ops: Ops;
}) {
  const reported = useRef(ops.progress.sections?.[section.id]?.completed === true);
  const opsRef = useRef(ops);
  useEffect(() => {
    opsRef.current = ops;
  });
  // Only Bloom's own hosted pages (public/activities/), so the message's origin is ours.
  const page = body.page.startsWith("/activities/") ? body.page : null;
  useEffect(() => {
    if (!page) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || d.source !== INTERACTIVE_MESSAGE_SOURCE || d.type !== "complete") return;
      if (reported.current) return;
      reported.current = true;
      opsRef.current.mark(section.id, { completed: true });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [page, section.id]);
  if (!page)
    return <p className="text-sm text-muted-foreground">This activity isn&apos;t set up yet.</p>;
  return (
    <iframe
      src={page}
      title={section.title ?? "Activity"}
      className="w-full rounded-lg border border-border bg-white"
      style={{ height: activityFrameHeight(page) }}
      allow="fullscreen"
    />
  );
}

function FlashcardsBody({
  section,
  body,
  ops,
}: {
  section: ActivitySection;
  body: Extract<RelearningSectionBody, { type: "flashcards" }>;
  ops: Ops;
}) {
  const complete = ops.progress.sections?.[section.id]?.completed === true;
  const [flipped, setFlipped] = useState<Set<string>>(
    () => new Set(complete ? body.cards.map((c) => c.id) : [])
  );
  const flip = (id: string) => {
    setFlipped((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [seen, setSeen] = useState<Set<string>>(() => new Set(flipped));
  useEffect(() => {
    if (!complete && body.cards.length && body.cards.every((c) => seen.has(c.id)))
      ops.mark(section.id, { completed: true });
    // Mark once, when the last card is first turned over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, complete]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Tap a card to flip it. {seen.size} of {body.cards.length} turned over.
      </p>
      <div className="grid gap-2 sm:grid-cols-2" data-flashcards>
        {body.cards.map((c) => {
          const back = flipped.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={back}
              onClick={() => {
                flip(c.id);
                setSeen((s) => new Set(s).add(c.id));
              }}
              className={cn(
                "flex min-h-24 items-center justify-center rounded-lg border px-3 py-4 text-center text-[15px] transition-colors",
                back
                  ? "border-brand bg-brand-soft text-brand-deep"
                  : "border-border bg-background hover:bg-muted/50"
              )}
              data-card={c.id}
            >
              {back ? (
                <span className="flex flex-col gap-1">
                  <RichText
                    text={c.front}
                    className="text-xs font-semibold tracking-wide text-brand-deep/70 uppercase"
                  />
                  <RichText text={c.back} />
                </span>
              ) : (
                <RichText text={c.front} className="font-medium" />
              )}
            </button>
          );
        })}
      </div>
      {section.checks.length ? <p className="mt-1 text-sm font-medium">Quick self-quiz</p> : null}
    </div>
  );
}

function WorkedStepsBody({
  section,
  body,
  ops,
}: {
  section: ActivitySection;
  body: Extract<RelearningSectionBody, { type: "worked_steps" }>;
  ops: Ops;
}) {
  const complete = ops.progress.sections?.[section.id]?.completed === true;
  const [shown, setShown] = useState(complete ? body.steps.length : 0);
  const right = (id: string) => ops.progress.checks?.[id]?.correct === true;
  const after = (stepId: string) => section.checks.filter((c) => c.afterStepId === stepId);
  // The next step waits until the checks after the last one shown are right.
  const lastShown = shown > 0 ? body.steps[shown - 1] : null;
  const waiting = lastShown ? after(lastShown.id).some((c) => !right(c.id)) : false;
  const loose = section.checks.filter((c) => !c.afterStepId);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md bg-muted/40 px-3 py-2">
        <Prose text={body.problem} />
      </div>
      <ol className="flex flex-col gap-3">
        {body.steps.slice(0, shown).map((step, i) => (
          <li key={step.id} className="flex flex-col gap-2" data-step={step.id}>
            <div className="flex gap-2">
              <span className="shrink-0 font-semibold whitespace-nowrap text-brand-deep tabular">
                Step {i + 1}.
              </span>
              <Prose text={step.text} />
            </div>
            {after(step.id).map((c) => (
              <QuickCheckCard key={c.id} check={c} section={section} ops={ops} />
            ))}
          </li>
        ))}
      </ol>
      {shown < body.steps.length ? (
        <Button
          size="lg"
          variant="outline"
          className="self-start"
          disabled={waiting}
          onClick={() => {
            const next = shown + 1;
            setShown(next);
            if (next === body.steps.length && !complete) ops.mark(section.id, { completed: true });
          }}
          data-next-step
        >
          <Play data-icon="inline-start" aria-hidden />
          {shown === 0
            ? "Show the first step"
            : waiting
              ? "Answer the check to go on"
              : "Show the next step"}
        </Button>
      ) : null}
      {shown === body.steps.length
        ? loose.map((c) => <QuickCheckCard key={c.id} check={c} section={section} ops={ops} />)
        : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick checks (decision 7): unlimited tries, graded on the server; the short answer
// ---------------------------------------------------------------------------

function QuickCheckCard({
  check,
  section,
  ops,
  onRight,
}: {
  check: PublicCheck;
  section: ActivitySection;
  ops: Ops;
  onRight?: () => void;
}) {
  const state = ops.progress.checks?.[check.id];
  const right = state?.correct === true;
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (answer: string) => {
    if (!answer.trim() || busy) return;
    setBusy(true);
    const r = await ops.answer(section.id, check.id, answer);
    setBusy(false);
    if (r === null) return setError("That didn't go through. Check your wifi and try again.");
    setError(null);
    setWrong(!r);
    if (r) onRight?.();
  };
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-3 py-3 text-sm",
        right ? "border-success/40 bg-success-soft/40" : "border-border bg-background"
      )}
      data-quick-check={check.id}
      data-check-right={right}
    >
      <RichText text={check.prompt} as="p" className="font-medium" />
      {check.kind === "multiple_choice" ? (
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={check.prompt}>
          {(check.options ?? []).map((o) => (
            <label
              key={o.id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3",
                value === o.id ? "border-brand bg-brand-soft/60" : "border-border",
                right ? "cursor-default" : ""
              )}
            >
              <input
                type="radio"
                name={`${section.id}-${check.id}`}
                className="size-4 accent-[var(--brand)]"
                value={o.id}
                checked={value === o.id}
                disabled={right || busy}
                onChange={() => {
                  setValue(o.id);
                  setWrong(false);
                }}
              />
              <RichText text={o.text} />
            </label>
          ))}
        </div>
      ) : (
        <input
          type="text"
          className="h-11 rounded-md border border-input bg-background px-3"
          value={value}
          disabled={right || busy}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit(value);
          }}
          aria-label="Your answer"
          autoComplete="off"
        />
      )}
      {right ? (
        <p
          className="flex items-start gap-1.5 text-success-foreground"
          data-check-feedback="right"
          role="status"
        >
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Right!
            {ops.explanations[check.id] ? (
              <>
                {" "}
                <RichText text={ops.explanations[check.id]} className="text-foreground" />
              </>
            ) : null}
          </span>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={busy || !value.trim()} onClick={() => void submit(value)}>
            Check
          </Button>
          {wrong ? (
            <span
              className="inline-flex items-center gap-1 text-warning-foreground"
              data-check-feedback="wrong"
              role="status"
            >
              <RotateCcw className="size-4" aria-hidden /> Not quite. Look back and try again.
            </span>
          ) : null}
          {error ? (
            <span className="text-error-foreground" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ShortAnswer({ section, ops }: { section: ActivitySection; ops: Ops }) {
  const saved = ops.progress.shortAnswers?.[section.id] ?? "";
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const long = text.trim().length >= SHORT_ANSWER_MIN;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-3 text-sm">
      <label htmlFor={`sa-${section.id}`} className="font-medium">
        <RichText text={section.shortAnswerPrompt ?? ""} />
      </label>
      <textarea
        id={`sa-${section.id}`}
        className="min-h-24 rounded-md border border-input bg-background px-3 py-2"
        value={text}
        maxLength={2000}
        onChange={(e) => {
          setText(e.target.value);
          setStatus(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          variant={saved && saved === text ? "outline" : "default"}
          disabled={busy || !long || saved === text}
          onClick={async () => {
            setBusy(true);
            const okay = await ops.saveShort(section.id, text);
            setBusy(false);
            setStatus(okay ? "Saved." : "That didn't save. Check your wifi and try again.");
          }}
          data-save-short-answer
        >
          Save my answer
        </Button>
        <span className="text-muted-foreground">
          {status ?? (long ? "" : "Write at least a full sentence.")}
        </span>
      </div>
    </div>
  );
}
