"use client";

import { useSyncExternalStore } from "react";

/**
 * An on/off choice remembered per browser (localStorage, every access wrapped: private windows
 * and blocked storage just fall back to off). useSyncExternalStore keeps the server render (off)
 * and the browser's choice in sync, and every reader on the page follows a change, other tabs too.
 */
export function deviceFlag(key: string) {
  const listeners = new Set<() => void>();
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    window.addEventListener("storage", cb);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", cb);
    };
  };
  const read = (): boolean => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  };
  function useFlag(): boolean {
    return useSyncExternalStore(subscribe, read, () => false);
  }
  return {
    use: useFlag,
    set: (value: boolean) => {
      try {
        localStorage.setItem(key, value ? "1" : "0");
      } catch {
        /* private mode etc. */
      }
      listeners.forEach((cb) => cb());
    },
  };
}
