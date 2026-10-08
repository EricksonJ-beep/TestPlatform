import { describe, expect, it } from "vitest";
import type { StudentAssignment } from "@/lib/queries/assignments";
import { sectionAssessments, sectionOf } from "./student-home";

const a = (
  title: string,
  state: StudentAssignment["state"],
  closesAt: string | null
): StudentAssignment =>
  ({
    id: title,
    title,
    state,
    closesAt: closesAt ? new Date(closesAt) : null,
  }) as StudentAssignment;

describe("student home sections", () => {
  it("files every card state into a section", () => {
    expect(sectionOf("in_progress")).toBe("needs_you");
    expect(sectionOf("not_started")).toBe("needs_you");
    expect(sectionOf("corrections_needed")).toBe("needs_you");
    expect(sectionOf("corrections_returned")).toBe("needs_you");
    expect(sectionOf("retake_required")).toBe("needs_you");
    expect(sectionOf("retake_available")).toBe("needs_you");
    expect(sectionOf("relearning")).toBe("needs_you");
    expect(sectionOf("corrections_submitted")).toBe("waiting");
    expect(sectionOf("awaiting_unlock")).toBe("waiting");
    expect(sectionOf("upcoming")).toBe("waiting");
    expect(sectionOf("done")).toBe("waiting");
    expect(sectionOf("closed")).toBe("closed");
  });

  it("puts active work first, soonest due first, and closed newest first", () => {
    // Braeden's screen (Oct 8 2026): the closed Sep 25 quiz sorted above the one in progress.
    const list = [
      a("Unit 2 LT1 Quiz", "closed", "2026-09-25T15:50:00Z"),
      a("Unit 2 Quiz: Carbohydrates", "in_progress", "2026-10-10T16:05:00Z"),
      a("Unit 1 Test", "closed", "2026-09-12T15:50:00Z"),
      a("Lab safety", "done", null),
      a("Unit 2 Test", "not_started", "2026-10-09T16:05:00Z"),
      a("Element quiz", "corrections_submitted", "2026-10-11T16:05:00Z"),
    ];
    const s = sectionAssessments(list);
    expect(s.needs_you.map((x) => x.title)).toEqual(["Unit 2 Test", "Unit 2 Quiz: Carbohydrates"]);
    expect(s.waiting.map((x) => x.title)).toEqual(["Element quiz", "Lab safety"]);
    expect(s.closed.map((x) => x.title)).toEqual(["Unit 2 LT1 Quiz", "Unit 1 Test"]);
  });
});
