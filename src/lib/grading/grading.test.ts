import { describe, expect, it } from "vitest";
import {
  computeFinalScore,
  correctAnswerText,
  correctionsCapOn,
  formatPartialCredit,
  gradeResponse,
  parseNumericInput,
  parsePartialCredit,
  retakeTargets,
  scoreAttempt,
  tierFor,
} from "./index";
import type { GradableQuestion, ResponseRecord, ServedItem } from "./types";

const opt = (
  id: string,
  content: string,
  isCorrect = false,
  extra: Partial<GradableQuestion["options"][number]> = {}
) => ({ id, content, isCorrect, matchText: null, correctPosition: null, ...extra });
const q = (
  type: GradableQuestion["type"],
  over: Partial<GradableQuestion> = {}
): GradableQuestion => ({
  id: "q",
  type,
  points: 2,
  grading: "auto",
  gradingConfig: null,
  options: [],
  ...over,
});

describe("multiple choice / true-false", () => {
  const mc = q("multiple_choice", {
    options: [opt("a", "15"), opt("b", "55", true), opt("c", "75")],
  });
  it("full credit for the correct option, zero otherwise, zero when blank", () => {
    expect(gradeResponse(mc, { kind: "choice", optionId: "b" })).toMatchObject({
      pointsEarned: 2,
      isCorrect: true,
    });
    expect(gradeResponse(mc, { kind: "choice", optionId: "a" })).toMatchObject({
      pointsEarned: 0,
      isCorrect: false,
    });
    expect(gradeResponse(mc, null)).toMatchObject({
      pointsEarned: 0,
      isCorrect: false,
      note: "No answer.",
    });
    expect(gradeResponse(mc, { kind: "choice", optionId: "zzz" })).toMatchObject({
      pointsEarned: 0,
    });
  });
});

describe("multiple select", () => {
  const ms = q("multiple_select", {
    options: [
      opt("a", "RBC", true),
      opt("b", "Plasma"),
      opt("c", "WBC", true),
      opt("d", "Platelets", true),
    ],
  });
  it("all-or-nothing by default", () => {
    expect(gradeResponse(ms, { kind: "multi", optionIds: ["a", "c", "d"] })).toMatchObject({
      pointsEarned: 2,
      isCorrect: true,
    });
    expect(gradeResponse(ms, { kind: "multi", optionIds: ["a", "c"] })).toMatchObject({
      pointsEarned: 0,
      isCorrect: false,
    });
    expect(gradeResponse(ms, { kind: "multi", optionIds: ["a", "b", "c", "d"] })).toMatchObject({
      pointsEarned: 0,
    });
  });
  it("partial credit: correct picks earn, wrong picks cost, floor at zero", () => {
    const pc = { ...ms, gradingConfig: { partialCredit: true } };
    expect(gradeResponse(pc, { kind: "multi", optionIds: ["a", "c"] })).toMatchObject({
      pointsEarned: 1.33,
      isCorrect: false,
    });
    expect(gradeResponse(pc, { kind: "multi", optionIds: ["a", "b", "c", "d"] })).toMatchObject({
      pointsEarned: 1.33,
    });
    expect(gradeResponse(pc, { kind: "multi", optionIds: ["b"] })).toMatchObject({
      pointsEarned: 0,
    });
    expect(gradeResponse(pc, { kind: "multi", optionIds: ["a", "c", "d"] })).toMatchObject({
      pointsEarned: 2,
      isCorrect: true,
    });
  });
});

describe("fill in the blank", () => {
  const fb = q("fill_blank", {
    gradingConfig: { acceptedAnswers: ["erythrocytes", "erythrocyte"], caseSensitive: false },
  });
  it("accepts any listed answer, ignoring case and extra spaces", () => {
    expect(gradeResponse(fb, { kind: "text", text: "  Erythrocyte " })).toMatchObject({
      isCorrect: true,
    });
    expect(gradeResponse(fb, { kind: "text", text: "red blood cell" })).toMatchObject({
      isCorrect: false,
    });
    expect(
      gradeResponse(
        { ...fb, gradingConfig: { acceptedAnswers: ["ATP"], caseSensitive: true } },
        { kind: "text", text: "atp" }
      )
    ).toMatchObject({ isCorrect: false });
  });

  it("chemical formulas: exact capitals when case-sensitive; subscript digits read as plain digits", () => {
    const formula = { ...fb, gradingConfig: { acceptedAnswers: ["CaCl2"], caseSensitive: true } };
    expect(gradeResponse(formula, { kind: "text", text: "CaCl2" }).isCorrect).toBe(true);
    expect(gradeResponse(formula, { kind: "text", text: "CaCl\u2082" }).isCorrect).toBe(true);
    expect(gradeResponse(formula, { kind: "text", text: "CACL2" }).isCorrect).toBe(false);
    const co = { ...fb, gradingConfig: { acceptedAnswers: ["CO"], caseSensitive: true } };
    expect(gradeResponse(co, { kind: "text", text: "Co" }).isCorrect).toBe(false);
  });
});

