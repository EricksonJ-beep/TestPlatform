/**
 * Bank health (relearning revamp "Teacher side"): counts per target by band and type, flagged
 * when a band can't fill a deal (short) or holds under three deals' worth (thin).
 */
import { describe, expect, it } from "vitest";
import {
  bandStatus,
  bandSummary,
  bankHealth,
  healthFlags,
  type HealthQuestion,
} from "./bank-health";

const targets = [
  { id: "lt1", code: "U3.LT1", title: "Formulas" },
  { id: "lt2", code: "U3.LT2", title: "Ionic or covalent" },
  { id: "lt3", code: "U3.LT3", title: "Names" },
];
const q = (
  difficulty: number,
  targetIds: string[],
  over: Partial<HealthQuestion> = {}
): HealthQuestion => ({ difficulty, type: "multiple_choice", grading: "auto", targetIds, ...over });
const many = (n: number, difficulty: number, targetIds: string[], over?: Partial<HealthQuestion>) =>
  Array.from({ length: n }, () => q(difficulty, targetIds, over));

describe("bandStatus", () => {
  it("short below one deal, thin below three, ok from there", () => {
    expect(bandStatus(2, "easy")).toBe("short");
    expect(bandStatus(3, "easy")).toBe("thin");
    expect(bandStatus(9, "easy")).toBe("ok");
    // Medium's deal is 4 (a 10-question practice set draws 4 medium).
    expect(bandStatus(11, "medium")).toBe("thin");
    expect(bandStatus(12, "medium")).toBe("ok");
  });
});

describe("bankHealth", () => {
  it("a full 100-question bank: 45 · 30 · 25 on one target, all ok", () => {
    const h = bankHealth(
      [...many(45, 1, ["lt1"]), ...many(30, 3, ["lt1"]), ...many(25, 5, ["lt1"])],
      targets
    );
    expect(h.targets).toHaveLength(1);
    expect(h.targets[0]).toMatchObject({
      code: "U3.LT1",
      total: 100,
      bands: { easy: 45, medium: 30, hard: 25 },
      worst: "ok",
    });
    expect(h.worst).toBe("ok");
    expect(bandSummary(h)).toBe("45 easy · 30 medium · 25 hard");
    expect(healthFlags(h)).toEqual([]);
  });

  it("counts only what the dealer can draw, per target, with types most first", () => {
    const h = bankHealth(
      [
        ...many(10, 2, ["lt2"]),
        ...many(2, 2, ["lt2"], { type: "numeric" }),
        ...many(12, 3, ["lt2"]),
        ...many(1, 4, ["lt2"]),
        // Tagged to two targets: counts for both.
        ...many(3, 1, ["lt2", "lt3"], { type: "true_false" }),
        // Never dealt: teacher-graded, a short answer, no target, another course's target.
        q(1, ["lt2"], { grading: "manual" }),
        q(1, ["lt2"], { type: "short_answer" }),
        q(1, []),
        q(1, ["elsewhere"]),
      ],
      targets
    );
    expect(h.targets.map((t) => t.code)).toEqual(["U3.LT2", "U3.LT3"]);
    const lt2 = h.targets[0];
    expect(lt2.bands).toEqual({ easy: 15, medium: 12, hard: 1 });
    expect(lt2.status).toEqual({ easy: "ok", medium: "ok", hard: "short" });
    expect(lt2.types).toEqual([
      { type: "multiple_choice", count: 23 },
      { type: "true_false", count: 3 },
      { type: "numeric", count: 2 },
    ]);
    expect(h.targets[1]).toMatchObject({ bands: { easy: 3, medium: 0, hard: 0 }, worst: "short" });
    expect(h).toMatchObject({ usable: 28, notAutoGraded: 2, untagged: 2, worst: "short" });
    expect(bandSummary(h)).toBe("2 targets · 28 questions");
    expect(healthFlags(h)).toEqual([
      { status: "short", text: "U3.LT2: 1 hard (can't fill a deal)" },
      { status: "short", text: "U3.LT3: 0 medium, 0 hard (can't fill a deal)" },
      { status: "thin", text: "U3.LT3: 3 easy (thin)" },
    ]);
  });

  it("a bank with nothing the dealer can use says so", () => {
    const h = bankHealth([q(1, []), q(2, ["lt1"], { grading: "manual" })], targets);
    expect(h).toMatchObject({ targets: [], usable: 0, worst: "short" });
    expect(bandSummary(h)).toBeNull();
    expect(healthFlags(h)[0].text).toMatch(/practice checks can't use this bank/);
  });
});
