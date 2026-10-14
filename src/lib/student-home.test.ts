import { describe, expect, it } from "vitest";
import type { StudentAssignment } from "@/lib/queries/assignments";
import type { RetakeStatus } from "@/lib/queries/retakes";
import {
  assessmentsByStatus,
  buildStudentToDo,
  closedCorrectionsCount,
  correctionsActionLabel,
  correctionsProgress,
  correctionsWhy,
  homeTab,
  showsScore,
  type ToDoRow,
} from "./student-home";

const SEP25 = new Date("2026-09-25T15:50:00Z");
const OCT10 = new Date("2026-10-10T16:05:00Z");
const OCT16 = new Date("2026-10-16T20:00:00Z");
const OCT20 = new Date("2026-10-20T20:00:00Z");

/** A student's card as `listStudentAssignments` returns it; open, untouched, by default. */
function a(title: string, over: Partial<StudentAssignment> = {}): StudentAssignment {
  return {
    id: title,
    title,
    type: "formative",
    className: "Bio 4th",
    teacherLastName: "Erickson",
    opensAt: null,
    closesAt: null,
    timeLimitMinutes: null,
    attemptsAllowed: 3,
    needsCode: false,
    resultsReleased: true,
    retakeWaitHours: 0,
    nextAttemptAt: null,
    retakesNeedUnlock: false,
    retakeRequested: false,
    reopenedUntil: null,
    askCounts: false,
    correctionsCap: true,
    retakeThreshold: 80,
    cvtcRules: false,
    correctionsRule: "gate",
    retakeBy: null,
    retakeWindowClosed: false,
    firstPercent: null,
    final: null,
    status: "open",
    attemptsUsed: 0,
    inProgressAttemptId: null,
    paused: false,
    progress: null,
    bestPercent: null,
    corrections: null,
    retake: null,
    quizPractice: [],
    state: "not_started",
    cycle: null,
    ...over,
  };
}

const corrections = (attemptId: string, needed: number, done = 0, started = done) =>
  ({
    state: "needed",
    needed,
    done,
    remaining: needed - done,
    approved: 0,
    returned: 0,
    started,
    reviewerNote: null,
    attemptId,
    attemptNumber: 1,
  }) as const;

/** Viola (Oct 14 2026): two closed capped quizzes at 40% and 50%, no corrections done. */
const violaLt1 = a("Unit 2 LT1 Quiz", {
  closesAt: SEP25,
  status: "closed",
  attemptsUsed: 1,
  firstPercent: 40,
  bestPercent: 40,
  final: { percent: 40, basis: "best_attempt" },
  corrections: corrections("att-lt1", 3),
  state: "corrections_needed",
  cycle: "corrections_needed",
});
const violaCarbs = a("Unit 2 Quiz: Carbohydrates", {
  closesAt: OCT10,
  status: "closed",
  attemptsUsed: 1,
  firstPercent: 50,
  bestPercent: 50,
  final: { percent: 50, basis: "best_attempt" },
  corrections: corrections("att-carbs", 5),
  state: "corrections_needed",
  cycle: "corrections_needed",
});

const summary = (r: ToDoRow) => [r.kind, r.title];

