/**
 * Live Dashboard rules (Jon, Oct 13 2026, dashboard plan build step 5): the stamp's fingerprint,
 * the open-test part that changes with the clock alone, and when the page polls.
 */
import { describe, expect, it } from "vitest";
import {
  LIVE_IDLE_MS,
  liveState,
  openTestsPart,
  stampOf,
  testingNow,
  type OpenAttemptLite,
} from "./live-refresh";

const now = new Date("2026-10-13T15:00:30Z");
const ago = (m: number) => new Date(now.getTime() - m * 60_000);
const open = (over: Partial<OpenAttemptLite> = {}): OpenAttemptLite => ({
  id: "a1",
  status: "in_progress",
  startedAt: ago(20),
  dueAt: null,
  pausedAt: null,
  pauseReason: null,
  lastActiveAt: ago(1),
  closesAt: null,
  ...over,
});

describe("stampOf", () => {
  it("is stable for equal parts and moves when any part does", () => {
    expect(stampOf(["a", 1, null])).toBe(stampOf(["a", 1, null]));
    expect(stampOf(["a", 1, null])).not.toBe(stampOf(["a", 2, null]));
    expect(stampOf(["a", "b"])).not.toBe(stampOf(["ab", ""]));
  });
});

describe("the open tests part", () => {
  it("ticks once a minute while someone is testing, and not otherwise", () => {
    expect(testingNow([open()], now)).toBe(true);
    const a = openTestsPart([open()], now);
    expect(openTestsPart([open()], new Date(now.getTime() + 20_000))).toBe(a); // same minute
    expect(openTestsPart([open()], new Date(now.getTime() + 40_000))).not.toBe(a); // next minute
    const paused = open({ pausedAt: ago(5), pauseReason: "student" });
    expect(testingNow([paused], now)).toBe(false);
    expect(openTestsPart([paused], now)).toBe(
      openTestsPart([paused], new Date(now.getTime() + 60_000))
    );
  });
  it("shows an idle pause the moment it happens, with no write", () => {
    const row = open({ lastActiveAt: ago(9) });
    const before = openTestsPart([row], now);
    expect(before).toContain("a1:t");
    const later = new Date(now.getTime() + 2 * 60_000);
    expect(openTestsPart([row], later)).toContain("a1:p");
    expect(testingNow([row], later)).toBe(false);
  });
  it("never keeps ticking for a test left open past its time or from before activity stamps", () => {
    expect(testingNow([open({ dueAt: ago(1), lastActiveAt: ago(2) })], now)).toBe(false);
    expect(testingNow([open({ lastActiveAt: null, startedAt: ago(30) })], now)).toBe(false);
    expect(testingNow([open({ lastActiveAt: null, startedAt: ago(3) })], now)).toBe(true);
  });
  it("is the same whatever order the rows come in", () => {
    const b = open({ id: "b2", pausedAt: ago(3), pauseReason: "idle" });
    expect(openTestsPart([open(), b], now)).toBe(openTestsPart([b, open()], now));
  });
});

describe("liveState", () => {
  const t = now.getTime();
  it("polls only while on, visible and used in the last 45 minutes", () => {
    expect(liveState({ on: true, visible: true, lastUseAt: t - 60_000, now: t })).toBe("live");
    expect(liveState({ on: true, visible: false, lastUseAt: t - 60_000, now: t })).toBe("hidden");
    expect(liveState({ on: true, visible: true, lastUseAt: t - LIVE_IDLE_MS, now: t })).toBe(
      "idle"
    );
    expect(liveState({ on: false, visible: true, lastUseAt: t, now: t })).toBe("off");
  });
});
