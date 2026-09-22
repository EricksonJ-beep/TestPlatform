import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvRecords } from "@/lib/csv";
import {
  missingHeaders,
  parseQuestionRecord,
  parseQuestionRecords,
  splitTargetName,
} from "./question-csv";

const base = {
  course: "Anatomy & Physiology",
  learning_target: "LT1 Blood composition",
  type: "multiple_choice",
  stem: "Plasma makes up approximately what percent of blood volume?",
  option_a: "15",
  option_b: "35",
  option_c: "55",
  option_d: "75",
  correct: "c",
};

describe("per-type rules", () => {
  it("multiple_choice: single letter that names a provided option", () => {
    const row = parseQuestionRecord(base, 2);
    expect(row.status).toBe("ok");
    expect(row.options.map((o) => [o.letter, o.isCorrect])).toEqual([
      ["a", false],
      ["b", false],
      ["c", true],
      ["d", false],
    ]);
    expect(parseQuestionRecord({ ...base, correct: "e" }, 2).issues[0].message).toMatch(
      /option_e is blank/
    );
    expect(parseQuestionRecord({ ...base, correct: "a,b" }, 2).status).toBe("error");
    expect(
      parseQuestionRecord({ ...base, option_b: "", option_c: "", option_d: "", correct: "a" }, 2)
        .status
    ).toBe("error");
  });

  it("multiple_select: comma letters", () => {
    const row = parseQuestionRecord({ ...base, type: "multiple_select", correct: "a,c,d" }, 2);
    expect(row.status).toBe("ok");
    expect(row.options.filter((o) => o.isCorrect).map((o) => o.letter)).toEqual(["a", "c", "d"]);
    expect(
      parseQuestionRecord({ ...base, type: "multiple_select", correct: "a,z" }, 2).status
    ).toBe("error");
  });

  it("true_false: true/false, options ignored with a warning", () => {
    const row = parseQuestionRecord(
      {
        ...base,
        type: "true_false",
        correct: "TRUE",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
      },
      2
    );
    expect(row.status).toBe("ok");
    expect(row.options.map((o) => [o.content, o.isCorrect])).toEqual([
      ["True", true],
      ["False", false],
    ]);
    expect(parseQuestionRecord({ ...base, type: "true_false", correct: "yes" }, 2).status).toBe(
      "error"
    );
    expect(parseQuestionRecord({ ...base, type: "true_false", correct: "false" }, 2).status).toBe(
      "warning"
    );
  });

  it("fill_blank: accepted answers split on |, case-insensitive; warns without ___", () => {
    const row = parseQuestionRecord(
      {
        ...base,
        type: "fill_blank",
        stem: "Red blood cells are also called ___.",
        correct: "erythrocytes|erythrocyte",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
      },
      2
    );
    expect(row.status).toBe("ok");
    expect(row.gradingConfig).toEqual({
      acceptedAnswers: ["erythrocytes", "erythrocyte"],
      caseSensitive: false,
    });
    expect(
      parseQuestionRecord(
        {
          ...base,
          type: "fill_blank",
          correct: "x",
          option_a: "",
          option_b: "",
          option_c: "",
          option_d: "",
        },
        2
      ).status
    ).toBe("warning");
  });

  it("short_answer: defaults to manual grading; keywords optional", () => {
    const row = parseQuestionRecord(
      {
        ...base,
        type: "short_answer",
        correct: "thicker|pressure",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
      },
      2
    );
    expect(row.grading).toBe("manual");
    expect(row.gradingConfig).toEqual({ keywords: ["thicker", "pressure"], minMatches: 1 });
    const auto = parseQuestionRecord(
      {
        ...base,
        type: "short_answer",
        correct: "x",
        grading: "auto",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
      },
      2
    );
    expect(auto.grading).toBe("auto");
  });

  it("extended_response: no correct needed, grading forced manual", () => {
    const row = parseQuestionRecord(
      {
        ...base,
        type: "extended_response",
        correct: "",
        grading: "auto",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
      },
      2
    );
    expect(row.status).toBe("ok");
    expect(row.grading).toBe("manual");
  });

  it("numeric: exact, abs, percent, range, unit", () => {
    const n = (extra: Record<string, string>) =>
      parseQuestionRecord(
        {
          ...base,
          type: "numeric",
          option_a: "",
          option_b: "",
          option_c: "",
          option_d: "",
          ...extra,
        },
        2
      );
    expect(n({ correct: "9.8" }).gradingConfig).toEqual({ mode: "exact", unit: null, answer: 9.8 });
    expect(
      n({ correct: "9.8", tolerance: "0.2", tolerance_mode: "abs", unit: "m/s^2" }).gradingConfig
    ).toEqual({ mode: "tolerance", unit: "m/s^2", answer: 9.8, tolerance: 0.2 });
    expect(n({ correct: "100", tolerance: "5", tolerance_mode: "percent" }).gradingConfig).toEqual({
      mode: "percent_tolerance",
      unit: null,
      answer: 100,
      percent: 5,
    });
    expect(n({ correct: "9.5-10.5", tolerance_mode: "range" }).gradingConfig).toEqual({
      mode: "range",
      unit: null,
      min: 9.5,
      max: 10.5,
    });
    expect(n({ correct: "abc" }).status).toBe("error");
    expect(n({ correct: "5", tolerance_mode: "abs" }).status).toBe("error");
    expect(n({ correct: "5", tolerance: "1" }).status).toBe("warning");
  });

  it("ordering: correct is a permutation of the provided letters", () => {
    const row = parseQuestionRecord({ ...base, type: "ordering", correct: "c,a,b,d" }, 2);
    expect(row.status).toBe("ok");
    expect(row.options.map((o) => [o.letter, o.correctPosition])).toEqual([
      ["a", 2],
      ["b", 3],
      ["c", 1],
      ["d", 4],
    ]);
    expect(parseQuestionRecord({ ...base, type: "ordering", correct: "c,a,b" }, 2).status).toBe(
      "error"
    );
    expect(parseQuestionRecord({ ...base, type: "ordering", correct: "c,a,b,d,d" }, 2).status).toBe(
      "error"
    );
  });

  it("matching: pairs split on ' :: '", () => {
    const row = parseQuestionRecord(
      {
        ...base,
        type: "matching",
        correct: "",
        option_a: "Atrium :: receives blood",
        option_b: "Ventricle :: pumps blood",
        option_c: "",
        option_d: "",
      },
      2
    );
    expect(row.status).toBe("ok");
    expect(row.options.map((o) => [o.content, o.matchText])).toEqual([
      ["Atrium", "receives blood"],
      ["Ventricle", "pumps blood"],
    ]);
    expect(
      parseQuestionRecord(
        {
          ...base,
          type: "matching",
          correct: "",
          option_a: "Atrium receives blood",
          option_b: "Ventricle :: pumps blood",
          option_c: "",
          option_d: "",
        },
        2
      ).status
    ).toBe("error");
  });
});