describe("the student to-do list", () => {
  it("Viola: two corrections rows, most recently closed first, counted", () => {
    const list = buildStudentToDo({ assignments: [violaLt1, violaCarbs] });
    expect(list.headline).toBe("You have 2 things to do.");
    expect(list.count).toBe(2);
    expect(list.todo.map(summary)).toEqual([
      ["corrections", "Unit 2 Quiz: Carbohydrates"],
      ["corrections", "Unit 2 LT1 Quiz"],
    ]);
    expect(list.todo[0]).toMatchObject({
      why: "Correct 5 missed questions to raise your score from 50% to 80%.",
      // Hide scores in the teacher's panel: her 50% goes, the row still says what it's for.
      whyWithoutScores: "Correct 5 missed questions to raise your score to 80%.",
      progress: { value: 0, max: 5, label: "0 of 5 started" },
      when: null,
      action: { kind: "link", label: "Do corrections", href: "/student/corrections/att-carbs" },
    });
    expect(list.todo[1].why).toBe(
      "Correct 3 missed questions to raise your score from 40% to 80%."
    );
    expect(list.higher).toEqual([]);
    expect(list.waiting).toEqual([]);
  });

  it("Viola after corrections: practice before asking is optional on a closed quiz; Build my practice opens on the target", () => {
    const practised = {
      ...violaLt1,
      corrections: null,
      final: { percent: 80, basis: "corrections_to_threshold" as const },
      state: "closed" as const,
      cycle: "relearning" as const,
      quizPractice: [
        {
          targetId: "lt1",
          code: "U2.LT1",
          title: "Carbon",
          scored: 40,
          best: 60,
          done: false,
          minQuestions: 5,
        },
      ],
    };
    const list = buildStudentToDo({
      assignments: [practised],
      buildableTargetIds: new Set(["lt1"]),
    });
    expect(list.headline).toBe("You're all caught up.");
    expect(list.higher).toHaveLength(1);
    expect(list.higher[0]).toMatchObject({
      kind: "practice",
      why: "Practice U2.LT1: score 80% on at least 5 questions on it before you can ask to retake (you scored 40%).",
      // Hide scores (the teacher's panel) keeps what the row is about, without her score.
      whyWithoutScores:
        "Practice U2.LT1: score 80% on at least 5 questions on it before you can ask to retake.",
      progress: { value: 60, max: 80, label: "Best so far: 60%" },
      action: { label: "Practice", href: "/student/practice/build?target=lt1", primary: false },
    });
    // Only a teacher's set covers it (Build my practice can't deal it): on a closed quiz, its own
    // page, which lists the sets; the Practice tab lists open tests only (review, Oct 14 2026).
    const setOnly = { ...practised.quizPractice[0], minQuestions: null };
    expect(
      buildStudentToDo({ assignments: [{ ...practised, quizPractice: [setOnly] }] }).higher[0]
    ).toMatchObject({
      why: "Practice U2.LT1: score 80% on a practice before you can ask to retake (you scored 40%).",
      action: { href: "/student/assignments/Unit 2 LT1 Quiz#practice" },
    });
    // On an open quiz the same step is a counted To do row, aimed at the retake itself.
    const open = buildStudentToDo({
      assignments: [{ ...practised, status: "open", closesAt: OCT20, state: "relearning" }],
    });
    expect(open.count).toBe(1);
    expect(open.todo[0]).toMatchObject({
      kind: "practice",
      why: "Practice U2.LT1: score 80% on at least 5 questions on it to unlock your retake (you scored 40%).",
      when: { label: "Closes", at: OCT20 },
      // Not buildable for this student: the test's group on the Practice tab.
      action: { href: "/student?tab=practice#needed-Unit 2 LT1 Quiz", primary: true },
    });
  });

  it("corrections wording follows the rule: to 100%, a later attempt, closed, no attempts left", () => {
    const full = a("Element quiz", {
      attemptsUsed: 1,
      firstPercent: 85,
      correctionsRule: "to_full",
      corrections: corrections("x", 2),
      state: "corrections_to_full",
    });
    expect(correctionsWhy(full)).toBe(
      "Correct 2 missed questions to raise your score from 85% to 100%. There's no retake at your score."
    );
    const test = a("Unit 1 Test", {
      type: "summative",
      correctionsCap: false,
      attemptsUsed: 1,
      corrections: corrections("y", 4),
      state: "corrections_needed",
    });
    expect(correctionsWhy(test)).toBe("Correct 4 missed questions to unlock attempt 2.");
    expect(correctionsWhy({ ...test, retakesNeedUnlock: true })).toBe(
      "Correct 4 missed questions before you can ask for attempt 2."
    );
    expect(correctionsWhy({ ...test, status: "closed" })).toBe(
      "Correct 4 missed questions before you can ask to retake."
    );
    expect(correctionsWhy({ ...test, attemptsUsed: 3 })).toBe(
      "Correct 4 missed questions on attempt 1."
    );
    // Started: Continue corrections. A saved draft is "started", never "done" (review, Oct 14):
    // the set goes in all at once, and the teacher's tag counts the same thing.
    const started = buildStudentToDo({
      assignments: [{ ...test, corrections: corrections("y", 4, 0, 2) }],
    });
    expect(started.todo[0]).toMatchObject({
      progress: { value: 2, max: 4, label: "2 of 4 started, not turned in yet" },
      action: { label: "Continue corrections" },
    });
    // Every one started: finish them and turn them in.
    const all = corrections("y", 4, 0, 4);
    expect(
      buildStudentToDo({ assignments: [{ ...test, corrections: all }] }).todo[0]
    ).toMatchObject({
      progress: { label: "4 of 4 started, not turned in yet" },
      action: { label: "Finish and turn in" },
    });
    expect(correctionsActionLabel(all)).toBe("Finish and turn in");
    // A regrade that adds a missed question to a set already sent in: 3 were turned in.
    expect(correctionsProgress(corrections("y", 4, 3, 3)).label).toBe("3 of 4 started");
  });

  it("CVTC: no corrections rows; the retake is the way up", () => {
    const ap = a("Tissue quiz", {
      cvtcRules: true,
      correctionsCap: false,
      correctionsRule: "none",
      attemptsUsed: 1,
      firstPercent: 40,
      closesAt: OCT16,
      state: "retake_available",
      cycle: "retake_available",
    });
    const list = buildStudentToDo({ assignments: [ap] });
    expect(list.count).toBe(0);
    expect(list.higher.map(summary)).toEqual([["retake", "Tissue quiz"]]);
    expect(list.higher[0]).toMatchObject({
      why: "Retake it to raise your score. Your highest score counts.",
      when: { label: "Closes", at: OCT16 },
      action: { label: "Start retake", primary: false },
    });
  });

  it("puts the kinds in the plan's order, soonest deadline first inside a kind", () => {
    const list = buildStudentToDo({
      assignments: [
        a("Unit 3 Quiz", { closesAt: OCT20 }),
        a("Unit 2 Test", {
          type: "summative",
          closesAt: OCT16,
          timeLimitMinutes: 20,
          needsCode: true,
        }),
        a("Lab safety"),
        a("Cells quiz", {
          state: "in_progress",
          inProgressAttemptId: "p",
          paused: true,
          progress: { answered: 3, total: 10 },
          closesAt: OCT10,
          status: "closed",
          attemptsUsed: 1,
        }),
        a("Sugar quiz", {
          attemptsUsed: 1,
          corrections: { ...corrections("s", 2), state: "returned", reviewerNote: "Explain why." },
          state: "corrections_returned",
        }),
        violaLt1,
      ],
    });
    expect(list.todo.map(summary)).toEqual([
      ["keep_going", "Cells quiz"],
      ["sent_back", "Sugar quiz"],
      ["corrections", "Unit 2 LT1 Quiz"],
      ["start", "Unit 2 Test"],
      ["start", "Unit 3 Quiz"],
      ["start", "Lab safety"],
    ]);
    expect(list.headline).toBe("You have 6 things to do.");
    expect(list.todo[0]).toMatchObject({
      why: "Paused. Finish it in class.",
      progress: { value: 3, max: 10, label: "3 of 10 answered" },
      action: { label: "Finish in class", primary: true },
    });
    expect(list.todo[1]).toMatchObject({
      note: "Explain why.",
      action: { label: "Revise corrections" },
    });
    // Decision 3: not started counts, with its close, time and code on the row.
    expect(list.todo[3]).toMatchObject({
      why: null,
      when: { label: "Closes", at: OCT16 },
      minutes: 20,
      needsCode: true,
      action: { label: "Start", href: "/student/assignments/Unit 2 Test" },
    });
    expect(list.todo[5].why).toBe("Open now.");
  });

  it("lists what waits on the teacher, uncounted: a grade, corrections being checked, a request, an activity", () => {
    const list = buildStudentToDo({
      assignments: [
        a("Essay quiz", { attemptsUsed: 1, state: "awaiting_grade" }),
        a("Sugar quiz", {
          attemptsUsed: 1,
          corrections: { ...corrections("s", 2, 2), state: "submitted" },
          state: "corrections_submitted",
        }),
        a("Unit 2 LT1 Quiz", {
          closesAt: SEP25,
          status: "closed",
          attemptsUsed: 1,
          state: "awaiting_unlock",
          retakeRequested: true,
        }),
        a("Check-in", {
          attemptsUsed: 1,
          retakesNeedUnlock: true,
          state: "awaiting_unlock",
          retakeRequested: true,
        }),
      ],
      activities: [
        { id: "act1", title: "Osmosis video", state: "awaiting_teacher", courseName: "Biology" },
        { id: "act2", title: "Diffusion lab", state: "done", courseName: "Biology" },
      ],
    });
    expect(list.count).toBe(0);
    expect(list.headline).toBe("You're all caught up.");
    // In the plan's order (Oct 14 2026: one order for the home and the teacher's panel).
    expect(list.waiting.map(summary)).toEqual([
      ["awaiting_grade", "Essay quiz"],
      ["corrections_submitted", "Sugar quiz"],
      ["retake_requested", "Check-in"],
      ["retake_requested", "Unit 2 LT1 Quiz"],
      ["activity_check", "Osmosis video"],
    ]);
    expect(list.waiting[0].why).toBe(
      "Your teacher is grading your written answers. Your score shows up once they're done."
    );
    expect(list.waiting[2].why).toBe(
      "You asked for attempt 2. Your teacher will approve it, usually in class."
    );
    expect(list.waiting[3].why).toMatch(
      /^You asked to retake this test\. If your teacher says yes/
    );
  });

  it("ask to retake: counted when the retake would be required, otherwise a higher score", () => {
    const retake = (required: boolean): RetakeStatus => ({
      targets: [
        {
          id: "t3",
          code: "U1.LT3",
          title: "Osmosis",
          percent: required ? 60 : 85,
          required,
          optedIn: !required,
          gate: { correctionsOk: true, activityOk: true, practiceOk: true, unlocked: true },
        },
      ],
      optionalRetakes: true,
      threshold: 80,
      plan: {
        required: required ? ["t3"] : [],
        optional: required ? [] : ["t3"],
        selected: ["t3"],
        locked: [],
        canStart: true,
        blocker: null,
      },
    });
    const closedTest = (title: string, required: boolean) =>
      a(title, {
        type: "summative",
        correctionsCap: false,
        closesAt: OCT10,
        status: "closed",
        attemptsUsed: 1,
        retake: retake(required),
        state: "ask_to_retake",
        askCounts: required,
      });
    const list = buildStudentToDo({
      assignments: [closedTest("Unit 1 Test", true), closedTest("Unit 2 Test", false)],
    });
    expect(list.count).toBe(1);
    expect(list.todo[0]).toMatchObject({
      kind: "ask",
      title: "Unit 1 Test",
      action: { kind: "ask", label: "Ask to retake", attemptNumber: 2, primary: true },
    });
    expect(list.todo[0].why).toMatch(
      /^This test is closed, and you still need to retake U1\.LT3\./
    );
    expect(list.higher[0]).toMatchObject({
      kind: "ask",
      title: "Unit 2 Test",
      action: { kind: "ask", label: "Ask to retake", primary: false },
    });
    expect(list.higher[0].why).toMatch(/^This test is closed\. Want a higher score\?/);
  });

  it("required retakes and relearning count; a wait shows when the retake can start, with no button", () => {
    const retake: RetakeStatus = {
      targets: [
        {
          id: "t3",
          code: "U1.LT3",
          title: "Osmosis",
          percent: 50,
          required: true,
          optedIn: false,
          gate: { correctionsOk: true, activityOk: false, practiceOk: true, unlocked: false },
        },
      ],
      optionalRetakes: true,
      threshold: 80,
      plan: {
        required: ["t3"],
        optional: [],
        selected: ["t3"],
        locked: ["t3"],
        canStart: false,
        blocker: "gates",
      },
    };
    const test = a("Unit 1 Test", {
      type: "summative",
      correctionsCap: false,
      attemptsUsed: 1,
      closesAt: OCT20,
      retake,
      state: "relearning",
      cycle: "relearning",
    });
    const relearning = buildStudentToDo({ assignments: [test] });
    expect(relearning.todo[0]).toMatchObject({
      kind: "relearning",
      why: "Finish relearning on U1.LT3 to unlock your retake.",
      checklist: [
        { code: "U1.LT3", corrections: true, activity: false, practice: true, title: "Osmosis" },
      ],
      action: { label: "View checklist", href: "/student?tab=practice#needed-Unit 1 Test" },
    });
    const ready = {
      ...retake,
      plan: { ...retake.plan, locked: [], canStart: true, blocker: null },
    };
    const wait = buildStudentToDo({
      assignments: [
        {
          ...test,
          retake: ready,
          state: "retake_required",
          cycle: "retake_required",
          nextAttemptAt: OCT16,
        },
      ],
    });
    expect(wait.todo[0]).toMatchObject({
      kind: "retake",
      why: "You still need to retake U1.LT3. Your best score on each target counts.",
      when: { label: "You can start after", at: OCT16 },
      action: null,
    });
  });

  it('"Retakes need my OK" on an open quiz: asking for a retake is a higher score', () => {
    const list = buildStudentToDo({
      assignments: [
        a("Check-in", { attemptsUsed: 1, retakesNeedUnlock: true, state: "awaiting_unlock" }),
      ],
    });
    expect(list.count).toBe(0);
    expect(list.higher[0]).toMatchObject({
      kind: "ask",
      why: "Want a higher score? Ask your teacher for attempt 2.",
      action: { kind: "ask", label: "Ask for a retake", attemptNumber: 2, primary: false },
    });
  });

  it("a reopened test shows its reopen as the deadline", () => {
    const list = buildStudentToDo({
      assignments: [
        a("Unit 2 LT1 Quiz", {
          closesAt: SEP25,
          reopenedUntil: OCT16,
          attemptsUsed: 1,
          state: "retake_available",
        }),
      ],
    });
    expect(list.higher[0].when).toEqual({ label: "Reopened for you until", at: OCT16 });
  });

  it("leaves done, closed and upcoming tests off the list", () => {
    const list = buildStudentToDo({
      assignments: [
        a("Done", { attemptsUsed: 1, state: "done" }),
        a("Closed", {
          status: "closed",
          closesAt: SEP25,
          attemptsUsed: 1,
          state: "closed",
          cycle: "done",
        }),
        a("Soon", { status: "scheduled", opensAt: OCT20, state: "upcoming" }),
      ],
    });
    expect([...list.todo, ...list.higher, ...list.waiting]).toEqual([]);
  });
  it("Hide scores on the teacher's panel: only the lines that show a percent drop out", () => {
    expect(showsScore("Correct 3 missed questions to raise your score from 40% to 80%.")).toBe(
      true
    );
    expect(showsScore("Best so far: 60%")).toBe(true);
    expect(showsScore("Correct 3 missed questions to unlock attempt 2.")).toBe(false);
    expect(showsScore("0 of 3 done")).toBe(false);
  });
});