describe("short answer and extended response", () => {
  it("keyword auto-grade needs minMatches; manual or keyword-less goes to the human queue", () => {
    const sa = q("short_answer", {
      gradingConfig: { keywords: ["thicker", "pressure"], minMatches: 2 },
    });
    expect(
      gradeResponse(sa, {
        kind: "text",
        text: "The wall is thicker because it pumps at higher pressure.",
      })
    ).toMatchObject({ isCorrect: true, pointsEarned: 2 });
    expect(gradeResponse(sa, { kind: "text", text: "It is thicker." })).toMatchObject({
      isCorrect: false,
      pointsEarned: 0,
    });
    expect(
      gradeResponse({ ...sa, grading: "manual" }, { kind: "text", text: "anything" })
    ).toMatchObject({ isCorrect: null, pointsEarned: null });
    expect(
      gradeResponse(q("short_answer", { gradingConfig: { keywords: [] } }), {
        kind: "text",
        text: "x",
      })
    ).toMatchObject({ pointsEarned: null });
  });
  it("extended response is pending unless blank", () => {
    const er = q("extended_response", { grading: "manual" });
    expect(gradeResponse(er, { kind: "text", text: "A paragraph." })).toMatchObject({
      pointsEarned: null,
      isCorrect: null,
    });
    expect(gradeResponse(er, { kind: "text", text: "   " })).toMatchObject({
      pointsEarned: 0,
      isCorrect: false,
    });
  });
});

