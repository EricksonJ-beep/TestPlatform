import { describe, expect, it } from "vitest";
import type { CardState } from "./card-state";
import { cellTag, type CellInput, type ColumnFooter } from "./class-gradebook";
import {
  cellMarks,
  cellSentence,
  DEFAULT_FILTERS,
  gradebookView,
  isToDo,
  phoneLine,
  rightNow,
  scoreText,
  studentPanel,
  studentPanelItems,
  timeLeft,
  whoChip,
} from "./gradebook-view";
import type {
  ClassGradebook,
  ClassGradebookAttempt,
  ClassGradebookCell,
  ClassGradebookColumn,
} from "./queries/class-gradebook";
import { buildStudentToDo, type ToDoAssignment } from "./student-home";

const NOW = new Date("2026-10-13T15:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const fmt = { time: (d: Date) => d.toISOString().slice(5, 16), date: () => "Oct 9" };

const card = (c: Partial<CardState> = {}): CardState => ({
  status: "open",
  state: "done",
  cycle: "done",
  capped: true,
  rule: "gate",
  retakeBy: null,
  windowClosed: false,
  quizPractice: [],
  reopenedUntil: null,
  retakeRequested: false,
  askCounts: false,
  ...c,
});
const tag = (i: Partial<CellInput>) =>
  cellTag({
    card: card(),
    attemptsUsed: 1,
    live: null,
    requested: false,
    correctionsToCheck: 0,
    toGrade: 0,
    activitiesToCheck: 0,
    corrections: null,
    retake: null,
    unlockedBlocker: null,
    opensAt: null,
    ...i,
  });
const attempt = (a: Partial<ClassGradebookAttempt> = {}): ClassGradebookAttempt => ({
  id: "a1",
  number: 1,
  status: "graded",
  percent: 62,
  startedAt: hours(-50),
  submittedAt: hours(-49),
  tabSwitches: 0,
  pendingManual: 0,
  paused: false,
  outOfTime: false,
  dueAt: null,
  askedAt: null,
  scopeCodes: null,
  ...a,
});
const cell = (
  c: Partial<ClassGradebookCell> & { input?: Partial<CellInput> }
): ClassGradebookCell => {
  const { input, ...rest } = c;
  return {
    assignmentId: "quiz",
    studentId: "s",
    card: "done",
    cycle: "done",
    rule: "gate",
    tag: tag(input ?? {}),
    score: null,
    attemptsUsed: 1,
    attempts: [attempt()],
    openAttemptId: null,
    latestAttemptId: "a1",
    corrections: null,
    retake: null,
    quizPractice: [],
    unlock: null,
    reopenedUntil: null,
    retakeBy: null,
    tabSwitches: 0,
    movedUpThisWeek: false,
    ...rest,
  };
};
const footer: ColumnFooter = {
  done: 0,
  enrolled: 3,
  average: null,
  tiers: null,
  movedUpThisWeek: 0,
};
const column = (c: Partial<ClassGradebookColumn> = {}): ClassGradebookColumn => ({
  assignmentId: "quiz",
  assessmentId: "x",
  title: "Cell Quiz",
  type: "formative",
  opensAt: null,
  closesAt: null,
  status: "open",
  attemptsAllowed: 3,
  threshold: 80,
  reviewMode: "auto",
  retakesNeedUnlock: false,
  correctionsCap: true,
  cvtcRules: false,
  footer,
  ...c,
});
const student = (id: string, firstName: string, lastName: string) => ({ id, firstName, lastName });
/** One test as the student's to-do reads it (the loader builds these from its batched read). */
const todoAsg = (a: Partial<ToDoAssignment>): ToDoAssignment => ({
  id: "quiz",
  title: "Cell Quiz",
  type: "formative",
  className: "Bio 2nd",
  closesAt: null,
  status: "open",
  state: "not_started",
  cycle: null,
  attemptsAllowed: 3,
  attemptsUsed: 0,
  timeLimitMinutes: null,
  needsCode: false,
  nextAttemptAt: null,
  retakesNeedUnlock: false,
  retakeRequested: false,
  reopenedUntil: null,
  askCounts: false,
  correctionsCap: true,
  retakeThreshold: 80,
  correctionsRule: "gate",
  retakeBy: null,
  retakeWindowClosed: false,
  firstPercent: null,
  paused: false,
  progress: null,
  corrections: null,
  retake: null,
  quizPractice: [],
  ...a,
});
const nothingToDo = buildStudentToDo({ assignments: [] });

/** Three students × (Unit test S, Cell quiz F, Practice P). */
function book(): ClassGradebook {
  const columns = [
    column({ assignmentId: "test", title: "Unit 3 Test", type: "summative" }),
    column({ assignmentId: "quiz", title: "Cell Quiz" }),
    column({ assignmentId: "prac", title: "Practice", type: "practice" }),
  ];
  const ada = student("ada", "Ada", "Adams");
  const cho = student("cho", "Lin", "Cho");
  const eli = student("eli", "Eli", "Stone");
  const notStarted = { attemptsUsed: 0 };
  return {
    class: { id: "c", name: "Bio 2nd", period: "2", term: null, courseId: "b", courseName: "Bio" },
    students: [ada, cho, eli],
    columns,
    rows: [
      {
        student: ada,
        studentToDo: nothingToDo,
        cells: [
          cell({ assignmentId: "test", input: { requested: true } }),
          cell({ input: { card: card({ cycle: "done" }) } }),
          cell({ assignmentId: "prac", input: notStarted }),
        ],
      },
      {
        student: cho,
        // Her home: corrections on the quiz (1 of 4 started), then the unit test she hasn't started.
        studentToDo: buildStudentToDo({
          assignments: [
            todoAsg({ id: "test", title: "Unit 3 Test", type: "summative" }),
            todoAsg({
              state: "corrections_needed",
              cycle: "corrections_needed",
              attemptsUsed: 1,
              firstPercent: 40,
              corrections: {
                state: "needed",
                needed: 4,
                done: 1,
                remaining: 3,
                approved: 0,
                returned: 0,
                started: 1,
                reviewerNote: null,
                attemptId: "a1",
                attemptNumber: 1,
              },
            }),
            todoAsg({ id: "prac", title: "Practice", type: "practice" }),
          ],
        }),
        cells: [
          cell({ assignmentId: "test", input: notStarted, attemptsUsed: 0, attempts: [] }),
          cell({
            input: {
              card: card({ cycle: "corrections_needed" }),
              corrections: { started: 1, needed: 4 },
            },
          }),
          cell({ assignmentId: "prac", input: notStarted }),
        ],
      },
      {
        student: eli,
        studentToDo: nothingToDo,
        cells: [
          cell({
            assignmentId: "test",
            openAttemptId: "open1",
            attempts: [
              attempt({ id: "open1", status: "in_progress", percent: null, dueAt: hours(0.3) }),
            ],
            input: { live: { paused: false, asked: false, answered: 14, total: 25 } },
          }),
          cell({
            openAttemptId: "open2",
            attempts: [
              attempt(),
              attempt({
                id: "open2",
                number: 2,
                status: "in_progress",
                percent: null,
                paused: true,
                askedAt: hours(-0.1),
              }),
            ],
            // Answers to grade outrank paused on the tag; the strip still shows the paused test.
            input: { toGrade: 1, live: { paused: true, asked: true, answered: 3, total: 10 } },
          }),
          cell({ assignmentId: "prac", input: {} }),
        ],
      },
    ],
    generatedAt: NOW,
  };
}

describe("whoChip / isToDo", () => {
  it("files the teacher's moves under Needs you and the student's under what they owe", () => {
    expect(whoChip(tag({ requested: true }))).toBe("needs_you");
    expect(whoChip(tag({ card: card({ cycle: "corrections_to_full" }) }))).toBe("corrections");
    expect(whoChip(tag({ card: card({ cycle: "corrections_returned" }) }))).toBe("sent_back");
    expect(whoChip(tag({ attemptsUsed: 0 }))).toBe("not_started");
    expect(whoChip(tag({ attemptsUsed: 0, card: card({ status: "closed" }) }))).toBe("missing");
    expect(whoChip(tag({ card: card({ cycle: "awaiting_unlock" }) }))).toBe("ready");
    expect(whoChip(tag({ live: { paused: false, asked: false, answered: 1, total: 2 } }))).toBe(
      "testing"
    );
    expect(whoChip(tag({}))).toBeNull();
  });
  it("counts the teacher's move and what the student owes as to do; not testing, Ready, or a closed retake", () => {
    expect(isToDo(tag({ toGrade: 1 }))).toBe(true);
    expect(isToDo(tag({ attemptsUsed: 0, card: card({ status: "closed" }) }))).toBe(true);
    expect(isToDo(tag({ card: card({ cycle: "corrections_to_full" }) }))).toBe(true);
    expect(isToDo(tag({ card: card({ cycle: "awaiting_unlock" }) }))).toBe(false);
    expect(isToDo(tag({ live: { paused: true, asked: false, answered: 1, total: 2 } }))).toBe(
      false
    );
    const closedRetake = tag({ card: card({ status: "closed", cycle: "retake_required" }) });
    expect(closedRetake).toMatchObject({ kind: "retake_needed", closed: true });
    expect(isToDo(closedRetake)).toBe(false);
    expect(whoChip(closedRetake)).toBeNull();
  });
});

describe("gradebookView", () => {
  it("hides practice by default, counts chips over the class, and keeps roster order", () => {
    const v = gradebookView(book(), DEFAULT_FILTERS);
    expect(v.columns.map((c) => c.title)).toEqual(["Unit 3 Test", "Cell Quiz"]);
    expect(v.practiceColumns).toBe(1);
    expect(v.rows.map((r) => [r.student.firstName, r.toDo])).toEqual([
      ["Ada", 1],
      ["Lin", 2],
      ["Eli", 1],
    ]);
    expect(v.chips).toMatchObject({ needs_you: 2, corrections: 1, not_started: 1, testing: 1 });
    expect(v.chips.missing).toBe(0);
    const all = gradebookView(book(), { ...DEFAULT_FILTERS, showPractice: true });
    expect(all.columns).toHaveLength(3);
    // Practice not started counts once it shows.
    expect(all.chips.not_started).toBe(3);
  });
  it("filters by who owes, by name, and by chip, and sorts by most to do", () => {
    const b = book();
    expect(
      gradebookView(b, { ...DEFAULT_FILTERS, sort: "todo" }).rows.map((r) => r.student.id)
    ).toEqual(["cho", "ada", "eli"]);
    expect(
      gradebookView(b, { ...DEFAULT_FILTERS, find: "cho, l" }).rows.map((r) => r.student.id)
    ).toEqual(["cho"]);
    expect(
      gradebookView(b, { ...DEFAULT_FILTERS, find: "ELI st" }).rows.map((r) => r.student.id)
    ).toEqual(["eli"]);
    expect(
      gradebookView(b, { ...DEFAULT_FILTERS, chip: "corrections" }).rows.map((r) => r.student.id)
    ).toEqual(["cho"]);
    // The chips still count the whole class while one is picked.
    expect(gradebookView(b, { ...DEFAULT_FILTERS, chip: "corrections" }).chips.needs_you).toBe(2);
    b.rows[0].cells[0] = cell({ assignmentId: "test", input: {} });
    expect(
      gradebookView(b, { ...DEFAULT_FILTERS, onlyOwing: true }).rows.map((r) => r.student.id)
    ).toEqual(["cho", "eli"]);
  });
  it("the student panel lists the columns the grid shows, so its count matches the row", () => {
    const b = book();
    const row = gradebookView(b, DEFAULT_FILTERS).rows.find((r) => r.student.id === "cho")!;
    const panel = studentPanelItems(b, "cho", DEFAULT_FILTERS)!;
    expect(panel.toDo.map((x) => x.column.title)).toEqual(["Unit 3 Test", "Cell Quiz"]);
    expect(panel.toDo).toHaveLength(row.toDo);
    expect(panel.total).toBe(2);
    // With Practice on, the practice set they haven't started shows (and counts) there too.
    const all = studentPanelItems(b, "cho", { showPractice: true })!;
    expect(all.toDo.map((x) => x.column.title)).toEqual(["Unit 3 Test", "Cell Quiz", "Practice"]);
    expect(studentPanelItems(b, "nobody", DEFAULT_FILTERS)).toBeNull();
  });
  it("the student panel lists the student's own to-do, and what isn't on it (Oct 14 2026)", () => {
    const b = book();
    const panel = studentPanel(b, "cho", DEFAULT_FILTERS)!;
    // The list is the student's own (one builder), whatever the Practice switch says.
    expect(panel.list).toBe(b.rows[1].studentToDo);
    expect(panel.list.todo.map((r) => [r.kind, r.assignmentId])).toEqual([
      ["corrections", "quiz"],
      ["start", "prac"],
      ["start", "test"],
    ]);
    expect(panel.list.todo[0].why).toBe(
      "Correct 4 missed questions to raise your score from 40% to 80%."
    );
    expect(panel.cells.get("quiz")?.column.title).toBe("Cell Quiz");
    // The header still counts the grid's to-do cells, so it matches the row badge.
    expect(panel).toMatchObject({ toDo: 2, done: 0, total: 2, also: [] });
    // Eli's list is empty; what the teacher still acts on or watches shows under "also".
    const eli = studentPanel(b, "eli", DEFAULT_FILTERS)!;
    expect(eli.list.count).toBe(0);
    expect(eli.also.map((x) => x.column.title)).toEqual(["Unit 3 Test", "Cell Quiz"]);
    expect(studentPanel(b, "nobody", DEFAULT_FILTERS)).toBeNull();
  });
  it("writes the phone line", () => {
    const v = gradebookView(book(), DEFAULT_FILTERS);
    expect(phoneLine(v.rows[1])).toBe("Cho, L: 2 to do");
    expect(phoneLine({ student: student("x", "Ava", "Moss"), toDo: 0 })).toBe(
      "Moss, A: all caught up"
    );
  });
});

describe("rightNow", () => {
  it("lists every open attempt, testing or paused, whatever tag won the cell", () => {
    const live = rightNow(book());
    expect(live.testing).toMatchObject([
      { attemptId: "open1", title: "Unit 3 Test", answered: 14, total: 25, paused: false },
    ]);
    expect(live.paused).toMatchObject([
      { attemptId: "open2", title: "Cell Quiz", attemptNumber: 2, asked: true, answered: 3 },
    ]);
    expect(timeLeft(live.testing[0].dueAt, NOW)).toBe("18 min left");
  });
  it("leaves out a test whose time ran out with nobody in it (the live stamp's testing rule)", () => {
    const gb = book();
    const eliTest = gb.rows[2].cells[0];
    eliTest.attempts = eliTest.attempts.map((a) =>
      a.id === "open1" ? { ...a, dueAt: hours(-30), outOfTime: true } : a
    );
    eliTest.tag = tag({
      live: { paused: false, asked: false, outOfTime: true, answered: 14, total: 25 },
    });
    const live = rightNow(gb);
    expect(live.testing).toEqual([]);
    expect(live.paused.map((r) => r.attemptId)).toEqual(["open2"]);
    expect(whoChip(eliTest.tag)).toBeNull();
    expect(isToDo(eliTest.tag)).toBe(false);
  });
  it("time left", () => {
    expect(timeLeft(null, NOW)).toBeNull();
    expect(timeLeft(hours(-0.1), NOW)).toBe("time's up");
    expect(timeLeft(hours(1.5), NOW)).toBe("1 h 30 min left");
    expect(timeLeft(hours(2), NOW)).toBe("2 h left");
  });
});

describe("one cell", () => {
  it("score line and small marks", () => {
    const c = cell({
      score: { percent: 80, tier: null, basis: "corrections_to_threshold" },
      attemptsUsed: 2,
      tabSwitches: 3,
      cycle: "retake_available",
      retakeBy: hours(30),
    });
    expect(scoreText(c)).toBe("80%");
    expect(scoreText(cell({ score: { percent: 74.4, tier: 2, basis: "per_target" } }))).toBe(
      "T2 74%"
    );
    expect(cellMarks(c, column(), NOW)).toEqual({
      tries: { used: 2, allowed: 3 },
      retakeBy: hours(30),
      tabSwitches: 3,
      viaFixes: true,
    });
    // The clock shows only under 48 hours, on an open test, while a retake is on offer.
    expect(cellMarks({ ...c, retakeBy: hours(50) }, column(), NOW).retakeBy).toBeNull();
    expect(cellMarks(c, column({ status: "closed" }), NOW).retakeBy).toBeNull();
    expect(cellMarks({ ...c, cycle: "done" }, column(), NOW).retakeBy).toBeNull();
    expect(cellMarks(cell({ attemptsUsed: 0, attempts: [] }), column(), NOW).tries).toBeNull();
  });
  it("the panel's plain sentence, with and without scores", () => {
    const c = cell({
      corrections: {
        state: "needed",
        needed: 8,
        done: 0,
        remaining: 8,
        approved: 0,
        returned: 0,
        started: 3,
        reviewerNote: null,
        attemptId: "a1",
        attemptNumber: 1,
      },
      score: { percent: 62, tier: null, basis: "best_attempt" },
    });
    expect(cellSentence(c, column(), { hideScores: false, fmt })).toBe(
      "Took try 1 Oct 9 (62%); corrections 3 of 8 started, not turned in yet; counts 62%."
    );
    expect(cellSentence(c, column(), { hideScores: true, fmt })).toBe(
      "Took try 1 Oct 9; corrections 3 of 8 started, not turned in yet."
    );
    const none = cell({ attemptsUsed: 0, attempts: [] });
    expect(cellSentence(none, column(), { hideScores: false, fmt })).toBe("Hasn't started yet.");
    expect(
      cellSentence(none, column({ status: "closed", closesAt: NOW }), { hideScores: false, fmt })
    ).toBe("Never started; the test closed Oct 9.");
    const eli = book().rows[2].cells[1];
    expect(cellSentence(eli, column(), { hideScores: false, fmt })).toBe(
      "Took try 1 Oct 9 (62%); try 2 is paused at 3 of 10 answered; they asked to finish."
    );
    // A closed test the teacher reopened for this student (Oct 14 2026, R4).
    const reopened = cell({ reopenedUntil: hours(30) });
    expect(cellSentence(reopened, column({ status: "closed" }), { hideScores: true, fmt })).toBe(
      "Took try 1 Oct 9; reopened through Oct 9."
    );
    // Quiz practice still owed before the retake (Oct 14 2026, R3), with the best so far.
    const target = (code: string, best: number | null, done = false) => ({
      targetId: code,
      code,
      title: code,
      scored: 40,
      best,
      done,
      minQuestions: 5,
    });
    const practicing = cell({
      cycle: "relearning",
      quizPractice: [target("U2.LT1", 60), target("U2.LT2", 85, true), target("U2.LT3", null)],
    });
    expect(cellSentence(practicing, column(), { hideScores: false, fmt })).toBe(
      "Took try 1 Oct 9 (62%); needs 80% on practice for U2.LT1 (best 60%) and U2.LT3."
    );
    expect(cellSentence(practicing, column(), { hideScores: true, fmt })).toBe(
      "Took try 1 Oct 9; needs 80% on practice for U2.LT1 and U2.LT3."
    );
    // Only while practice is what stands before the retake (not with corrections still owed).
    expect(
      cellSentence({ ...practicing, cycle: "corrections_needed" }, column(), {
        hideScores: true,
        fmt,
      })
    ).toBe("Took try 1 Oct 9.");
  });
});
