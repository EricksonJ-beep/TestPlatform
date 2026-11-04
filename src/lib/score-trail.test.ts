/**
 * The score trail (docs/relearning-revamp-plan.md G1, ticket R7): steps in time order, repeats kept
 * once, named by how the score came about, and attempt 1 → now where there's no history yet.
 */
import { describe, expect, it } from "vitest";
import { scoreTrail, trailDetail, trailText } from "./score-trail";

const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T18:00:00Z`);

describe("scoreTrail", () => {
  it("names each rise by how it came about, and keeps a repeat once", () => {
    const steps = scoreTrail({
      history: [
        { percent: 95, basis: "retake", at: at(6) },
        { percent: 40, basis: "best_attempt", at: at(3) },
        { percent: 80, basis: "relearning_path", at: at(4) },
        { percent: 80, basis: "relearning_path", at: at(5) },
      ],
    });
    expect(steps.map((s) => [s.percent, s.label])).toEqual([
      [40, "attempt 1"],
      [80, "relearning path"],
      [95, "retake"],
    ]);
    expect(trailText(steps)).toBe("40 → 80 → 95");
    expect(trailDetail(steps)).toBe(
      "40% attempt 1, Nov 3 · 80% relearning path, Nov 4 · 95% retake, Nov 6"
    );
  });

  it("calls corrections raises corrections, a summative's rise a retake, and a drop a regrade", () => {
    const steps = scoreTrail({
      history: [
        { percent: 85, basis: "best_attempt", at: at(3) },
        { percent: 90, basis: "corrections_to_90", at: at(4) },
        { percent: 70, basis: "per_target", at: at(5) },
        { percent: 75, basis: "per_target", at: at(6) },
      ],
    });
    expect(steps.map((s) => s.label)).toEqual(["attempt 1", "corrections", "regrade", "retake"]);
  });

  it("falls back to attempt 1 and the score now when there's no history", () => {
    expect(
      scoreTrail({
        history: [],
        first: { percent: 40, at: at(3) },
        now: { percent: 80, basis: "corrections_to_threshold", at: at(4) },
      }).map((s) => [s.percent, s.label])
    ).toEqual([
      [40, "attempt 1"],
      [80, "corrections"],
    ]);
    expect(
      scoreTrail({
        history: [],
        first: { percent: 80, at: at(3) },
        now: { percent: 80, basis: "best_attempt", at: at(3) },
      })
    ).toHaveLength(1);
  });
});