describe("numeric", () => {
  it("parses numbers with units, commas, fractions, and exponents", () => {
    expect(parseNumericInput("15 m/s")).toEqual({ value: 15, unit: "m/s" });
    expect(parseNumericInput("15m/s")).toEqual({ value: 15, unit: "m/s" });
    expect(parseNumericInput("1.01 x 10^5")).toEqual({ value: 101000, unit: "" });
    expect(parseNumericInput("9.8×10^-3 g")).toEqual({ value: 0.0098, unit: "g" });
    expect(parseNumericInput("3.1 X 10^(-4)")).toEqual({ value: 0.00031, unit: "" });
    expect(parseNumericInput("6.02*10^23")?.value).toBeCloseTo(6.02e23, -20);
    expect(parseNumericInput("5 x 2")).toEqual({ value: 5, unit: "x 2" });
    expect(parseNumericInput("\u22124")).toEqual({ value: -4, unit: "" });
    expect(parseNumericInput("6.3 x 10^\u22124")).toEqual({ value: 0.00063, unit: "" });
    expect(parseNumericInput("1,500")).toEqual({ value: 1500, unit: "" });
    expect(parseNumericInput("3/4")).toEqual({ value: 0.75, unit: "" });
    expect(parseNumericInput("-2.5e3 J")).toEqual({ value: -2500, unit: "J" });
    expect(parseNumericInput("abc")).toBeNull();
  });
  it("unit-aware: with a unit set, 15 m/s, 15m/s and 15 all match; a different unit does not", () => {
    const n = q("numeric", { gradingConfig: { mode: "exact", answer: 15, unit: "m/s" } });
    for (const t of ["15 m/s", "15m/s", "15", "15 M/S", "15 m / s"])
      expect(gradeResponse(n, { kind: "text", text: t })).toMatchObject({ isCorrect: true });
    expect(gradeResponse(n, { kind: "text", text: "15 km/h" })).toMatchObject({ isCorrect: false });
    // No unit on the key: a typed unit is ignored rather than costing the point (Jon, Sept 29 2026).
    expect(
      gradeResponse(q("numeric", { gradingConfig: { mode: "exact", answer: 15 } }), {
        kind: "text",
        text: "15 m/s",
      })
    ).toMatchObject({ isCorrect: true });
  });
  it("spelled-out units, degree signs, cubic units, and a trailing period all match", () => {
    const s = q("numeric", {
      gradingConfig: { mode: "tolerance", answer: 604800, tolerance: 800, unit: "s" },
    });
    for (const t of ["604800 Seconds", "604,800s", "604800 sec", "604800."])
      expect(gradeResponse(s, { kind: "text", text: t })).toMatchObject({ isCorrect: true });
    expect(gradeResponse(s, { kind: "text", text: "604800 minutes" })).toMatchObject({
      isCorrect: false,
    });
    const v = q("numeric", {
      gradingConfig: { mode: "tolerance", answer: 64.4, tolerance: 0.5, unit: "cm³" },
    });
    for (const t of ["64.45cm^3", "64 cm3", "64.4 cubic centimeters", "64.4 cc"])
      expect(gradeResponse(v, { kind: "text", text: t })).toMatchObject({ isCorrect: true });
    const c = q("numeric", {
      gradingConfig: { mode: "tolerance", answer: 67, tolerance: 0.2, unit: "°C" },
    });
    for (const t of ["67 °C", "66.85 C", "67 degrees C", "67 celsius"])
      expect(gradeResponse(c, { kind: "text", text: t })).toMatchObject({ isCorrect: true });
    expect(parseNumericInput("8700.")).toEqual({ value: 8700, unit: "" });
  });
  it("exact, ± tolerance, % tolerance, range", () => {
    expect(
      gradeResponse(q("numeric", { gradingConfig: { mode: "exact", answer: 9.8 } }), {
        kind: "text",
        text: "9.80",
      })
    ).toMatchObject({ isCorrect: true });
    expect(
      gradeResponse(q("numeric", { gradingConfig: { mode: "exact", answer: 9.8 } }), {
        kind: "text",
        text: "9.81",
      })
    ).toMatchObject({ isCorrect: false });
    const tol = q("numeric", { gradingConfig: { mode: "tolerance", answer: 9.8, tolerance: 0.2 } });
    expect(gradeResponse(tol, { kind: "text", text: "10" })).toMatchObject({ isCorrect: true });
    expect(gradeResponse(tol, { kind: "text", text: "10.01" })).toMatchObject({ isCorrect: false });
    const pctq = q("numeric", {
      gradingConfig: { mode: "percent_tolerance", answer: 200, percent: 5 },
    });
    expect(gradeResponse(pctq, { kind: "text", text: "210" })).toMatchObject({ isCorrect: true });
    expect(gradeResponse(pctq, { kind: "text", text: "211" })).toMatchObject({ isCorrect: false });
    const range = q("numeric", { gradingConfig: { mode: "range", min: 9.5, max: 10.5 } });
    expect(gradeResponse(range, { kind: "text", text: "9.5" })).toMatchObject({ isCorrect: true });
    expect(gradeResponse(range, { kind: "text", text: "10.6" })).toMatchObject({
      isCorrect: false,
    });
    expect(gradeResponse(range, { kind: "text", text: "" })).toMatchObject({
      pointsEarned: 0,
      note: "No answer.",
    });
  });
  it("partial-credit answers earn their share; the key still earns full points", () => {
    // Li⁺ electrons (Jon, Oct 16 2026): 2 is right for 2 pts; 3 (the neutral count) earns half.
    const li = q("numeric", {
      points: 2,
      gradingConfig: {
        mode: "exact",
        answer: 2,
        unit: "electrons",
        partial: [{ answer: 3, credit: 0.5 }],
      },
    });
    expect(gradeResponse(li, { kind: "text", text: "2" })).toMatchObject({
      pointsEarned: 2,
      isCorrect: true,
    });
    expect(gradeResponse(li, { kind: "text", text: "3 electrons" })).toMatchObject({
      pointsEarned: 1,
      isCorrect: false,
      note: "Partial credit (50%).",
    });
    expect(gradeResponse(li, { kind: "text", text: "4" })).toMatchObject({
      pointsEarned: 0,
      isCorrect: false,
    });
    // A partial answer matches within the key's own ± tolerance.
    const tol = q("numeric", {
      gradingConfig: {
        mode: "tolerance",
        answer: 10,
        tolerance: 0.5,
        partial: [{ answer: 1, credit: 0.25 }],
      },
    });
    expect(gradeResponse(tol, { kind: "text", text: "1.4" })).toMatchObject({ pointsEarned: 0.5 });
    expect(gradeResponse(tol, { kind: "text", text: "1.6" })).toMatchObject({ pointsEarned: 0 });
    expect(correctAnswerText({ ...li, gradingConfig: li.gradingConfig })).toBe(
      "2 electrons (partial credit: 3 electrons earns 50%)"
    );
  });
  it("reads partial credit the way a teacher types it", () => {
    expect(parsePartialCredit("3 = 50%")).toEqual({
      ok: true,
      partial: [{ answer: 3, credit: 0.5 }],
    });
    expect(parsePartialCredit("3=0.5; -4 : 25% | 1,000=10%")).toEqual({
      ok: true,
      partial: [
        { answer: 3, credit: 0.5 },
        { answer: -4, credit: 0.25 },
        { answer: 1000, credit: 0.1 },
      ],
    });
    expect(parsePartialCredit("")).toEqual({ ok: true, partial: [] });
    expect(parsePartialCredit("3 = 100%").ok).toBe(false);
    expect(parsePartialCredit("three = 50%").ok).toBe(false);
    expect(formatPartialCredit([{ answer: 3, credit: 0.5 }])).toBe("3 = 50%");
  });
});

