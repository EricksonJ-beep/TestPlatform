import { describe, expect, it } from "vitest";
import type { ToDoRow } from "./student-home";
import {
  classChip,
  firstUnanswered,
  fixCount,
  homeHeadline,
  nowButtonLabel,
  nowStatus,
  retakeNote,
} from "./student-home-view";

const row = (r: Partial<ToDoRow>): ToDoRow => ({
  key: "k",
  group: "todo",
  kind: "start",
  assignmentId: "a",
  title: "Cell Energy Quiz",
  type: "formative",
  className: "Biology",
  why: null,
  whyWithoutScores: null,
  note: null,
  progress: null,
  checklist: [],
  when: null,
  minutes: null,
  needsCode: false,
  action: { kind: "link", label: "Start", href: "/student/assignments/a", primary: true },
  ...r,
});

describe("homeHeadline", () => {
  it("names the one thing first, then nothing due, then all caught up", () => {
    expect(homeHeadline("Ava", { now: [row({})], fix: [], level: [] })).toBe(
      "Hi, Ava. One thing first."
    );
    expect(homeHeadline("Ava", { now: [], fix: [row({})], level: [] })).toBe(
      "Hi, Ava. Nothing due right now."
    );
    expect(homeHeadline("Ava", { now: [], fix: [], level: [row({})] })).toBe(
      "Hi, Ava. Nothing due right now."
    );
    expect(homeHeadline("Ava", { now: [], fix: [], level: [] })).toBe(
      "Hi, Ava. You're all caught up."
    );
  });
});

describe("classChip", () => {
  it("reads course, hour, teacher", () => {
    expect(
      classChip({ name: "Bio P3", period: "3", courseName: "Biology", teacherLastName: "Erickson" })
    ).toBe("Biology, 3rd hour, Erickson");
  });
  it("falls back to the class name without a course or a period", () => {
    expect(
      classChip({ name: "Biology A", period: null, courseName: null, teacherLastName: "Erickson" })
    ).toBe("Biology A, Erickson");
    expect(
      classChip({ name: "Biology", period: null, courseName: "Biology", teacherLastName: "Lee" })
    ).toBe("Biology, Lee");
  });
});

describe("the panel's words", () => {
  it("labels the button by kind and type", () => {
    expect(nowButtonLabel(row({ kind: "start", type: "formative" }))).toBe("Start the quiz");
    expect(nowButtonLabel(row({ kind: "start", type: "summative" }))).toBe("Start the test");
    const going = row({
      kind: "keep_going",
      type: "summative",
      action: { kind: "link", label: "Continue", href: "/x", primary: true },
    });
    expect(nowButtonLabel(going)).toBe("Continue the test");
    expect(
      nowButtonLabel({
        ...going,
        action: { kind: "link", label: "Finish in class", href: "/x", primary: true },
      })
    ).toBe("Finish in class");
  });

  it("picks up at the first unanswered question, not answered + 1", () => {
    // Questions 1, 2 and 4 are answered; 3 was skipped.
    const answers = [true, true, false, true, false];
    expect(firstUnanswered(answers)).toBe(3);
    const going = row({
      kind: "keep_going",
      action: { kind: "link", label: "Continue", href: "/x", primary: true },
    });
    expect(nowStatus(going, answers)).toBe("You started this. Pick up at question 3.");
    expect(nowStatus(going, null)).toBe("You started this. Pick up where you left off.");
    expect(nowStatus(going, [true, true])).toBe("You started this. Pick up where you left off.");
  });

  it("keeps a paused test's own words", () => {
    const paused = row({
      kind: "keep_going",
      why: "Paused. Finish it in class.",
      action: { kind: "link", label: "Finish in class", href: "/x", primary: true },
    });
    expect(nowStatus(paused, [true, false])).toBe("Paused. Finish it in class.");
  });

  it("says what a test not started already knows", () => {
    expect(nowStatus(row({ minutes: 45, needsCode: true }), null)).toBe(
      "45 minutes. You need a code from your teacher."
    );
    expect(nowStatus(row({ why: "Open now." }), null)).toBe("Open now.");
    expect(nowStatus(row({}), null)).toBe("Ready when you are.");
  });
});

describe("fixCount", () => {
  it("counts sets of corrections, or things to fix when the section is mixed", () => {
    expect(fixCount([row({ kind: "corrections" })])).toBe("1 set of corrections");
    expect(fixCount([row({ kind: "corrections" }), row({ kind: "sent_back" })])).toBe(
      "2 sets of corrections"
    );
    expect(fixCount([row({ kind: "corrections" }), row({ kind: "practice" })])).toBe("2 to fix");
  });
});

describe("retakeNote", () => {
  const tail =
    "Ask your teacher: if they say yes, it opens just for you until the end of the next school day.";
  it("reads a closed test as its type, closed", () => {
    const why = `This test is closed. Want a higher score? ${tail}`;
    expect(retakeNote(row({ kind: "ask", type: "summative", why }))).toBe("Summative, closed");
    expect(retakeNote(row({ kind: "ask", type: "formative", why }))).toBe("Formative, closed");
  });
  it("keeps what is specific to the row and drops what the caption says", () => {
    expect(
      retakeNote(
        row({
          kind: "ask",
          why: `This test is closed, and you still need to retake U3.LT1. ${tail}`,
        })
      )
    ).toBe("This test is closed, and you still need to retake U3.LT1.");
    expect(
      retakeNote(
        row({
          kind: "ask",
          why: "The retake window for this quiz has ended. Want a higher score? Ask your teacher: if they say yes, you can retake it until the end of the next school day.",
        })
      )
    ).toBe("The retake window for this quiz has ended.");
  });
  it("leaves other rows' sentences alone, and a sent request to the row", () => {
    const practice =
      "Practice U2.LT1: score 80% on at least 5 questions before you can ask to retake (you scored 50%).";
    expect(retakeNote(row({ kind: "practice", why: practice }))).toBe(practice);
    expect(retakeNote(row({ kind: "retake_requested", why: "You asked…" }))).toBeNull();
  });
});
