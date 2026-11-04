"use client";

import { useState, useSyncExternalStore } from "react";
import { BookOpen, Check, ClipboardCheck, PencilLine, X } from "lucide-react";

const SEEN_KEY = "bloom:path-intro-seen";

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
/** Seen before on this device? A blocked storage reads as not seen, so the card just shows. */
function seen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "How your path works" (relearning revamp L1): shown on the student home the first time they
 * have a quiz or test on the new path, until they close it. Remembered on this device only;
 * it's a welcome, not something that must be kept.
 */
export function PathIntro() {
  // The server has no storage: it renders nothing, and the browser decides after hydrating.
  const before = useSyncExternalStore(subscribe, seen, () => true);
  const [closed, setClosed] = useState(false);
  if (before || closed) return null;
  const close = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* the card just shows again next time */
    }
    setClosed(true);
  };
  const steps = [
    { icon: PencilLine, title: "Fix your mistakes", line: "Corrections on what you missed." },
    {
      icon: BookOpen,
      title: "Relearn it your way",
      line: "Read, Watch or Do. About 10 minutes.",
    },
    { icon: ClipboardCheck, title: "Practice check", line: "5 questions. Get 4 right." },
    {
      icon: Check,
      title: "Earn it",
      line: "A quiz goes up to 80%. A test unlocks its retake.",
    },
  ];
  return (
    <section
      className="relative flex flex-col gap-3 rounded-lg border border-brand/40 bg-brand-soft/50 p-4"
      aria-labelledby="path-intro-title"
      data-path-intro
    >
      <button
        type="button"
        onClick={close}
        className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Close"
      >
        <X className="size-4" aria-hidden />
      </button>
      <h2 id="path-intro-title" className="text-base font-semibold">
        How your path works
      </h2>
      <p className="text-sm">
        Under 80% on a learning target? Follow the steps. Each one opens the next.
      </p>
      <ol className="grid gap-2 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-2 rounded-md bg-card p-3 text-sm">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              <s.icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block font-medium">
                {i + 1}. {s.title}
              </span>
              <span className="text-muted-foreground">{s.line}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        On a quiz you can keep your 80% or retake it to go higher. Your highest score counts.
      </p>
      <div>
        <button
          type="button"
          onClick={close}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep"
          data-path-intro-close
        >
          Got it
        </button>
      </div>
    </section>
  );
}