describe("matching and ordering", () => {
  it("matching gives per-pair partial credit", () => {
    const m = q("matching", {
      points: 4,
      options: [
        opt("l1", "Atrium", false, { matchText: "receives blood" }),
        opt("l2", "Ventricle", false, { matchText: "pumps blood" }),
      ],
    });
    expect(
      gradeResponse(m, { kind: "match", pairs: { l1: "Receives blood", l2: "pumps blood" } })
    ).toMatchObject({ pointsEarned: 4, isCorrect: true });
    expect(
      gradeResponse(m, { kind: "match", pairs: { l1: "pumps blood", l2: "pumps blood" } })
    ).toMatchObject({ pointsEarned: 2, isCorrect: false, detail: { l1: false, l2: true } });
    expect(gradeResponse(m, null)).toMatchObject({ pointsEarned: 0 });
  });
  it("ordering is all-or-nothing with per-position detail", () => {
    const o = q("ordering", {
      options: [
        opt("a", "first", false, { correctPosition: 1 }),
        opt("b", "second", false, { correctPosition: 2 }),
        opt("c", "third", false, { correctPosition: 3 }),
      ],
    });
    expect(gradeResponse(o, { kind: "order", optionIds: ["a", "b", "c"] })).toMatchObject({
      pointsEarned: 2,
      isCorrect: true,
    });
    expect(gradeResponse(o, { kind: "order", optionIds: ["a", "c", "b"] })).toMatchObject({
      pointsEarned: 0,
      detail: { a: true, b: false, c: false },
    });
  });
});

describe("attempt scoring", () => {
  const items: ServedItem[] = [
    { questionId: "q1", sectionId: "s1", learningTargetId: "LT1", points: 5, order: 1 },
    { questionId: "q2", sectionId: "s1", learningTargetId: "LT1", points: 5, order: 2 },
    { questionId: "q3", sectionId: "s2", learningTargetId: "LT2", points: 10, order: 3 },
    { questionId: "q4", sectionId: "s3", learningTargetId: null, points: 4, order: 4 },
  ];
  const resp = (
    questionId: string,
    autoScore: number | null,
    manualScore: number | null = null
  ): [string, ResponseRecord] => [questionId, { questionId, answer: null, autoScore, manualScore }];

  it("sums totals and per-target, lets manual override auto, counts pending", () => {
    const s = scoreAttempt(
      items,
      new Map([resp("q1", 5), resp("q2", 0), resp("q3", null), resp("q4", 2, 4)])
    );
    expect(s).toMatchObject({ totalEarned: 9, totalPossible: 24, percent: 37.5, pendingManual: 1 });
    expect(s.perTarget).toEqual([
      { learningTargetId: "LT1", pointsEarned: 5, pointsPossible: 10, percent: 50 },
      { learningTargetId: "LT2", pointsEarned: 0, pointsPossible: 10, percent: 0 },
    ]);
  });
  it("unanswered items score zero", () => {
    expect(scoreAttempt(items, new Map())).toMatchObject({
      totalEarned: 0,
      totalPossible: 24,
      pendingManual: 0,
    });
  });
});

