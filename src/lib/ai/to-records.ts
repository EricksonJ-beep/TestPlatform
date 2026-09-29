/**
 * Turn what Claude extracted into Appendix A records, the same shape the CSV
 * wizard previews, so the teacher reviews AI-drafted rows exactly like a CSV.
 * Pure.
 */
import type { ExtractedQuestion } from "./extract-questions";

export type ImportRecord = Record<string, string>;

/** The columns the wizard sends to the importer; `unit_2` is Appendix A's second (measurement) unit column. */
export const RECORD_HEADERS = [
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
  "unit_2",
  "points",
  "difficulty",
  "bloom",
  "grading",
  "explanation",
  "image_url",
  "video_url",
  "tags",
] as const;

const LETTERS = ["a", "b", "c", "d", "e", "f"] as const;

/** Match a printed target label ("LT4", "lt 4", "Learning Target 4") to a course target code. */
export function matchTarget(
  label: string | null,
  targets: { code: string; title: string }[]
): { code: string; title: string } | null {
  if (!label) return null;
  const norm = (s: string) =>
    s
      .replace(/learning\s*target/i, "LT")
      .replace(/[\s._-]+/g, "")
      .toLowerCase();
  const key = norm(label);
  return (
    targets.find((t) => norm(t.code) === key) ??
    targets.find((t) => key.startsWith(norm(t.code)) && norm(t.code).length >= 3) ??
    targets.find((t) => norm(t.title) === key) ??
    null
  );
}

/**
 * One record per extracted question. Every target the model named is
 * resolved against the course; an unmatched or missing one leaves
 * learning_target blank, which the preview flags for the teacher to fix.
 */
export function extractedToRecords(
  questions: ExtractedQuestion[],
  ctx: { courseName: string; targets: { code: string; title: string }[]; fileName: string }
): { headers: string[]; records: ImportRecord[] } {
  const stamp = ctx.fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const records = questions.map((q, i) => {
    const rec: ImportRecord = Object.fromEntries(RECORD_HEADERS.map((h) => [h, ""]));
    rec.course = ctx.courseName;
    rec.type = q.type;
    rec.stem = q.stem.trim();
    rec.explanation = q.explanation?.trim() ?? "";
    rec.points = q.points && q.points > 0 ? String(q.points) : "";
    rec.external_id = `${stamp}-${String(i + 1).padStart(2, "0")}`;
    const target = matchTarget(q.learning_target, ctx.targets);
    rec.learning_target = target ? `${target.code} ${target.title}` : "";
    const opts = q.options.map((o) => o.trim()).filter(Boolean);
    switch (q.type) {
      case "true_false":
        rec.correct = /^(a|true|t)$/i.test(q.correct.trim())
          ? "true"
          : /^(b|false|f)$/i.test(q.correct.trim())
            ? "false"
            : "";
        break;
      case "multiple_choice":
      case "multiple_select":
        opts.slice(0, 6).forEach((o, j) => (rec[`option_${LETTERS[j]}`] = o));
        rec.correct = q.correct
          .toLowerCase()
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter((s) => /^[a-f]$/.test(s))
          .join(",");
        break;
      case "matching":
        opts
          .slice(0, 6)
          .forEach((o, j) => (rec[`option_${LETTERS[j]}`] = o.replace(/\s*(?:=>|::)\s*/, " :: ")));
        rec.correct = "";
        break;
      case "ordering":
        opts.slice(0, 6).forEach((o, j) => (rec[`option_${LETTERS[j]}`] = o));
        rec.correct = opts
          .slice(0, 6)
          .map((_, j) => LETTERS[j])
          .join(",");
        break;
      case "numeric": {
        const m = q.correct.replace(/,/g, "").match(/-?\d*\.?\d+(?:e[+-]?\d+)?/i);
        rec.correct = m ? m[0] : "";
        rec.unit_2 = q.unit?.trim() ?? "";
        break;
      }
      case "fill_blank":
      case "short_answer":
        rec.correct = q.correct
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" | ");
        break;
      case "extended_response":
        rec.correct = "";
        rec.grading = "manual";
        break;
    }
    return rec;
  });
  return { headers: [...RECORD_HEADERS], records };
}
