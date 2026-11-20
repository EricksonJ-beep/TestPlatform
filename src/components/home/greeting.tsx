"use client";

import { useSyncExternalStore } from "react";
import { greetingFor } from "@/lib/teacher-home";

const subscribe = () => () => {};

/**
 * "Good morning, Jon" by the teacher's own clock (home pages redesign §3.1). The server can't
 * know the browser's time zone (it showed "Good afternoon" at 10:49 AM), so it renders with the
 * school's hour and the browser corrects it on load.
 */
export function Greeting({ firstName, schoolHour }: { firstName: string; schoolHour: number }) {
  const hour = useSyncExternalStore(
    subscribe,
    () => new Date().getHours(),
    () => schoolHour
  );
  return (
    <h1 className="font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.02em]">
      {greetingFor(hour)}, {firstName}
    </h1>
  );
}