describe("shared rules", () => {
  it("required fields, unknown type, defaults, tags, media", () => {
    const missing = parseQuestionRecord({ ...base, course: "", stem: "", learning_target: "" }, 2);
    expect(missing.issues.map((i) => i.field)).toEqual(
      expect.arrayContaining(["course", "learning_target", "stem"])
    );
    expect(parseQuestionRecord({ ...base, type: "essay" }, 2).status).toBe("error");

    const row = parseQuestionRecord(
      {
        ...base,
        points: "",
        difficulty: "9",
        bloom: "Analyze",
        grading: "",
        tags: "blood, plasma,blood ,",
        image_url: "graph.png",
        video_url: "https://youtu.be/x",
      },
      2
    );
    expect(row.points).toBe(1);
    expect(row.difficulty).toBe(3);
    expect(row.bloom).toBe("analyze");
    expect(row.grading).toBe("auto");
    expect(row.tags).toEqual(["blood", "plasma"]);
    expect(row.imageUrl).toBeNull();
    expect(row.videoUrl).toBe("https://youtu.be/x");
    expect(row.status).toBe("warning");
    expect(row.issues.map((i) => i.field)).toEqual(
      expect.arrayContaining(["difficulty", "image_url"])
    );
  });

  it("stimulus_ref groups: first row carries content, later rows inherit, differing content warns", () => {
    const rows = parseQuestionRecords([
      { ...base, stimulus_ref: "tomato-graph", stimulus_text: "Growth over 10 days" },
      { ...base, stimulus_ref: "tomato-graph" },
      { ...base, stimulus_ref: "tomato-graph", stimulus_text: "Different" },
      { ...base, stimulus_ref: "empty-ref" },
    ]);
    expect(rows[1].stimulus?.text).toBe("Growth over 10 days");
    expect(rows[2].status).toBe("warning");
    expect(rows[2].stimulus?.text).toBe("Growth over 10 days");
    expect(rows[3].issues[0].message).toMatch(/has no text, image, or video/);
  });

  it("duplicate external_id within the file is an error on the later row", () => {
    const rows = parseQuestionRecords([
      { ...base, external_id: "A-1" },
      { ...base, external_id: "a-1" },
    ]);
    expect(rows[0].status).toBe("ok");
    expect(rows[1].status).toBe("error");
  });

  it("missingHeaders and splitTargetName", () => {
    expect(missingHeaders(["course", "type", "stem"])).toEqual(["learning_target", "correct"]);
    expect(splitTargetName("LT1 Blood composition", 9)).toEqual({
      code: "LT1",
      title: "Blood composition",
    });
    expect(splitTargetName("LT 4: Active transport", 9)).toEqual({
      code: "LT4",
      title: "Active transport",
    });
    expect(splitTargetName("Cell transport", 9)).toEqual({ code: "LT9", title: "Cell transport" });
  });
});

describe("the shipped template", () => {
  it("parses every row of question_import_template.csv without errors", () => {
    const { headers, records } = parseCsvRecords(
      readFileSync("question_import_template.csv", "utf8")
    );
    expect(missingHeaders(headers)).toEqual([]);
    const rows = parseQuestionRecords(records);
    const errors = rows.filter((r) => r.status === "error");
    expect(errors.map((r) => [r.line, r.issues])).toEqual([]);
    expect(rows.length).toBeGreaterThan(5);
    expect(new Set(rows.map((r) => r.type)).size).toBeGreaterThan(4);
  });
});
