import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  needsCount,
  nextSort,
  parseSort,
  periodLabel,
  serializeSort,
  sortResults,
  statusText,
  type ResultsRow,
} from "./results-table";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-11-05T15:00:00Z");

function row(id: string, over: Partial<ResultsRow> = {}): ResultsRow {
  return {
    id,
    title: id,
    type: "formative",
    className: "Phy Sci 1st",
    period: "1",
    unitName: null,
    unitOrder: null,
    status: "closed",
    opensAt: at("2026-10-01T13:00:00Z"),
    closesAt: at("2026-10-08T13:00:00Z"),
    createdAt: at("2026-10-01T12:00:00Z"),
    enrolled: 20,
    submitted: 20,
    inProgress: 0,
    average: null,
    median: null,
    scored: 0,
    toGrade: 0,
    corrections: 0,
    requests: 0,
    asks: 0,
    ...over,
  };
}
const ids = (rows: ResultsRow[]) => rows.map((r) => r.id);

describe("sortResults", () => {
  it("sorts titles in reading order (numbers as numbers), both ways", () => {
    const rows = [row("Unit 10 Test"), row("3.2 Ionic quiz"), row("Unit 2 Test"), row("3.10 x")];
    expect(ids(sortResults(rows, { key: "title", dir: "asc" }))).toEqual([
      "3.2 Ionic quiz",
      "3.10 x",
      "Unit 2 Test",
      "Unit 10 Test",
    ]);
    expect(ids(sortResults(rows, { key: "title", dir: "desc" }))[0]).toBe("Unit 10 Test");
  });

  it("puts missing values last whichever way the arrow points", () => {
    const rows = [
      row("none", { average: null }),
      row("low", { average: 55 }),
      row("high", { average: 91 }),
    ];
    expect(ids(sortResults(rows, { key: "average", dir: "desc" }))).toEqual([
      "high",
      "low",
      "none",
    ]);
    expect(ids(sortResults(rows, { key: "average", dir: "asc" }))).toEqual(["low", "high", "none"]);
    const units = [
      row("no unit"),
      row("u3", { unitName: "Unit 3", unitOrder: 2 }),
      row("u2", { unitName: "Unit 2", unitOrder: 1 }),
    ];
    expect(ids(sortResults(units, { key: "unit", dir: "asc" }))).toEqual(["u2", "u3", "no unit"]);
    expect(ids(sortResults(units, { key: "unit", dir: "desc" }))).toEqual(["u3", "u2", "no unit"]);
    const empty = [
      row("empty class", { enrolled: 0, submitted: 0 }),
      row("half", { submitted: 10 }),
    ];
    expect(ids(sortResults(empty, { key: "turnedIn", dir: "asc" }))).toEqual([
      "half",
      "empty class",
    ]);
  });

  it("sorts turned in by share of the class, then by count", () => {
    const rows = [
      row("10/20", { submitted: 10 }),
      row("5/5", { enrolled: 5, submitted: 5 }),
      row("20/20"),
    ];
    expect(ids(sortResults(rows, { key: "turnedIn", dir: "desc" }))).toEqual([
      "20/20",
      "5/5",
      "10/20",
    ]);
  });

  it("orders status open (closing soonest) → scheduled (opening soonest) → closed (latest first)", () => {
    const rows = [
      row("closed early", { closesAt: at("2026-10-01T00:00:00Z") }),
      row("open late", { status: "open", closesAt: at("2026-11-20T00:00:00Z") }),
      row("open forever", { status: "open", closesAt: null }),
      row("closed late", { closesAt: at("2026-11-01T00:00:00Z") }),
      row("sched", { status: "scheduled", opensAt: at("2026-11-14T00:00:00Z") }),
      row("open soon", { status: "open", closesAt: at("2026-11-06T00:00:00Z") }),
    ];
    expect(ids(sortResults(rows, { key: "status", dir: "asc" }))).toEqual([
      "open soon",
      "open late",
      "open forever",
      "sched",
      "closed late",
      "closed early",
    ]);
    expect(ids(sortResults(rows, { key: "status", dir: "desc" }))).toEqual([
      "closed late",
      "closed early",
      "sched",
      "open soon",
      "open late",
      "open forever",
    ]);
  });

  it("puts what needs the teacher first by default, then live work, newest first", () => {
    const rows = [
      row("old closed", { createdAt: at("2026-09-01T00:00:00Z") }),
      row("new closed", { createdAt: at("2026-10-20T00:00:00Z") }),
      row("two to grade", { toGrade: 2 }),
      row("open", { status: "open", closesAt: at("2026-11-07T00:00:00Z") }),
      row("set + request", { corrections: 1, requests: 1, asks: 1 }),
    ];
    expect(ids(sortResults(rows, DEFAULT_SORT))).toEqual([
      "set + request",
      "two to grade",
      "open",
      "new closed",
      "old closed",
    ]);
  });

  it("keeps the given order on a full tie (stable) and does not touch the input", () => {
    const rows = [row("a"), row("b"), row("c")];
    const copy = [...rows];
    expect(ids(sortResults(rows, { key: "average", dir: "desc" }))).toEqual(["a", "b", "c"]);
    expect(ids(sortResults(rows, { key: "needs", dir: "asc" }))).toEqual(["a", "b", "c"]);
    expect(rows).toEqual(copy);
  });

  it("sorts classes by period number, then name", () => {
    const rows = [
      row("p10", { period: "10" }),
      row("p2", { period: "Period 2" }),
      row("advisory", { period: null, className: "Advisory" }),
      row("p1", { period: "1" }),
    ];
    expect(ids(sortResults(rows, { key: "class", dir: "asc" }))).toEqual([
      "p1",
      "p2",
      "p10",
      "advisory",
    ]);
  });
});

