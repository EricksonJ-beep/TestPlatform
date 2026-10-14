"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const Announce = createContext<((message: string) => void) | null>(null);

/** The to-do list's announcer, or null outside it (a card, the assignment page). */
export function useAskAnnouncer() {
  return useContext(Announce);
}

/**
 * Around the student's to-do list (review of the Oct 14 2026 build): asking to retake takes the
 * row off its group and puts it under "Waiting on your teacher", collapsed on a phone, so the
 * button that had focus is gone. This says what happened in a polite live region and moves focus
 * to the Waiting group's summary once the list shows it.
 */
export function AskAnnouncer({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const focusWaiting = useRef(false);
  // After every render (the list comes back with the request under Waiting): focus it once.
  useEffect(() => {
    if (!focusWaiting.current) return;
    const summary = box.current?.querySelector<HTMLElement>('[data-todo-group="waiting"] summary');
    if (!summary) return;
    focusWaiting.current = false;
    summary.focus();
  });
  const announce = useCallback((text: string) => {
    focusWaiting.current = true;
    setMessage(text);
  }, []);
  return (
    <Announce.Provider value={announce}>
      <div ref={box}>{children}</div>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </Announce.Provider>
  );
}
