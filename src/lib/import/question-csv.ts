/**
 * Appendix A CSV contract: turns raw CSV records into validated question rows.
 * Pure (no database); the server-side resolver in question-import.ts matches
 * targets, pools, units, standards, and stimuli and writes the rows.
 */
import type { BloomLevel, GradingConfig, GradingMode } from "@/db/types";
import {
  BLOOM_LEVELS,
  IMPORTABLE_TYPES,
  OPTION_LETTERS,
  type ImportableType,
} from "@/lib/question-types";

export const CSV_COLUMNS = [
  "external_id",
  "course",
  "unit",
  "topic",
  "learning_target",
  "standard",
  "pool",
  "type",
  "stem",
  "stimulus_ref",
  "stimulus_text",
  "stimulus_image_url",
  "stimulus_video_url",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
  "option_f",
  "correct",
  "tolerance",
  "tolerance_mode",
  "unit",
  "points",
  "difficulty",
  "bloom",
  "grading",
  "explanation",
  "image_url",
  "video_url",
  "tags",
] as const;

/** Columns that must be present as headers for the file to be accepted at all. */
export const REQUIRED_HEADERS = ["course", "learning_target", "type", "stem", "correct"] as const;

export type RawRecord = Record<string, string>;
export type IssueLevel = "error" | "warning" | "info";
export type RowIssue = { level: IssueLevel; field?: string; message: string };

export type ParsedOption = {
  letter: string;
  content: string;
  matchText: string | null;
  isCorrect: boolean;
  correctPosition: number | null;
};

export type ParsedStimulus = {
  ref: string;
  text: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
};

export type ParsedRow = {
  line: number;
  raw: RawRecord;
  externalId: string | null;
  course: string;
  unit: string | null;
  topic: string | null;
  learningTarget: string;
  standard: string | null;
  pool: string | null;
  type: ImportableType;
  stem: string;
  stimulus: ParsedStimulus | null;
  options: ParsedOption[];
  gradingConfig: GradingConfig | null;
  points: number;
  difficulty: number;
  bloom: BloomLevel | null;
  grading: GradingMode;
  explanation: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  tags: string[];
  issues: RowIssue[];
  status: "ok" | "warning" | "error";
};

/** Absolute http(s) URLs, or media the app serves itself (/api/media/…). */
const ABSOLUTE_URL = /^(https?:\/\/|\/api\/media\/)/i;

