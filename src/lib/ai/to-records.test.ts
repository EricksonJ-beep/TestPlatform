import { describe, expect, it } from "vitest";
import type { ExtractedQuestion } from "./extract-questions";
import { extractedToRecords, matchTarget } from "./to-records";

const targets = [
  { code: "LT1", title: "Measure" },
  { code: "LT4", title: "Density" },
];
const q = (over: Partial<ExtractedQuestion>): ExtractedQuestion => ({
  type: "multiple_choice",
  stem: "Which is a base unit?",
  options: ["meter", "liter", "newton", "joule"],
  correct: "a",
  explanation: null,
  learning_target: null,
  points: null,
  unit: null,
  ...over,
});

describe("matchTarget", () => {
  it("matches printed labels to course codes and never invents one", () => {
    expect(matchTarget("LT4", targets)?.code).toBe("LT4");
    expect(matchTarget("lt 4", targets)?.code).toBe("LT4");
    expect(matchTarget("Learning Target 1", targets)?.code).toBe("LT1");
    expect(matchTarget("LT4: Density", targets)?.code).toBe("LT4");
    expect(matchTarget("density", targets)?.code).toBe("LT4");
    expect(matchTarget("LT7", targets)).toBeNull();
    expect(matchTarget(null, targets)).toBeNull();
  });
});

describe("extractedToRecords", () => {
  const ctx = { courseName: "Physical Science", targets, fileName: "Unit 1 Test (2025).pdf" };
  it("maps each type to the Appendix A row the CSV wizard already understands", () => {
    const { headers, records } = extractedToRecords(
      [
        q({ learning_target: "LT4", explanation: "Base units are SI.", points: 2 }),
        q({ type: "multiple_select", correct: "A, C", learning_target: "LT9" }),
        q({ type: "true_false", options: ["True", "False"], correct: "b" }),
        q({
          type: "numeric",
          options: [],
          correct: "8,700 cm",
          unit: "cm",
          learning_target: "lt1",
        }),
        q({ type: "fill_blank", options: [], correct: "ribose|Ribose " }),
        q({ type: "extended_response", options: [], correct: "" }),
        q({ type: "matching", options: ["Na=>sodium", "K => potassium"], correct: "" }),
        q({ type: "ordering", options: ["Solid", "Liquid", "Gas"], correct: "" }),
      ],
      ctx
    );
    expect(headers).toContain("unit_2");
    expect(records[0]).toMatchObject({
      external_id: "Unit-1-Test-2025-01",
      course: "Physical Science",
      learning_target: "LT4 Density",
      type: "multiple_choice",
      option_a: "meter",
      option_d: "joule",
      correct: "a",
      explanation: "Base units are SI.",
      points: "2",
    });
    expect(records[1]).toMatchObject({ correct: "a,c", learning_target: "" });
    expect(records[2]).toMatchObject({ correct: "false", option_a: "" });
    expect(records[3]).toMatchObject({
      correct: "8700",
      unit_2: "cm",
      unit: "",
      learning_target: "LT1 Measure",
    });
    expect(records[4]).toMatchObject({ correct: "ribose | Ribose" });
    expect(records[5]).toMatchObject({ correct: "", grading: "manual" });
    expect(records[6]).toMatchObject({ option_a: "Na :: sodium", option_b: "K :: potassium" });
    expect(records[7]).toMatchObject({ option_c: "Gas", correct: "a,b,c" });
    expect(records).toHaveLength(8);
  });
});
