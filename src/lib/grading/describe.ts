/**
 * Plain-text renderings of a student's answer and of the answer key, for the
 * teacher review screen, the grading queue, and exports. Pure.
 */
import type { Answer, GradableQuestion } from "./types";

export type DescribableQuestion = GradableQuestion & { gradingConfig: unknown };

const byId = (q: GradableQuestion) => new Map(q.options.map((o) => [o.id, o]));

/** What the student put, as text; "—" when blank. */
export function answerToText(q: GradableQuestion, a: Answer): string {
  if (!a) return "—";
  const opts = byId(q);
  switch (a.kind) {
    case "choice":
      return a.optionId ? (opts.get(a.optionId)?.content ?? "(unknown option)") : "—";
    case "multi":
      return a.optionIds.length
        ? a.optionIds.map((id) => opts.get(id)?.content ?? "(unknown option)").join("; ")
        : "—";
    case "text":
      return a.text.trim() || "—";
    case "match":
      return (
        Object.entries(a.pairs)
          .filter(([, v]) => v)
          .map(([id, v]) => `${opts.get(id)?.content ?? "?"} → ${v}`)
          .join("; ") || "—"
      );
    case "order":
      return a.optionIds.length
        ? a.optionIds.map((id, i) => `${i + 1}. ${opts.get(id)?.content ?? "?"}`).join("; ")
        : "—";
  }
}

/** The answer key as text; null when the question has no fixed key (essays, manual short answer). */
export function correctAnswerText(q: DescribableQuestion): string | null {
  const cfg = (q.gradingConfig ?? {}) as Record<string, unknown>;
  switch (q.type) {
    case "multiple_choice":
    case "true_false":
      return q.options.find((o) => o.isCorrect)?.content ?? null;
    case "multiple_select":
      return (
        q.options
          .filter((o) => o.isCorrect)
          .map((o) => o.content)
          .join("; ") || null
      );
    case "fill_blank": {
      const accepted = (cfg.acceptedAnswers as string[] | undefined) ?? [];
      return accepted.length ? accepted.join(" / ") : null;
    }
    case "short_answer": {
      const keywords = (cfg.keywords as string[] | undefined) ?? [];
      return keywords.length ? `Mentions: ${keywords.join(", ")}` : null;
    }
    case "numeric": {
      const mode = (cfg.mode as string | undefined) ?? "exact";
      const unit = cfg.unit ? ` ${cfg.unit}` : "";
      if (mode === "range") return `${cfg.min} to ${cfg.max}${unit}`;
      if (mode === "tolerance") return `${cfg.answer} ± ${cfg.tolerance}${unit}`;
      if (mode === "percent_tolerance") return `${cfg.answer}${unit} ± ${cfg.percent}%`;
      return cfg.answer === undefined ? null : `${cfg.answer}${unit}`;
    }
    case "matching":
      return (
        q.options
          .filter((o) => o.matchText)
          .map((o) => `${o.content} → ${o.matchText}`)
          .join("; ") || null
      );
    case "ordering":
      return (
        [...q.options]
          .filter((o) => o.correctPosition !== null)
          .sort((a, b) => (a.correctPosition ?? 0) - (b.correctPosition ?? 0))
          .map((o, i) => `${i + 1}. ${o.content}`)
          .join("; ") || null
      );
    default:
      return null;
  }
}
