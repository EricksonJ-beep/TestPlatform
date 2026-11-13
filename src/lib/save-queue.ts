/**
 * Autosave that doesn't give up (hardening plan H1.1, Nov 9 2026).
 *
 * The test screen used to send each answer once. On a wifi drop the request failed, the header
 * stuck on "Saving…", and the answer graded as blank. The queue keeps every answer that the
 * server hasn't confirmed, resends it with a growing wait, and lets Submit wait for it.
 *
 * Pure of React and of the network: the caller passes `save` and the timer functions, so the
 * rules are tested without a browser.
 */

/** `saved`: the server has it. `retry`: it didn't arrive (try again). `fatal`: the server refused it for good. */
export type SaveOutcome = "saved" | "retry" | "fatal";

export type SaveQueueState = {
  /** Answers the server hasn't confirmed yet. */
  pending: number;
  /** True once a send has failed and nothing has succeeded since. */
  failing: boolean;
};

export type SaveQueueOptions<T> = {
  save: (key: string, value: T) => Promise<SaveOutcome>;
  onChange?: (state: SaveQueueState) => void;
  /** Waits between retries, in ms; the last one repeats. */
  delays?: number[];
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type SaveQueue<T> = {
  /** Queue the newest value for a key and send it. A newer value replaces an unsent older one. */
  set: (key: string, value: T) => void;
  /** Resend everything now (the browser came back online, or Submit was pressed). */
  retryNow: () => void;
  /** Resolves true once nothing is pending, or false if `timeoutMs` passes first. */
  flush: (timeoutMs: number) => Promise<boolean>;
  state: () => SaveQueueState;
  /** Stop timers (the screen is going away). */
  dispose: () => void;
};

const DEFAULT_DELAYS = [1000, 2000, 4000, 8000, 15000];

type Entry<T> = { value: T; version: number; inFlight: boolean; tries: number; timer: unknown };

export function createSaveQueue<T>(opts: SaveQueueOptions<T>): SaveQueue<T> {
  const delays = opts.delays?.length ? opts.delays : DEFAULT_DELAYS;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout> | undefined));
  const entries = new Map<string, Entry<T>>();
  let failing = false;
  let disposed = false;
  let waiters: Array<() => void> = [];

  const state = (): SaveQueueState => ({ pending: entries.size, failing });
  const notify = () => {
    opts.onChange?.(state());
    if (entries.size === 0) {
      const done = waiters;
      waiters = [];
      for (const w of done) w();
    }
  };

  const send = (key: string) => {
    const e = entries.get(key);
    if (!e || e.inFlight || disposed) return;
    if (e.timer !== null) {
      clearTimer(e.timer);
      e.timer = null;
    }
    e.inFlight = true;
    const sent = e.version;
    opts
      .save(key, e.value)
      .catch((): SaveOutcome => "retry")
      .then((outcome) => {
        const cur = entries.get(key);
        if (!cur || disposed) return;
        cur.inFlight = false;
        if (outcome === "retry") {
          failing = true;
          const wait = delays[Math.min(cur.tries, delays.length - 1)];
          cur.tries += 1;
          cur.timer = setTimer(() => {
            cur.timer = null;
            send(key);
          }, wait);
          notify();
          return;
        }
        if (outcome === "saved") failing = false;
        if (outcome === "saved" && cur.version !== sent) {
          // A newer answer arrived while this one was on its way: send that one too.
          cur.tries = 0;
          send(key);
          notify();
          return;
        }
        entries.delete(key);
        if (entries.size === 0) failing = false;
        notify();
      });
  };

  return {
    set(key, value) {
      const e = entries.get(key);
      if (e) {
        e.value = value;
        e.version += 1;
        e.tries = 0;
      } else {
        entries.set(key, { value, version: 0, inFlight: false, tries: 0, timer: null });
      }
      notify();
      send(key);
    },
    retryNow() {
      for (const [key, e] of entries) {
        e.tries = 0;
        send(key);
      }
    },
    flush(timeoutMs) {
      if (entries.size === 0) return Promise.resolve(true);
      this.retryNow();
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const timer = setTimer(() => {
          if (settled) return;
          settled = true;
          resolve(false);
        }, timeoutMs);
        waiters.push(() => {
          if (settled) return;
          settled = true;
          clearTimer(timer);
          resolve(true);
        });
      });
    },
    state,
    dispose() {
      disposed = true;
      for (const e of entries.values()) if (e.timer !== null) clearTimer(e.timer);
    },
  };
}
