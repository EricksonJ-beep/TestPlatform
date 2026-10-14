/**
 * Recent activity filters (Jon, Oct 13 2026, dashboard plan decision 10): every kind has one
 * group, retake tries split from first tries, and the filter round-trips through the address.
 */
import { describe, expect, it } from "vitest";
import {
  activityGroup,
  FEED_GROUPS,
  feedDay,
  feedGroups,
  feedHref,
  KIND_GROUP,
  parseFeedFilter,
  toggleKind,
  type FeedFilter,
} from "./activity-filter";

describe("activityGroup", () => {
  it("puts try 1 under Tests and later tries under Retakes", () => {
    expect(activityGroup({ kind: "attempt_started", detail: { attemptNumber: 1 } })).toBe("tests");
    expect(activityGroup({ kind: "attempt_started", detail: {} })).toBe("tests");
    expect(activityGroup({ kind: "attempt_submitted", detail: { attemptNumber: 1 } })).toBe(
      "tests"
    );
    expect(activityGroup({ kind: "attempt_started", detail: { attemptNumber: 2 } })).toBe(
      "retakes"
    );
    expect(activityGroup({ kind: "attempt_submitted", detail: { attemptNumber: 3 } })).toBe(
      "retakes"
    );
  });
  it("gives every other kind one group, with the pause milestones under Pauses", () => {
    expect(activityGroup({ kind: "retake_requested", detail: {} })).toBe("retakes");
    expect(activityGroup({ kind: "corrections_submitted", detail: {} })).toBe("corrections");
    expect(activityGroup({ kind: "practice_completed", detail: {} })).toBe("practice");
    expect(activityGroup({ kind: "activity_completed", detail: {} })).toBe("practice");
    expect(activityGroup({ kind: "test_paused", detail: { reason: "idle" } })).toBe("pauses");
    expect(activityGroup({ kind: "resume_requested", detail: {} })).toBe("pauses");
    expect(activityGroup({ kind: "resumed", detail: { by: "code" } })).toBe("pauses");
    expect(activityGroup({ kind: "login", detail: {} })).toBe("logins");
    expect(activityGroup({ kind: "class_joined", detail: {} })).toBe("logins");
    expect(Object.keys(KIND_GROUP)).toHaveLength(9);
  });
});

describe("the filter in the address", () => {
  const base: FeedFilter = { scope: "class", kinds: [], logins: false, days: 1 };

  it("defaults to this class, every kind but logins, the last 24 hours", () => {
    expect(parseFeedFilter({}, true)).toEqual(base);
    expect(feedGroups(base)).toEqual([...FEED_GROUPS]);
    expect(feedGroups(base)).not.toContain("logins");
    expect(feedHref(base, true)).toBe("/app");
  });
  it("has only All classes without a class", () => {
    expect(parseFeedFilter({ feed: "class" }, false).scope).toBe("all");
    expect(feedHref({ ...base, scope: "all" }, false)).toBe("/app");
  });
  it("round-trips scope, kinds, logins and days, and ignores junk", () => {
    const f: FeedFilter = { scope: "all", kinds: ["pauses", "tests"], logins: true, days: 3 };
    const href = feedHref(f, true);
    expect(href).toBe("/app?feed=all&kinds=tests,pauses&logins=1&days=3");
    const back = parseFeedFilter(Object.fromEntries(new URLSearchParams(href.split("?")[1])), true);
    expect(back).toEqual({ ...f, kinds: ["tests", "pauses"] });
    expect(feedGroups(back)).toEqual(["tests", "pauses", "logins"]);
    expect(parseFeedFilter({ kinds: "nope,practice", days: "9", logins: "yes" }, true)).toEqual({
      ...base,
      kinds: ["practice"],
    });
    expect(parseFeedFilter({ kinds: ["retakes", "tests"] }, true).kinds).toEqual(["retakes"]);
  });
  it("toggles a kind chip; pressing all five is the same as none", () => {
    const one = toggleKind(base, "retakes");
    expect(one.kinds).toEqual(["retakes"]);
    expect(toggleKind(one, "retakes").kinds).toEqual([]);
    let all = base;
    for (const g of FEED_GROUPS) all = toggleKind(all, g);
    expect(all.kinds).toEqual([]);
    expect(parseFeedFilter({ kinds: FEED_GROUPS.join(",") }, true).kinds).toEqual([]);
  });
});

describe("feedDay", () => {
  it("files an evening event under its own day in Central time, not the UTC date", () => {
    // Oct 13 8:30 PM CDT is 01:30 on Oct 14 in UTC.
    expect(feedDay(new Date("2026-10-14T01:30:00Z"))).toBe("2026-10-13");
    expect(feedDay(new Date("2026-10-14T13:00:00Z"))).toBe("2026-10-14");
    expect(feedDay(new Date("2026-10-13T20:00:00Z"))).toBe("2026-10-13");
  });
});
