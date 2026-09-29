import { describe, expect, it } from "vitest";
import { classAverages, heatBand } from "./mastery";

describe("heatBand", () => {
  it("puts the boundaries where Jon asked", () => {
    expect(heatBand(100)).toBe("full");
    expect(heatBand(99.9)).toBe("high");
    expect(heatBand(80)).toBe("high");
    expect(heatBand(79.9)).toBe("mid");
    expect(heatBand(60)).toBe("mid");
    expect(heatBand(59.9)).toBe("low");
    expect(heatBand(0)).toBe("low");
  });
});

describe("classAverages", () => {
  it("averages only the students who have a score, per target and overall", () => {
    const rows = [
      { percents: { lt1: 100, lt2: 50 }, overall: 75 },
      { percents: { lt1: 80 }, overall: 80 },
      { percents: {}, overall: null },
    ];
    const avg = classAverages(["lt1", "lt2", "lt3"], rows);
    expect(avg.byTarget.lt1).toEqual({ average: 90, students: 2 });
    expect(avg.byTarget.lt2).toEqual({ average: 50, students: 1 });
    expect(avg.byTarget.lt3).toBeNull();
    expect(avg.overall).toEqual({ average: 77.5, students: 2 });
  });
});