function blank(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/** Validate that the header row carries what Appendix A requires. Returns missing headers. */
export function missingHeaders(headers: string[]): string[] {
  const set = new Set(headers);
  return REQUIRED_HEADERS.filter((h) => !set.has(h));
}

/** Parse one CSV record. Never throws; problems land in `issues`. */
export function parseQuestionRecord(raw: RawRecord, line: number): ParsedRow {
  const issues: RowIssue[] = [];
  const error = (message: string, field?: string) =>
    issues.push({ level: "error", field, message });
  const warn = (message: string, field?: string) =>
    issues.push({ level: "warning", field, message });

  const course = blank(raw.course) ?? "";
  if (!course) error("course is required.", "course");
  const learningTarget = blank(raw.learning_target) ?? "";
  if (!learningTarget) error("learning_target is required.", "learning_target");
  const stem = blank(raw.stem) ?? "";
  if (!stem) error("stem is required.", "stem");

  const typeRaw = (blank(raw.type) ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const type = (IMPORTABLE_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as ImportableType)
    : null;
  if (!type) error(`type must be one of ${IMPORTABLE_TYPES.join(", ")}.`, "type");

  const correct = blank(raw.correct);
  const needsCorrect = type !== null && type !== "matching" && type !== "extended_response";
  if (needsCorrect && !correct) error("correct is required for this type.", "correct");

  // Options as provided, keeping their letters.
  const provided: { letter: string; content: string }[] = [];
  for (const letter of OPTION_LETTERS) {
    const content = blank(raw[`option_${letter}`]);
    if (content) provided.push({ letter, content });
  }
  const letters = new Set(provided.map((o) => o.letter));

  let options: ParsedOption[] = [];
  let gradingConfig: GradingConfig | null = null;
  const opt = (
    o: { letter: string; content: string },
    extra: Partial<ParsedOption> = {}
  ): ParsedOption => ({
    letter: o.letter,
    content: o.content,
    matchText: null,
    isCorrect: false,
    correctPosition: null,
    ...extra,
  });

  switch (type) {
    case "multiple_choice": {
      if (provided.length < 2) error("multiple_choice needs at least two options.", "option_a");
      const c = correct?.toLowerCase() ?? "";
      if (correct && !/^[a-f]$/.test(c))
        error("correct must be a single option letter, e.g. c.", "correct");
      else if (correct && !letters.has(c))
        error(`correct is "${c}" but option_${c} is blank.`, "correct");
      options = provided.map((o) => opt(o, { isCorrect: o.letter === c }));
      break;
    }
    case "multiple_select": {
      if (provided.length < 2) error("multiple_select needs at least two options.", "option_a");
      const cs = (correct ?? "")
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (correct && cs.some((s) => !/^[a-f]$/.test(s)))
        error("correct must be letters separated by commas, e.g. a,c,d.", "correct");
      const missing = cs.filter((s) => !letters.has(s));
      if (missing.length)
        error(`correct names option(s) that are blank: ${missing.join(", ")}.`, "correct");
      options = provided.map((o) => opt(o, { isCorrect: cs.includes(o.letter) }));
      gradingConfig = { partialCredit: false };
      break;
    }
    case "true_false": {
      const c = (correct ?? "").toLowerCase();
      if (correct && c !== "true" && c !== "false")
        error("correct must be true or false.", "correct");
      if (provided.length) warn("Options are ignored for true_false.", "option_a");
      options = [
        {
          letter: "a",
          content: "True",
          matchText: null,
          isCorrect: c === "true",
          correctPosition: null,
        },
        {
          letter: "b",
          content: "False",
          matchText: null,
          isCorrect: c === "false",
          correctPosition: null,
        },
      ];
      break;
    }
    case "fill_blank": {
      const accepted = (correct ?? "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      if (correct && accepted.length === 0)
        error("correct must list accepted answers separated by |.", "correct");
      if (!stem.includes("___")) warn("Stem has no ___ blank marker.", "stem");
      gradingConfig = { acceptedAnswers: accepted, caseSensitive: false };
      break;
    }
    case "short_answer": {
      const keywords = (correct ?? "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      gradingConfig = { keywords, minMatches: keywords.length ? 1 : 0 };
      break;
    }
    case "extended_response": {
      if (correct) warn("correct is ignored for extended_response.", "correct");
      break;
    }
    case "numeric": {
      const modeRaw = (blank(raw.tolerance_mode) ?? "exact").toLowerCase();
      const modeMap: Record<string, "exact" | "tolerance" | "percent_tolerance" | "range"> = {
        exact: "exact",
        abs: "tolerance",
        tolerance: "tolerance",
        percent: "percent_tolerance",
        "%": "percent_tolerance",
        range: "range",
      };
      const mode = modeMap[modeRaw];
      if (!mode) error("tolerance_mode must be exact, abs, percent, or range.", "tolerance_mode");
      const tol = blank(raw.tolerance);
      const tolNum = tol === null ? null : Number(tol);
      const unit = blank(raw.unit);
      const cfg: Record<string, unknown> = { mode: mode ?? "exact", unit };
      if (mode === "range") {
        const m = (correct ?? "").match(/^\s*(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*$/);
        if (!m) error('For range mode, correct must be "min-max", e.g. 9.5-10.5.', "correct");
        else {
          cfg.min = Number(m[1]);
          cfg.max = Number(m[2]);
          if (
            Number.isNaN(cfg.min) ||
            Number.isNaN(cfg.max) ||
            (cfg.min as number) > (cfg.max as number)
          ) {
            error("Range min must be a number no greater than max.", "correct");
          }
        }
      } else if (correct) {
        const n = Number(correct.replace(/,/g, ""));
        if (Number.isNaN(n)) error("correct must be a number for numeric questions.", "correct");
        cfg.answer = n;
      }
      if (mode === "tolerance" || mode === "percent_tolerance") {
        if (tolNum === null || Number.isNaN(tolNum) || tolNum < 0) {
          error("tolerance must be a non-negative number for abs or percent mode.", "tolerance");
        } else if (mode === "tolerance") cfg.tolerance = tolNum;
        else cfg.percent = tolNum;
      } else if (tol !== null) {
        warn("tolerance is ignored unless tolerance_mode is abs or percent.", "tolerance");
      }
      gradingConfig = cfg as GradingConfig;
      break;
    }
    case "ordering": {
      if (provided.length < 2) error("ordering needs at least two options.", "option_a");
      const seq = (correct ?? "")
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const seqSet = new Set(seq);
      if (
        correct &&
        (seq.length !== provided.length ||
          seqSet.size !== seq.length ||
          [...letters].some((l) => !seqSet.has(l)))
      ) {
        error(
          "correct must list every provided option letter exactly once, in order, e.g. c,a,b,d.",
          "correct"
        );
      }
      options = provided.map((o) => opt(o, { correctPosition: seq.indexOf(o.letter) + 1 || null }));
      break;
    }
    case "matching": {
      if (provided.length < 2) error("matching needs at least two option pairs.", "option_a");
      options = provided.map((o) => {
        const idx = o.content.indexOf(" :: ");
        if (idx === -1) {
          error(`option_${o.letter} must be "left :: right".`, `option_${o.letter}`);
          return opt(o);
        }
        return opt(o, {
          content: o.content.slice(0, idx).trim(),
          matchText: o.content.slice(idx + 4).trim(),
        });
      });
      if (correct) warn("correct is ignored for matching; pairs come from the options.", "correct");
      break;
    }
    case null:
      break;
  }

  // Numbers and enums with Appendix A defaults.
  let points = 1;
  const pointsRaw = blank(raw.points);
  if (pointsRaw !== null) {
    const n = Number(pointsRaw);
    if (!Number.isInteger(n) || n < 0) error("points must be a whole number ≥ 0.", "points");
    else points = n;
  }
  let difficulty = 3;
  const diffRaw = blank(raw.difficulty);
  if (diffRaw !== null) {
    const n = Number(diffRaw);
    if (!Number.isInteger(n) || n < 1 || n > 5)
      warn("difficulty must be 1–5; using 3.", "difficulty");
    else difficulty = n;
  }
  let bloom: BloomLevel | null = null;
  const bloomRaw = blank(raw.bloom)?.toLowerCase() ?? null;
  if (bloomRaw !== null) {
    if ((BLOOM_LEVELS as readonly string[]).includes(bloomRaw)) bloom = bloomRaw as BloomLevel;
    else warn(`bloom must be one of ${BLOOM_LEVELS.join(", ")}; left blank.`, "bloom");
  }
  let grading: GradingMode = "auto";
  const gradingRaw = blank(raw.grading)?.toLowerCase() ?? null;
  if (gradingRaw === "manual") grading = "manual";
  else if (gradingRaw !== null && gradingRaw !== "auto")
    warn("grading must be auto or manual; using auto.", "grading");
  if (type === "extended_response") grading = "manual";
  if (type === "short_answer" && gradingRaw === null) grading = "manual";
  if (type === "short_answer" && grading === "auto") {
    const kw = (gradingConfig as { keywords?: string[] } | null)?.keywords ?? [];
    if (kw.length === 0)
      warn(
        "short_answer with grading=auto has no keywords; it will need manual grading.",
        "grading"
      );
  }

  const tags = Array.from(
    new Set(
      (raw.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );

  const mediaUrl = (field: "image_url" | "video_url"): string | null => {
    const v = blank(raw[field]);
    if (v === null) return null;
    if (ABSOLUTE_URL.test(v)) return v;
    warn(
      `${field} "${v}" is a file name; attach the file when media upload lands (Ticket 1.4).`,
      field
    );
    return null;
  };
  const imageUrl = mediaUrl("image_url");
  const videoUrl = mediaUrl("video_url");

  let stimulus: ParsedStimulus | null = null;
  const ref = blank(raw.stimulus_ref);
  if (ref) {
    const sImg = blank(raw.stimulus_image_url);
    const sVid = blank(raw.stimulus_video_url);
    stimulus = {
      ref,
      text: blank(raw.stimulus_text),
      imageUrl: sImg && ABSOLUTE_URL.test(sImg) ? sImg : null,
      videoUrl: sVid && ABSOLUTE_URL.test(sVid) ? sVid : null,
    };
    if (sImg && !ABSOLUTE_URL.test(sImg))
      warn(
        `stimulus_image_url "${sImg}" is a file name; attach it in Ticket 1.4.`,
        "stimulus_image_url"
      );
    if (sVid && !ABSOLUTE_URL.test(sVid))
      warn(
        `stimulus_video_url "${sVid}" is a file name; attach it in Ticket 1.4.`,
        "stimulus_video_url"
      );
  } else if (
    blank(raw.stimulus_text) ||
    blank(raw.stimulus_image_url) ||
    blank(raw.stimulus_video_url)
  ) {
    warn("Stimulus content given without a stimulus_ref; it is ignored.", "stimulus_ref");
  }

  const status = statusOf(issues);

  return {
    line,
    raw,
    externalId: blank(raw.external_id),
    course,
    unit: blank(raw.unit),
    topic: blank(raw.topic),
    learningTarget,
    standard: blank(raw.standard),
    pool: blank(raw.pool),
    type: type ?? "multiple_choice",
    stem,
    stimulus,
    options,
    gradingConfig,
    points,
    difficulty,
    bloom,
    grading,
    explanation: blank(raw.explanation),
    imageUrl,
    videoUrl,
    tags,
    issues,
    status,
  };
}

/**
 * Parse every record and apply cross-row rules: duplicate external_ids in the
 * file, and stimulus groups where a later row restates different content.
 */
export function parseQuestionRecords(records: RawRecord[], firstLine = 2): ParsedRow[] {
  const rows = records.map((r, i) => parseQuestionRecord(r, firstLine + i));

  const seenExternal = new Map<string, number>();
  const stimulusContent = new Map<string, ParsedStimulus>();
  for (const row of rows) {
    if (row.externalId) {
      const key = row.externalId.toLowerCase();
      const first = seenExternal.get(key);
      if (first !== undefined) {
        row.issues.push({
          level: "error",
          field: "external_id",
          message: `Duplicate external_id (also on line ${first}).`,
        });
      } else seenExternal.set(key, row.line);
    }
    if (row.stimulus) {
      const key = row.stimulus.ref.toLowerCase();
      const first = stimulusContent.get(key);
      if (!first) {
        stimulusContent.set(key, row.stimulus);
      } else {
        const restated =
          (row.stimulus.text && row.stimulus.text !== first.text) ||
          (row.stimulus.imageUrl && row.stimulus.imageUrl !== first.imageUrl) ||
          (row.stimulus.videoUrl && row.stimulus.videoUrl !== first.videoUrl);
        if (restated) {
          row.issues.push({
            level: "warning",
            field: "stimulus_ref",
            message: `Stimulus "${row.stimulus.ref}" content differs from its first row; the first row wins.`,
          });
        }
        row.stimulus = { ...first };
      }
    }
  }
  for (const [key, s] of stimulusContent) {
    if (!s.text && !s.imageUrl && !s.videoUrl) {
      const owner = rows.find((r) => r.stimulus?.ref.toLowerCase() === key);
      owner?.issues.push({
        level: "warning",
        field: "stimulus_ref",
        message: `Stimulus "${s.ref}" has no text, image, or video.`,
      });
    }
  }
  for (const row of rows) row.status = statusOf(row.issues);
  return rows;
}

/** error > warning > ok; "info" issues never change the status. */
export function statusOf(issues: RowIssue[]): ParsedRow["status"] {
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.some((i) => i.level === "warning")) return "warning";
  return "ok";
}

/** Split "LT1 Blood composition" into a code and title for auto-created targets. */
export function splitTargetName(
  name: string,
  fallbackIndex: number
): { code: string; title: string } {
  const m = name.trim().match(/^([A-Za-z]{1,4}\s?\d+(?:[.\-]\d+)*)[\s:.\-–]+(.+)$/);
  if (m) return { code: m[1].replace(/\s+/g, "").toUpperCase(), title: m[2].trim() };
  return { code: `LT${fallbackIndex}`, title: name.trim() };
}