describe("sort state", () => {
  it("flips the same header and starts a new one at its natural direction", () => {
    expect(nextSort({ key: "title", dir: "asc" }, "title")).toEqual({ key: "title", dir: "desc" });
    expect(nextSort({ key: "title", dir: "desc" }, "average")).toEqual({
      key: "average",
      dir: "desc",
    });
    expect(nextSort({ key: "average", dir: "desc" }, "unit")).toEqual({ key: "unit", dir: "asc" });
  });

  it("round-trips through storage and falls back to the default on junk", () => {
    expect(parseSort(serializeSort({ key: "unit", dir: "asc" }))).toEqual({
      key: "unit",
      dir: "asc",
    });
    for (const junk of [null, undefined, "", "unit", "bogus:asc", "unit:sideways"])
      expect(parseSort(junk)).toEqual(DEFAULT_SORT);
  });
});

describe("cells", () => {
  it("adds up what needs the teacher", () => {
    expect(needsCount(row("x", { toGrade: 3, corrections: 2, requests: 1, asks: 1 }))).toBe(7);
  });

  it("names the period short, or the class when there is none", () => {
    expect(periodLabel({ period: "Period 3", className: "Bio" })).toBe("P3");
    expect(periodLabel({ period: " ", className: "Seminar" })).toBe("Seminar");
  });

  it("says how long an open test has left, and when others open or closed", () => {
    const open = (closesAt: Date | null) =>
      statusText({ status: "open", opensAt: null, closesAt }, NOW);
    expect(open(at("2026-11-05T15:20:00Z"))).toMatchObject({ short: "20m left", soon: true });
    expect(open(at("2026-11-05T20:00:00Z"))).toMatchObject({ short: "5h left", soon: true });
    expect(open(at("2026-11-08T15:00:00Z"))).toMatchObject({ short: "3d left", soon: false });
    expect(open(at("2026-11-20T18:00:00Z")).short).toBe("to Nov 20");
    expect(open(null)).toMatchObject({ short: "open", long: "Open · no close date" });
    expect(
      statusText({ status: "scheduled", opensAt: at("2026-11-14T14:00:00Z"), closesAt: null }, NOW)
        .short
    ).toBe("opens Nov 14");
    const closed = statusText(
      { status: "closed", opensAt: null, closesAt: at("2026-10-31T03:00:00Z") },
      NOW
    );
    // School time (Central): 10 PM on Oct 30.
    expect(closed.short).toBe("closed Oct 30");
    expect(closed.long).toMatch(/^Closed Fri, Oct 30/);
  });
});
