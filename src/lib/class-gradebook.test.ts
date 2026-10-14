import { describe, expect, it } from "vitest";
import type { CardState } from "./card-state";
import {
  CELL_ORDER,
  cellTag,
  columnFooter,
  relearningNeeds,
  tagLabel,
  type CellInput,
} from "./class-gradebook";
import type { RetakePlan, RetakeTarget } from "./retakes";

const card = (c: Partial<CardState>): CardState => ({
  status: "open",
  state: "done",
  cycle: "done",
  capped: true,
  rule: "gate",
  retakeBy: null,
  windowClosed: false,
  ...c,
});
const input = (i: Partial<CellInput>): CellInput => ({
  card: card({}),
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
const target = (id: string, gate: Partial<RetakeTarget["gate"]> = {}): RetakeTarget => ({
  id,
  code: id.toUpperCase(),
  title: id,
  percent: 50,
  required: true,
  optedIn: false,
  gate: { correctionsOk: true, activityOk: true, practiceOk: true, unlocked: true, ...gate },
});
const plan = (p: Partial<RetakePlan>): RetakePlan => ({
  required: [],
  optional: [],
  selected: [],
  locked: [],
  canStart: true,
  blocker: null,
  ...p,
});
const fmt = { time: (d: Date) => d.toISOString().slice(11, 16), date: () => "Oct 15" };
const label = (i: Partial<CellInput>) => tagLabel(cellTag(input(i)), fmt);

describe("cellTag precedence", () => {
  it("puts the teacher's move first, then testing now, then what the student owes", () => {
    const busy = input({
      card: card({ cycle: "corrections_needed" }),
      requested: true,
      toGrade: 2,
      correctionsToCheck: 1,
      corrections: { done: 3, needed: 8 },
    });
    expect(cellTag(busy)).toMatchObject({ kind: "request", group: "your_move", needsYou: true });
    expect(cellTag({ ...busy, requested: false }).kind).toBe("check_corrections");
    expect(cellTag({ ...busy, requested: false, correctionsToCheck: 0 })).toMatchObject({
      kind: "to_grade",
      tone: "coral",
    });
    expect(label({ toGrade: 2 })).toBe("To grade (2)");
    expect(
      label({ card: card({ cycle: "corrections_needed" }), corrections: { done: 3, needed: 8 } })
    ).toBe("Corrections needed 3/8");
    expect(CELL_ORDER.indexOf("asked")).toBe(0);
    expect(CELL_ORDER.at(-1)).toBe("done");
  });

  it("reads an open attempt as taking it, paused, or asked to finish (only asked counts)", () => {
    const live = { paused: false, asked: false, answered: 12, total: 30 };
    const inProgress = card({ state: "in_progress", cycle: null });
    expect(cellTag(input({ card: inProgress, live }))).toMatchObject({
      kind: "taking",
      tone: "brand",
      needsYou: false,
    });
    expect(label({ card: inProgress, live })).toBe("Taking it 12/30");
    expect(cellTag(input({ card: inProgress, live: { ...live, paused: true } })).kind).toBe(
      "paused"
    );
    expect(
      cellTag(input({ card: inProgress, live: { ...live, paused: true, asked: true } }))
    ).toMatchObject({ kind: "asked", needsYou: true });
    // Answers waiting from an earlier try still come before the live one.
    expect(cellTag(input({ card: inProgress, live, toGrade: 1 })).kind).toBe("to_grade");
    // Time ran out with nobody in it: never Taking it, and nothing for anyone to do now.
    expect(cellTag(input({ card: inProgress, live: { ...live, outOfTime: true } }))).toMatchObject({
      kind: "out_of_time",
      tone: "muted",
      needsYou: false,
    });
    expect(label({ card: inProgress, live: { ...live, outOfTime: true } })).toBe(
      "Time's up · not submitted"
    );
  });

  it("names Missing, Not started and Opens before any attempt", () => {
    const none = { attemptsUsed: 0 };
    expect(label({ ...none, card: card({ status: "closed", cycle: null }) })).toBe("Missing");
    expect(label({ ...none, card: card({ cycle: null }) })).toBe("Not started");
    expect(
      label({ ...none, card: card({ status: "scheduled", cycle: null }), opensAt: new Date() })
    ).toBe("Opens Oct 15");
  });

  it("keeps corrections on a closed test and marks the retake states closed, in grey", () => {
    const closed = { status: "closed" as const, state: "closed" as const };
    expect(
      cellTag(
        input({
          card: card({ ...closed, cycle: "corrections_needed" }),
          corrections: { done: 0, needed: 3 },
        })
      )
    ).toMatchObject({ kind: "corrections_needed", closed: false, tone: "warning" });
    const retake = {
      targets: [target("lt3"), target("lt4")],
      plan: plan({ required: ["lt3", "lt4"], selected: ["lt3", "lt4"] }),
    };
    const needed = input({ card: card({ ...closed, cycle: "retake_required" }), retake });
    expect(cellTag(needed)).toMatchObject({ kind: "retake_needed", closed: true, tone: "muted" });
    expect(tagLabel(cellTag(needed))).toBe("Retake needed (LT3, LT4) · closed");
    expect(tagLabel(cellTag({ ...needed, card: card({ cycle: "retake_required" }) }))).toBe(
      "Retake needed (LT3, LT4)"
    );
    // An optional retake can't start once closed: nothing is left to do.
    expect(label({ card: card({ ...closed, cycle: "retake_available" }) })).toBe("Done");
    // Awaiting the teacher's OK on a closed test: required targets still read Retake needed.
    expect(label({ card: card({ ...closed, cycle: "awaiting_unlock" }), retake })).toBe(
      "Retake needed (LT3, LT4) · closed"
    );
  });

  it("tells Ready (not asked) from a current request, and Unlocked from Can retake", () => {
    expect(cellTag(input({ card: card({ cycle: "awaiting_unlock" }) }))).toMatchObject({
      kind: "ready",
      tone: "coral_outline",
      needsYou: false,
    });
    expect(label({ card: card({ cycle: "awaiting_unlock" }), requested: true })).toBe(
      "Retake request"
    );
    expect(label({ card: card({ cycle: "retake_available" }) })).toBe("Can retake");
    const at = new Date("2026-10-14T14:15:00Z");
    expect(
      label({
        card: card({ cycle: "retake_available" }),
        unlockedBlocker: { reason: "wait", at },
      })
    ).toBe("Unlocked · after 14:15");
    expect(
      label({
        card: card({ cycle: "done" }),
        unlockedBlocker: { reason: "window_closed", at },
      })
    ).toBe("Unlocked · retake window closed");
  });

  it("lists what relearning still needs, and that corrections → 100% is the student's move", () => {
    const retake = {
      targets: [target("lt1", { activityOk: false }), target("lt2", { practiceOk: false })],
      plan: plan({ required: ["lt1", "lt2"], selected: ["lt1", "lt2"], locked: ["lt1", "lt2"] }),
    };
    expect(relearningNeeds(retake.targets, retake.plan)).toEqual(["activity", "practice"]);
    expect(label({ card: card({ cycle: "relearning" }), retake })).toBe(
      "Relearning (needs: activity, practice)"
    );
    expect(label({ card: card({ cycle: "relearning" }), retake, activitiesToCheck: 1 })).toBe(
      "Check off activity"
    );
    expect(cellTag(input({ card: card({ cycle: "corrections_to_full" }) }))).toMatchObject({
      kind: "corrections_to_full",
      group: "owes",
    });
    expect(label({ card: card({ cycle: "corrections_returned" }) })).toBe("Sent back");
    expect(label({ card: card({ cycle: "corrections_to_full" }) })).toBe("Corrections → 100%");
  });
});

describe("columnFooter", () => {
  const now = new Date(2026, 9, 14, 12); // a Wednesday
  it("counts done of enrolled, averages the counting scores, and folds in the tiers", () => {
    const finals = [
      { percent: 100, tier: 1, previousTier: 2, tierChangedAt: new Date(2026, 9, 13) },
      { percent: 50, tier: 2, previousTier: null, tierChangedAt: null },
      { percent: 60, tier: 2, previousTier: 1, tierChangedAt: new Date(2026, 9, 13) },
      { percent: 30, tier: 3, previousTier: 3, tierChangedAt: new Date(2026, 9, 1) },
    ];
    expect(columnFooter({ type: "summative", enrolled: 6, finals, now })).toEqual({
      done: 4,
      enrolled: 6,
      average: 60,
      tiers: { 1: 1, 2: 2, 3: 1 },
      movedUpThisWeek: 1,
    });
    expect(columnFooter({ type: "formative", enrolled: 6, finals: [], now })).toEqual({
      done: 0,
      enrolled: 6,
      average: null,
      tiers: null,
      movedUpThisWeek: 0,
    });
  });
});