describe("the Assessments tab", () => {
  it("groups by status: open (soonest due first), opens soon, closed newest first", () => {
    // Braeden's screen (Oct 8 2026): the closed Sep 25 quiz sorted above the one in progress.
    const s = assessmentsByStatus([
      violaLt1,
      a("Unit 2 Quiz: Carbohydrates", { state: "in_progress", closesAt: OCT20 }),
      a("Unit 1 Test", { status: "closed", closesAt: OCT10, state: "closed", attemptsUsed: 1 }),
      a("Lab safety", { state: "done", attemptsUsed: 1 }),
      a("Unit 2 Test", { closesAt: OCT16 }),
      a("Unit 3 Quiz", { status: "scheduled", opensAt: OCT20, state: "upcoming" }),
      a("Reopened quiz", {
        status: "open",
        closesAt: SEP25,
        reopenedUntil: OCT10,
        state: "retake_available",
      }),
      a("Paused after close", {
        status: "closed",
        closesAt: OCT10,
        state: "in_progress",
        paused: true,
      }),
    ]);
    expect(s.open.map((x) => x.title)).toEqual([
      "Paused after close",
      "Reopened quiz",
      "Unit 2 Test",
      "Unit 2 Quiz: Carbohydrates",
      "Lab safety",
    ]);
    expect(s.soon.map((x) => x.title)).toEqual(["Unit 3 Quiz"]);
    expect(s.closed.map((x) => x.title)).toEqual(["Unit 1 Test", "Unit 2 LT1 Quiz"]);
    expect(closedCorrectionsCount(s.closed)).toBe(1);
  });

  it("reads the tab from ?tab=, Assessments otherwise", () => {
    expect(homeTab("practice")).toBe("practice");
    expect(homeTab(["results", "practice"])).toBe("results");
    expect(homeTab("grades")).toBe("assessments");
    expect(homeTab(undefined)).toBe("assessments");
  });
});
