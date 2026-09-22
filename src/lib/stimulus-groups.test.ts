import { describe, expect, it } from "vitest";
import { groupByStimulus, orderWithGroups, type StimulusInfo } from "./stimulus-groups";

const s = (id: string): StimulusInfo => ({
  id,
  kind: "text",
  title: id,
  content: null,
  mediaUrl: null,
});
const q = (id: string, stim: StimulusInfo | null) => ({ id, stimulus: stim });

describe("groupByStimulus", () => {
  it("keeps questions sharing a stimulus contiguous, in first-appearance order", () => {
    const rows = [
      q("a", null),
      q("b", s("G")),
      q("c", null),
      q("d", s("G")),
      q("e", s("H")),
      q("f", s("G")),
    ];
    const groups = groupByStimulus(rows);
    expect(groups.map((g) => [g.stimulus?.id ?? null, g.questions.map((x) => x.id)])).toEqual([
      [null, ["a"]],
      ["G", ["b", "d", "f"]],
      [null, ["c"]],
      ["H", ["e"]],
    ]);
    expect(orderWithGroups(rows).map((x) => x.id)).toEqual(["a", "b", "d", "f", "c", "e"]);
  });

  it("renders each stimulus once even when its questions are interleaved", () => {
    const rows = [q("1", s("G")), q("2", s("H")), q("3", s("G")), q("4", s("H"))];
    const groups = groupByStimulus(rows);
    expect(groups).toHaveLength(2);
    expect(groups.filter((g) => g.stimulus?.id === "G")).toHaveLength(1);
  });
});
