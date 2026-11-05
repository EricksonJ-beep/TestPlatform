/**
 * Skyward updates (Jon, Nov 5 2026): the counting scores that differ from what Skyward has, with
 * what moved them; and the marks for "I entered everything up to <date>".
 */
import { describe, expect, it } from "vitest";
import { marksAsOf, skywardChanges, type HistoryEntry } from "./skyward-updates";

const day = (d: number, h = 12) => new Date(Date.UTC(2026, 10, d, h));
const ava = { id: "ava", firstName: "Ava", lastName: "Adams", email: null };
const ben = { id: "ben", firstName: "Ben", lastName: "Brooks", email: null };
const cal = { id: "cal", firstName: "Cal", lastName: "Cruz", email: null };
const quizFiles = (p: Record<string, [number | null, number | null]>) => [
  { key: "lt1", students: [ava, ben, cal].map((s) => ({ ...s, percent: p[s.id]?.[0] ?? null })) },
  { key: "lt2", students: [ava, ben, cal].map((s) => ({ ...s, percent: p[s.id]?.[1] ?? null })) },
];
const h = (studentId: string, percent: number, at: Date, basis: HistoryEntry["basis"] = null) => ({
  studentId,
  percent,
  basis,
  at,
});

describe("skywardChanges", () => {
  it("lists only what differs from the mark, named by what moved it", () => {
    const changes = skywardChanges({
      files: quizFiles({ ava: [80, 90], ben: [100, 70], cal: [null, null] }),
      marks: [
        { columnKey: "lt1", studentId: "ava", score: 40, recordedAt: day(3) },
        { columnKey: "lt2", studentId: "ava", score: 90, recordedAt: day(3) },
        { columnKey: "lt1", studentId: "ben", score: 60, recordedAt: day(3) },
      ],
      history: [
        h("ava", 40, day(2), "best_attempt"),
        h("ava", 85, day(4), "relearning_path"),
        h("ben", 85, day(5), "retake"),
      ],
    });
    expect(changes.map((c) => [c.lastName, c.columnKey, c.from, c.to, c.reason])).toEqual([
      ["Adams", "lt1", 40, 80, "relearning path"],
      ["Brooks", "lt1", 60, 100, "retake"],
      // Never handed over: taken after the last export.
      ["Brooks", "lt2", null, 70, "new score"],
    ]);
    expect(changes[0].at).toEqual(day(4));
    // Cal has no score yet: nothing to type in.
  });

  it("a lower score is a regrade; a halved percent rounds like the export", () => {
    const changes = skywardChanges({
      files: [
        {
          key: "whole",
          students: [
            { ...ava, percent: 74.5 },
            { ...ben, percent: 89.4 },
          ],
        },
      ],
      marks: [
        { columnKey: "whole", studentId: "ava", score: 90, recordedAt: day(3) },
        { columnKey: "whole", studentId: "ben", score: 89, recordedAt: day(3) },
      ],
      history: [h("ava", 74.5, day(6))],
    });
    expect(changes.map((c) => [c.firstName, c.from, c.to, c.reason])).toEqual([
      ["Ava", 90, 75, "regrade"],
    ]);
  });
});

describe("marksAsOf: I entered everything up to a date", () => {
  it("keeps today's score where nothing changed, the score as of the date on a test, and nothing on a changed quiz target", () => {
    const asOf = day(5, 23);
    const history = [
      h("ava", 40, day(2)),
      h("ava", 80, day(7), "relearning_path"),
      h("ben", 90, day(3)),
      h("cal", 70, day(8)),
    ];
    const test = marksAsOf({
      files: [
        {
          key: "whole",
          students: [
            { ...ava, percent: 80 },
            { ...ben, percent: 90 },
            { ...cal, percent: 70 },
          ],
        },
      ],
      history,
      asOf,
      wholeKey: "whole",
    });
    expect(test).toEqual([
      // Changed after the date: Skyward has the score from then.
      { columnKey: "whole", studentId: "ava", score: 40 },
      { columnKey: "whole", studentId: "ben", score: 90 },
      // Cal took it after the date: no mark, so it shows as a new score.
    ]);
    const quiz = marksAsOf({
      files: quizFiles({ ava: [80, 100], ben: [90, 90] }),
      history,
      asOf,
      wholeKey: "whole",
    });
    expect(quiz).toEqual([
      { columnKey: "lt1", studentId: "ben", score: 90 },
      { columnKey: "lt2", studentId: "ben", score: 90 },
    ]);
  });
});
