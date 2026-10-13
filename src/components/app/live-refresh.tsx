"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "cn";
import { liveState, POLL_MS, type LiveState } from "@/lib/live-refresh";

const TITLE: Record<LiveState, string> = {
  live: "Updates on its own every 15 seconds while this tab is open. Click to stop.",
  hidden: "Updates resume when you come back to this tab.",
  idle: "Stopped after 45 minutes without use. Click to update again.",
  off: "Live updates are off. Click to turn them on.",
};

/**
 * Keeps the Dashboard current (Jon, Oct 13 2026, dashboard plan build step 5): every 15 s, while
 * the tab is visible, it asks `/api/dashboard/version` for the coarse stamp and refreshes the page
 * (server data only; filters, the open panel and scroll stay) when the stamp moved. It stops after
 * 45 minutes without a click, key or scroll, and starts again on the next one. `version` is the
 * stamp the server read just before it read the page, so nothing between the two is missed.
 */
export function LiveRefresh({ classId, version }: { classId: string | null; version: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [on, setOn] = useState(true);
  const [state, setState] = useState<LiveState>("live");
  const known = useRef(version);
  const busy = useRef(false);
  const lastUse = useRef(0);
  const check = useRef<() => void>(() => undefined);

  useEffect(() => {
    known.current = version;
  }, [version]);
  useEffect(() => {
    busy.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    lastUse.current = Date.now();
    const tick = async () => {
      const s = liveState({
        on: true,
        visible: document.visibilityState === "visible",
        lastUseAt: lastUse.current,
        now: Date.now(),
      });
      setState(s);
      if (s !== "live" || busy.current) return;
      try {
        const r = await fetch(
          `/api/dashboard/version${classId ? `?class=${encodeURIComponent(classId)}` : ""}`,
          { cache: "no-store" }
        );
        if (!r.ok || cancelled) return;
        const next = ((await r.json()) as { version?: string }).version;
        if (next && next !== known.current) {
          known.current = next;
          startRefresh(() => router.refresh());
        }
      } catch {
        /* the next tick retries */
      }
    };
    check.current = () => void tick();
    const used = (e: Event) => {
      // The pill's own click decides for itself (resume when idle, else switch off).
      if (e.target instanceof Element && e.target.closest("[data-live]")) return;
      const wasIdle = liveState({
        on: true,
        visible: true,
        lastUseAt: lastUse.current,
        now: Date.now(),
      });
      lastUse.current = Date.now();
      if (wasIdle === "idle") void tick();
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") return setState("hidden");
      lastUse.current = Date.now();
      void tick();
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, used, { passive: true }));
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, used));
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [on, classId, router]);

  const shown: LiveState = on ? state : "off";
  const live = shown === "live" || shown === "hidden";
  return (
    <button
      type="button"
      aria-pressed={live}
      title={TITLE[shown]}
      data-live={shown}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        live
          ? "border-success/40 bg-success-soft text-success-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
      onClick={() => {
        if (!on) {
          setState("live");
          return setOn(true);
        }
        if (shown === "idle") {
          lastUse.current = Date.now();
          return check.current();
        }
        setOn(false);
      }}
    >
      <span
        className={cn(
          "inline-block size-2 rounded-full",
          live ? "bg-success" : "bg-muted-foreground/50",
          live && refreshing && "animate-pulse"
        )}
        aria-hidden
      />
      {live ? "Live" : "Paused"}
    </button>
  );
}