describe("final score: highest counts", () => {
  it("PLAN.md §4 worked example: 37/40 then an LT4 retake scoring 9 → 39/40, tier 1", () => {
    const t = (id: string, e: number) => ({
      learningTargetId: id,
      pointsEarned: e,
      pointsPossible: 10,
      percent: e * 10,
    });
    const attempt1 = {
      attemptId: "a1",
      number: 1,
      totalEarned: 37,
      totalPossible: 40,
      perTarget: [t("LT1", 10), t("LT2", 10), t("LT3", 10), t("LT4", 7)],
    };
    const after1 = computeFinalScore("summative", [attempt1], { threshold: 80 });
    expect(after1).toMatchObject({
      totalEarned: 37,
      totalPossible: 40,
      percent: 92.5,
      targetsBelowThreshold: ["LT4"],
      tier: 2,
    });
    expect(retakeTargets(after1, 80)).toEqual({
      required: ["LT4"],
      optional: ["LT1", "LT2", "LT3"],
    });

    const retake = {
      attemptId: "a2",
      number: 2,
      totalEarned: 9,
      totalPossible: 10,
      perTarget: [t("LT4", 9)],
    };
    const final = computeFinalScore("summative", [attempt1, retake], { threshold: 80 });
    expect(final).toMatchObject({
      totalEarned: 39,
      totalPossible: 40,
      percent: 97.5,
      targetsBelowThreshold: [],
      tier: 1,
    });
    expect(final.perTarget.LT4).toMatchObject({ pointsEarned: 9, fromAttemptId: "a2" });
    expect(final.perTarget.LT1).toMatchObject({ pointsEarned: 10, fromAttemptId: "a1" });
  });

  it("a target can never score lower after a retake", () => {
    const t = (id: string, e: number) => ({
      learningTargetId: id,
      pointsEarned: e,
      pointsPossible: 10,
      percent: e * 10,
    });
    const a1 = {
      attemptId: "a1",
      number: 1,
      totalEarned: 7,
      totalPossible: 10,
      perTarget: [t("LT4", 7)],
    };
    const a2 = {
      attemptId: "a2",
      number: 2,
      totalEarned: 5,
      totalPossible: 10,
      perTarget: [t("LT4", 5)],
    };
    expect(computeFinalScore("summative", [a1, a2], { threshold: 80 }).perTarget.LT4).toMatchObject(
      { pointsEarned: 7, fromAttemptId: "a1" }
    );
  });

  it("a retake with a different question count counts by percent at the test's weight", () => {
    const t = (id: string, e: number, p: number) => ({
      learningTargetId: id,
      pointsEarned: e,
      pointsPossible: p,
      percent: (e / p) * 100,
    });
    const a1 = {
      attemptId: "a1",
      number: 1,
      totalEarned: 22,
      totalPossible: 28,
      perTarget: [t("LT1", 8, 8), t("LT4", 14, 20)],
    };
    // 10 retake-pool questions on LT4: 9/10 beats 14/20 and counts as 18 of the test's 20.
    const a2 = {
      attemptId: "a2",
      number: 2,
      totalEarned: 9,
      totalPossible: 10,
      perTarget: [t("LT4", 9, 10)],
    };
    const final = computeFinalScore("summative", [a2, a1], { threshold: 80 });
    expect(final).toMatchObject({ totalEarned: 26, totalPossible: 28, targetsBelowThreshold: [] });
    expect(final.perTarget.LT4).toEqual({
      pointsEarned: 18,
      pointsPossible: 20,
      percent: 90,
      fromAttemptId: "a2",
    });
    // 6/10 is a lower percent than 14/20, so the test's score stands.
    const low = { ...a2, totalEarned: 6, perTarget: [t("LT4", 6, 10)] };
    expect(
      computeFinalScore("summative", [a1, low], { threshold: 80 }).perTarget.LT4
    ).toMatchObject({ pointsEarned: 14, fromAttemptId: "a1" });
  });

  it("tiers: 0 below → 1, 1–2 → 2, 3+ → 3 (configurable)", () => {
    expect([0, 1, 2, 3, 5].map((n) => tierFor(n))).toEqual([1, 2, 2, 3, 3]);
    expect(tierFor(3, 3)).toBe(2);
  });

  it("corrections cap (Jon, Oct 8 2026): below 80 corrects to 80, at/above corrects to 100, retakes stand alone", () => {
    const a = (id: string, n: number, e: number, correctionsApproved = false) => ({
      attemptId: id,
      number: n,
      totalEarned: e,
      totalPossible: 10,
      perTarget: [],
      correctionsApproved,
    });
    const cap = { threshold: 80, correctionsCap: true };
    // 50% and no corrections yet: the raw score stands (the card says Must do corrections).
    expect(computeFinalScore("formative", [a("a1", 1, 5)], cap)).toMatchObject({
      percent: 50,
      basis: "best_attempt",
      bestAttemptId: "a1",
    });
    // Corrections done: lifted to the threshold, 8 of 10, and no higher.
    expect(computeFinalScore("formative", [a("a1", 1, 5, true)], cap)).toMatchObject({
      totalEarned: 8,
      totalPossible: 10,
      percent: 80,
      basis: "corrections_to_threshold",
    });
    // At or above the threshold, corrections lift to 100.
    expect(computeFinalScore("formative", [a("a1", 1, 9, true)], cap)).toMatchObject({
      totalEarned: 10,
      percent: 100,
      basis: "corrections_to_full",
    });
    expect(computeFinalScore("formative", [a("a1", 1, 9)], cap)).toMatchObject({
      percent: 90,
      basis: "best_attempt",
    });
    // A retake stands on its own: 92% beats the corrected 80; 70% does not.
    expect(
      computeFinalScore("formative", [a("a1", 1, 5, true), a("a2", 2, 9.2)], cap)
    ).toMatchObject({ percent: 92, basis: "retake", bestAttemptId: "a2" });
    expect(computeFinalScore("formative", [a("a1", 1, 5, true), a("a2", 2, 7)], cap)).toMatchObject(
      {
        percent: 80,
        basis: "corrections_to_threshold",
        bestAttemptId: "a1",
      }
    );
    // A retake earns no correction credit of its own.
    expect(
      computeFinalScore("formative", [a("a1", 1, 5, true), a("a2", 2, 6, true)], cap)
    ).toMatchObject({ percent: 80, basis: "corrections_to_threshold" });
    // The cap is a formative rule only, and off means the old highest-counts rule.
    expect(computeFinalScore("formative", [a("a1", 1, 5, true)], { threshold: 80 })).toMatchObject({
      percent: 50,
      basis: "best_attempt",
    });
    expect(computeFinalScore("practice", [a("a1", 1, 5, true)], cap)).toMatchObject({
      percent: 50,
      basis: "best_attempt",
    });
  });

  it("correctionsCapOn: formatives with the cap on, never in a CVTC course (Jon, Oct 13 2026)", () => {
    expect(correctionsCapOn({ type: "formative", correctionsCap: true, cvtcRules: false })).toBe(
      true
    );
    expect(correctionsCapOn({ type: "formative", correctionsCap: true, cvtcRules: null })).toBe(
      true
    );
    expect(correctionsCapOn({ type: "formative", correctionsCap: true, cvtcRules: true })).toBe(
      false
    );
    expect(correctionsCapOn({ type: "formative", correctionsCap: false, cvtcRules: false })).toBe(
      false
    );
    expect(correctionsCapOn({ type: "summative", correctionsCap: true, cvtcRules: false })).toBe(
      false
    );
  });

  it("formative: best attempt by total; later attempt wins ties; practice same", () => {
    const a = (id: string, n: number, e: number) => ({
      attemptId: id,
      number: n,
      totalEarned: e,
      totalPossible: 10,
      perTarget: [],
    });
    expect(
      computeFinalScore("formative", [a("a1", 1, 6), a("a2", 2, 9), a("a3", 3, 8)], {
        threshold: 80,
      })
    ).toMatchObject({ totalEarned: 9, percent: 90, bestAttemptId: "a2", tier: null });
    expect(
      computeFinalScore("formative", [a("a1", 1, 8), a("a2", 2, 8)], { threshold: 80 })
        .bestAttemptId
    ).toBe("a2");
    expect(computeFinalScore("practice", [], { threshold: 80 })).toMatchObject({
      totalEarned: 0,
      bestAttemptId: null,
    });
  });
});
