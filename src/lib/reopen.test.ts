import { describe, expect, it } from "vitest";
import { effectiveClose, endOfNextSchoolDay, reopenedUntil } from "./reopen";

const at = (iso: string) => new Date(iso);

describe("endOfNextSchoolDay (Jon, Oct 14 2026: approved reopens last through tomorrow)", () => {
  it("runs to 11:59 PM Central on the next weekday", () => {
    // Wednesday Oct 14 2026, 10 AM CDT → Thursday Oct 15, 23:59:59.999 CDT (UTC-5).
    expect(endOfNextSchoolDay(at("2026-10-14T15:00:00Z"))).toEqual(at("2026-10-16T04:59:59.999Z"));
    // Monday → Tuesday; Thursday → Friday.
    expect(endOfNextSchoolDay(at("2026-10-12T15:00:00Z"))).toEqual(at("2026-10-14T04:59:59.999Z"));
    expect(endOfNextSchoolDay(at("2026-10-15T15:00:00Z"))).toEqual(at("2026-10-17T04:59:59.999Z"));
  });

  it("skips the weekend: Friday, Saturday and Sunday all run to the end of Monday", () => {
    const monday = at("2026-10-20T04:59:59.999Z");
    expect(endOfNextSchoolDay(at("2026-10-16T15:00:00Z"))).toEqual(monday); // Friday
    expect(endOfNextSchoolDay(at("2026-10-17T15:00:00Z"))).toEqual(monday); // Saturday
    expect(endOfNextSchoolDay(at("2026-10-18T15:00:00Z"))).toEqual(monday); // Sunday
  });

  it("reads today's date in Chicago, not in UTC", () => {
    // 11 PM Thursday in Chicago is already Friday in UTC: still Thursday at school → Friday.
    expect(endOfNextSchoolDay(at("2026-10-16T04:00:00Z"))).toEqual(at("2026-10-17T04:59:59.999Z"));
    // 7:30 PM Friday in Chicago (Saturday in UTC) → Monday.
    expect(endOfNextSchoolDay(at("2026-10-17T00:30:00Z"))).toEqual(at("2026-10-20T04:59:59.999Z"));
    // 12:30 AM Monday in Chicago → Tuesday.
    expect(endOfNextSchoolDay(at("2026-10-19T05:30:00Z"))).toEqual(at("2026-10-21T04:59:59.999Z"));
  });

  it("keeps 11:59 PM across daylight-saving changes", () => {
    // Fall back (Sun Nov 1 2026): approved Friday Oct 30 in CDT, ends Monday Nov 2 in CST (UTC-6).
    expect(endOfNextSchoolDay(at("2026-10-30T20:00:00Z"))).toEqual(at("2026-11-03T05:59:59.999Z"));
    // Approved on the changeover Sunday itself, before and after 2 AM.
    expect(endOfNextSchoolDay(at("2026-11-01T06:30:00Z"))).toEqual(at("2026-11-03T05:59:59.999Z"));
    expect(endOfNextSchoolDay(at("2026-11-01T09:00:00Z"))).toEqual(at("2026-11-03T05:59:59.999Z"));
    // Spring forward (Sun Mar 14 2027): approved Friday Mar 12 in CST, ends Monday Mar 15 in CDT.
    expect(endOfNextSchoolDay(at("2027-03-12T20:00:00Z"))).toEqual(at("2027-03-16T04:59:59.999Z"));
    expect(endOfNextSchoolDay(at("2027-03-14T07:30:00Z"))).toEqual(at("2027-03-16T04:59:59.999Z"));
  });
});

describe("effectiveClose (R5: the student's own close)", () => {
  const close = at("2026-10-10T05:00:00Z");
  const reopen = at("2026-10-16T04:59:59.999Z");
  it("is the later of the close and an approved reopen", () => {
    expect(effectiveClose(close, null)).toBe(close);
    expect(effectiveClose(close, reopen)).toBe(reopen);
    // A reopen that ends before a later close (the teacher moved the close) changes nothing.
    expect(effectiveClose(at("2026-10-20T05:00:00Z"), reopen)).toEqual(at("2026-10-20T05:00:00Z"));
  });
  it("no close means always open, whatever the reopen says", () => {
    expect(effectiveClose(null, reopen)).toBeNull();
  });
});

describe("reopenedUntil", () => {
  const close = at("2026-10-10T05:00:00Z");
  const reopen = at("2026-10-16T04:59:59.999Z");
  it("is the reopen's end only while the test is past its close and the reopen still runs", () => {
    expect(reopenedUntil(close, reopen, at("2026-10-14T15:00:00Z"))).toBe(reopen);
    expect(reopenedUntil(close, reopen, reopen)).toBeNull();
    expect(reopenedUntil(close, reopen, at("2026-10-09T15:00:00Z"))).toBeNull();
    expect(reopenedUntil(close, null, at("2026-10-14T15:00:00Z"))).toBeNull();
    expect(reopenedUntil(null, reopen, at("2026-10-14T15:00:00Z"))).toBeNull();
  });
});
