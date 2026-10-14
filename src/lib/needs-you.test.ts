import { describe, expect, it } from "vitest";
import { needsYouCounts, placeLabel, requestBlocker, staleRequest } from "./needs-you";

const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

describe("placeLabel", () => {
  it("names the course, then the period, or the class name when there is no period", () => {
    expect(placeLabel({ courseName: "A&P", className: "5th Hour", period: "5" })).toBe("A&P · P5");
    expect(placeLabel({ courseName: "A&P", className: "5th Hour", period: "Period 3" })).toBe(
      "A&P · P3"
    );
    expect(placeLabel({ courseName: "Biology", className: "Bio 2nd", period: null })).toBe(
      "Biology · Bio 2nd"
    );
    expect(placeLabel({ courseName: null, className: "Seminar", period: " " })).toBe("Seminar");
  });
});

describe("staleRequest", () => {
  const base = {
    attemptNumber: 2,
    used: 1,
    retakesNeedUnlock: true,
    attemptsAllowed: 3,
    enrolled: true,
  };
  it("is current only for the next try on a test that still needs the teacher's OK", () => {
    expect(staleRequest(base)).toBeNull();
    expect(staleRequest({ ...base, attemptsAllowed: null })).toBeNull();
  });
  it("names why a leftover can't be used", () => {
    expect(staleRequest({ ...base, retakesNeedUnlock: false })).toBe("setting_off");
    expect(staleRequest({ ...base, used: 2 })).toBe("taken");
    expect(staleRequest({ ...base, used: 3 })).toBe("taken");
    expect(staleRequest({ ...base, attemptNumber: 3 })).toBe("not_next");
    expect(staleRequest({ ...base, attemptsAllowed: 1 })).toBe("no_attempts");
    // Moved to another period: Approve and Decline refuse a student who isn't in the class.
    expect(staleRequest({ ...base, enrolled: false })).toBe("left_class");
  });
});

describe("requestBlocker", () => {
  const now = at("2026-10-13T15:00:00Z");
  const assignment = {
    opensAt: null,
    closesAt: null,
    attemptsAllowed: 3,
    retakeWaitHours: 0,
    retakeWindowDays: null,
  };
  const input = {
    assignment,
    used: 1,
    lastSubmittedAt: at("2026-10-13T14:00:00Z"),
    firstSubmittedAt: at("2026-10-13T14:00:00Z"),
    now,
  };
  it("is null when the approved try could start right away (the unlock is taken as given)", () => {
    expect(requestBlocker(input)).toBeNull();
  });
  it("says when the wait between attempts ends", () => {
    expect(
      requestBlocker({ ...input, assignment: { ...assignment, retakeWaitHours: 24 } })
    ).toEqual({ reason: "wait", at: new Date(input.lastSubmittedAt.getTime() + 24 * HOUR) });
  });
  it("names a closed window, a test not open yet, and the cap's retake window", () => {
    expect(
      requestBlocker({ ...input, assignment: { ...assignment, closesAt: at("2026-10-13T12:00Z") } })
    ).toEqual({ reason: "closed" });
    expect(
      requestBlocker({ ...input, assignment: { ...assignment, opensAt: at("2026-10-14T12:00Z") } })
    ).toEqual({ reason: "not_open" });
    expect(
      requestBlocker({
        ...input,
        firstSubmittedAt: at("2026-10-01T14:00:00Z"),
        assignment: { ...assignment, retakeWindowDays: 7 },
      })
    ).toEqual({ reason: "window_closed", at: at("2026-10-08T14:00:00Z") });
    // No cap (or a CVTC course): no window.
    expect(requestBlocker({ ...input, firstSubmittedAt: at("2026-10-01T14:00:00Z") })).toBeNull();
  });
});

describe("needsYouCounts", () => {
  it("counts one per row, and all worksheet emails as one row", () => {
    const counts = needsYouCounts({
      asked: [1],
      requests: [1, 2],
      corrections: [1],
      grading: [1, 2],
      activities: [],
      worksheetEmails: 3,
    });
    expect(counts).toEqual({
      asked: 1,
      requests: 2,
      corrections: 1,
      grading: 2,
      activities: 0,
      worksheets: 1,
      total: 7,
    });
  });
  it("is zero when nothing waits", () => {
    expect(
      needsYouCounts({
        asked: [],
        requests: [],
        corrections: [],
        grading: [],
        activities: [],
        worksheetEmails: 0,
      }).total
    ).toBe(0);
  });
});
