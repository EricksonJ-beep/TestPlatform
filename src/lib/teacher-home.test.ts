import { describe, expect, it } from "vitest";
import type { LiveRow } from "./gradebook-view";
import type { ClassGradebook } from "./queries/class-gradebook";
import {
  cellLook,
  cellText,
  countWord,
  greetingFor,
  homeMode,
  hourLabel,
  kindLabels,
  liveSummary,
  mostToDo,
  unitGroups,
  upNext,
} from "./teacher-home";

describe("greetingFor", () => {
  it("is morning before noon, afternoon until 5, evening after", () => {
    expect(greetingFor(0)).toBe("Good morning");
    expect(greetingFor(10)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(16)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good evening");
  });
});

describe("hourLabel", () => {
  it("names a numbered period as an hour", () => {
    expect(hourLabel({ name: "Bio", period: "1" })).toBe("1st hour");
    expect(hourLabel({ name: "Bio", period: "2" })).toBe("2nd hour");
    expect(hourLabel({ name: "Bio", period: "P3" })).toBe("3rd hour");
    expect(hourLabel({ name: "Bio", period: "Period 4" })).toBe("4th hour");
    expect(hourLabel({ name: "Bio", period: "11" })).toBe("11th hour");
  });
  it("falls back to the period's own words, then the class name", () => {
    expect(hourLabel({ name: "Bio", period: "Advisory" })).toBe("Advisory");
    expect(hourLabel({ name: "Anatomy A", period: null })).toBe("Anatomy A");
  });
});

describe("countWord", () => {
  it("spells 1 to 9 and uses digits above", () => {
    expect(countWord(1)).toBe("One");
    expect(countWord(3)).toBe("Three");
    expect(countWord(9)).toBe("Nine");
    expect(countWord(10)).toBe("10");
    expect(countWord(27)).toBe("27");
  });
});

const now = new Date("2026-11-20T15:00:00Z");
const student = (n: number) => ({ id: `s${n}`, firstName: `First${n}`, lastName: `Last${n}` });
const liveRow = (r: Partial<LiveRow> & { n: number }): LiveRow => ({
  student: student(r.n),
  assignmentId: "a1",
  title: "Cell Energy Quiz",
  attemptId: `t${r.n}`,
  attemptNumber: 1,
  answered: 0,
  total: 25,
  dueAt: new Date(now.getTime() + 30 * 60_000),
  paused: false,
  asked: false,
  ...r,
});

/** A gradebook with just what the summary reads: the columns, and who has turned what in. */
function gradebook(
  columns: {
    id: string;
    title: string;
    type?: "practice" | "formative" | "summative";
    status?: "open" | "scheduled" | "closed";
    opensAt?: Date | null;
    closesAt?: Date | null;
    /** Indexes of the students who turned it in. */
    turnedIn?: number[];
  }[],
  students = 4
): ClassGradebook {
  const roster = Array.from({ length: students }, (_, i) => student(i));
  return {
    class: { id: "c", name: "Bio P3", period: "3", term: null, courseId: null, courseName: null },
    students: roster,
    columns: columns.map((c) => ({
      assignmentId: c.id,
      title: c.title,
      type: c.type ?? "formative",
      status: c.status ?? "open",
      opensAt: c.opensAt ?? null,
      closesAt: c.closesAt ?? null,
    })),
    rows: roster.map((s, si) => ({
      student: s,
      cells: columns.map((c) => ({
        attempts: c.turnedIn?.includes(si) ? [{ status: "graded" }] : [],
      })),
    })),
    generatedAt: now,
  } as unknown as ClassGradebook;
}

describe("homeMode", () => {
  it("is live while anyone is testing or paused, quiet otherwise", () => {
    expect(homeMode({ testing: [], paused: [] })).toBe("quiet");
    expect(homeMode({ testing: [liveRow({ n: 1 })], paused: [] })).toBe("live");
    expect(homeMode({ testing: [], paused: [liveRow({ n: 1, paused: true })] })).toBe("live");
  });
});

describe("liveSummary", () => {
  const gb = gradebook([
    {
      id: "a1",
      title: "Cell Energy Quiz",
      closesAt: new Date("2026-11-20T21:00:00Z"),
      turnedIn: [3],
    },
    { id: "a2", title: "Unit 3 Test", type: "summative" },
  ]);

  it("is null with nobody testing or paused", () => {
    expect(liveSummary(gb, { testing: [], paused: [] })).toBeNull();
  });

  it("heads with the test most students are on and counts the room", () => {
    const s = liveSummary(gb, {
      testing: [
        liveRow({ n: 0, answered: 4 }),
        liveRow({ n: 1, answered: 20 }),
        liveRow({ n: 2, assignmentId: "a2", title: "Unit 3 Test", answered: 1, total: 40 }),
      ],
      paused: [liveRow({ n: 3, paused: true })],
    })!;
    expect(s.assignmentId).toBe("a1");
    expect(s.title).toBe("Cell Energy Quiz");
    expect(s.testing).toBe(3);
    expect(s.paused).toBe(1);
    expect(s.turnedIn).toBe(1);
    expect(s.roster).toBe(4);
    expect(s.roomLeft).toBe("30 min left");
  });

  it("sorts tiles by fraction answered and only details what differs from the room", () => {
    const s = liveSummary(gb, {
      testing: [
        liveRow({ n: 0, answered: 4 }),
        liveRow({ n: 1, answered: 20 }),
        // Extra time: differs from the room's.
        liveRow({ n: 2, answered: 10, dueAt: new Date(now.getTime() + 154 * 60_000) }),
        // A different test.
        liveRow({
          n: 3,
          assignmentId: "a2",
          title: "Unit 3 Test",
          answered: 39,
          total: 40,
          dueAt: new Date(now.getTime() + 21 * 60 * 60_000),
        }),
      ],
      paused: [],
    })!;
    expect(s.tiles.map((t) => t.row.student.id)).toEqual(["s3", "s1", "s2", "s0"]);
    expect(s.tiles.map((t) => t.line)).toEqual([
      "Unit 3 Test, 21 h left",
      "of 25 answered",
      "of 25, 2 h 34 min left",
      "of 25 answered",
    ]);
  });
});

describe("upNext", () => {
  it("is the open test closing soonest, with who has turned it in", () => {
    const gb = gradebook([
      { id: "late", title: "Later", closesAt: new Date("2026-11-25T21:00:00Z") },
      { id: "soon", title: "Sooner", closesAt: new Date("2026-11-20T21:00:00Z"), turnedIn: [0, 1] },
      { id: "p", title: "Practice", type: "practice", closesAt: new Date("2026-11-20T16:00:00Z") },
    ]);
    expect(upNext(gb)).toMatchObject({
      assignmentId: "soon",
      status: "open",
      turnedIn: 2,
      roster: 4,
    });
  });
  it("falls back to the next scheduled test, and to nothing", () => {
    const gb = gradebook([
      { id: "x", title: "Old", status: "closed" },
      { id: "b", title: "B", status: "scheduled", opensAt: new Date("2026-12-02T14:00:00Z") },
      { id: "a", title: "A", status: "scheduled", opensAt: new Date("2026-11-23T14:00:00Z") },
    ]);
    expect(upNext(gb)).toMatchObject({ assignmentId: "a", status: "scheduled" });
    expect(upNext(gradebook([{ id: "x", title: "Old", status: "closed" }]))).toBeNull();
  });
});

describe("mostToDo", () => {
  const rows = (counts: number[]) => counts.map((toDo, i) => ({ student: student(i), toDo }));
  it("is null when nobody owes anything", () => {
    expect(mostToDo(rows([0, 0]))).toBeNull();
  });
  it("lists the top three and sums up the next tier", () => {
    const m = mostToDo(rows([4, 9, 0, 7, 4, 8, 4, 4, 4, 2]))!;
    expect(m.top.map((t) => [t.student.id, t.count])).toEqual([
      ["s1", 9],
      ["s5", 8],
      ["s3", 7],
    ]);
    expect(m.more).toBe("Five more students owe 4 each.");
  });
  it("handles a next tier of one, and none", () => {
    expect(mostToDo(rows([3, 3, 3, 2]))!.more).toBe("One more student owes 2.");
    expect(mostToDo(rows([3, 1]))!.more).toBeNull();
  });
});

describe("kindLabels and unitGroups", () => {
  const u = (n: number) => ({ id: `u${n}`, name: `Unit ${n}`, sortOrder: n });
  const footer = (average: number | null, done = 20) => ({
    done,
    enrolled: 24,
    average,
    tiers: null,
    movedUpThisWeek: 0,
  });
  // Newest first, as the loader has them.
  const columns = [
    {
      assignmentId: "t4",
      title: "Unit 4 Test",
      type: "summative" as const,
      unit: u(4),
      footer: footer(null, 0),
    },
    {
      assignmentId: "q4b",
      title: "4.2 Photosynthesis Quiz",
      type: "formative" as const,
      unit: u(4),
      footer: footer(66),
    },
    {
      assignmentId: "q4a",
      title: "4.1 Cell Energy Quiz",
      type: "formative" as const,
      unit: u(4),
      footer: footer(81.4),
    },
    {
      assignmentId: "t3",
      title: "Unit 3 Test",
      type: "summative" as const,
      unit: u(3),
      footer: footer(78),
    },
    {
      assignmentId: "q3",
      title: "Membranes",
      type: "formative" as const,
      unit: u(3),
      footer: footer(84),
    },
  ];

  it("labels by kind, numbered within the unit from the oldest", () => {
    expect(kindLabels(columns)).toEqual(["Test", "Quiz 2", "Quiz", "Test", "Quiz"]);
  });

  it("groups by unit, newest first, oldest assessment first, skipping tests nobody turned in", () => {
    const groups = unitGroups(columns);
    expect(groups.map((g) => g.name)).toEqual(["Unit 4", "Unit 3"]);
    expect(groups[0].rows.map((r) => [r.label, r.average])).toEqual([
      ["Quiz", 81.4],
      ["Quiz 2", 66],
    ]);
    expect(groups[1].rows.map((r) => r.label)).toEqual(["Quiz", "Test"]);
  });
});

describe("cellLook and cellText", () => {
  const tag = (kind: string, group: string, closed = false, progress: unknown = null) =>
    ({ kind, group, closed, progress }) as never;

  it("gives every state of the old key its own look", () => {
    expect(cellLook(tag("taking", "testing"))).toBe("testing");
    expect(cellLook(tag("paused", "testing"))).toBe("paused");
    expect(cellLook(tag("missing", "owes"))).toBe("missing");
    expect(cellLook(tag("not_started", "owes"))).toBe("not_started");
    expect(cellLook(tag("corrections_needed", "owes"))).toBe("owes");
    expect(cellLook(tag("request", "your_move"))).toBe("your_move");
    expect(cellLook(tag("asked", "your_move"))).toBe("your_move");
    expect(cellLook(tag("ready", "your_ok"))).toBe("your_ok");
    expect(cellLook(tag("can_retake", "quiet"))).toBe("done");
    expect(cellLook(tag("done", "done"))).toBe("done");
    expect(cellLook(tag("opens", "quiet"))).toBe("empty");
    // A retake state on a closed test can't be taken: plain.
    expect(cellLook(tag("retake_needed", "owes", true))).toBe("done");
  });

  it("never carries state by colour alone", () => {
    const score = { percent: 61.6, tier: null, basis: null };
    const show = (t: never, s: typeof score | null = score, hideScores = false) =>
      cellText({ tag: t, score: s }, { hideScores }).text;
    expect(show(tag("taking", "testing", false, { answered: 4, total: 25 }))).toBe("4/25");
    expect(show(tag("paused", "testing"))).toBe("Paused");
    expect(show(tag("missing", "owes"), null)).toBe("Missing");
    expect(show(tag("not_started", "owes"), null)).toBe("–");
    expect(show(tag("corrections_needed", "owes"))).toBe("62");
    expect(show(tag("asked", "your_move"), null)).toBe("Asked");
    expect(show(tag("to_grade", "your_move"), null)).toBe("Grade");
  });

  it("keeps the words and swaps numbers for a dot when scores are hidden", () => {
    const score = { percent: 62, tier: null, basis: null };
    expect(
      cellText({ tag: tag("corrections_needed", "owes"), score }, { hideScores: true })
    ).toEqual({ text: "", dot: true, small: false });
    expect(cellText({ tag: tag("missing", "owes"), score: null }, { hideScores: true }).text).toBe(
      "Missing"
    );
  });
});
