/**
 * Paper version of an assessment (for a student who needs paper or when the
 * technology is a barrier). Pure: turns one served set plus its question rows
 * into a print model that the Word and PDF renderers share, with an optional
 * answer key. Question numbering runs across sections like a real test.
 */
import type { ServedQuestion } from "@/db/types";
import { seededRng } from "@/lib/assessments/serve";
import { correctAnswerText } from "@/lib/grading";
import type { BankQuestionRow } from "@/lib/queries/banks";
import { richTextToPlain } from "@/lib/richtext";

export const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export type PaperOption = { letter: string; text: string };

export type PaperBlock =
  | { kind: "section"; title: string; instructions: string | null }
  | { kind: "stimulus"; title: string | null; text: string | null; imageUrl: string | null }
  | {
      kind: "question";
      number: number;
      points: number;
      type: BankQuestionRow["type"];
      targetCode: string | null;
      stem: string;
      imageUrl: string | null;
      /** Lettered choices (choice types, matching left column, ordering items). */
      options: PaperOption[];
      /** Matching only: the right-hand choices, shuffled, for the student to pick from. */
      choices: string[];
      /** Numeric: the unit printed after the answer box. */
      unit: string | null;
      /** How many ruled lines to print under the question. */
      answerLines: number;
      /** What the student is asked to do, when the type needs a hint on paper. */
      directions: string | null;
    };

export type KeyEntry = { number: number; answer: string; points: number };

export type PaperDoc = {
  title: string;
  subtitle: string | null;
  instructions: string | null;
  version: string;
  blocks: PaperBlock[];
  questionCount: number;
  totalPoints: number;
  key: KeyEntry[] | null;
};

export type PaperSection = { id: string; title: string; instructions: string | null };

const ANSWER_LINES: Partial<Record<BankQuestionRow["type"], number>> = {
  fill_blank: 1,
  short_answer: 3,
  extended_response: 10,
  numeric: 1,
};

const DIRECTIONS: Partial<Record<BankQuestionRow["type"], string>> = {
  multiple_select: "Select all that apply.",
  matching: "Write the letter of the matching choice on each line.",
  ordering: "Number the items in the correct order (1 = first).",
  numeric: "Write the number only; the unit is given.",
};

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The answer key text for one question, from the same describer the teacher review uses. */
export function keyFor(q: BankQuestionRow, choices: string[]): string {
  const opts = q.options.map((o, i) => ({ ...o, id: String(i) }));
  switch (q.type) {
    case "multiple_choice":
    case "true_false":
    case "multiple_select": {
      const idx = opts
        .map((o, i) => (o.isCorrect ? (LETTERS[i] as string) : null))
        .filter((x): x is string => !!x);
      return idx.join(", ") || "—";
    }
    case "matching":
      return opts
        .map((o, i) => {
          const j = choices.indexOf(o.matchText ?? "");
          return `${LETTERS[i]} → ${j >= 0 ? String(j + 1) : (o.matchText ?? "?")}`;
        })
        .join("; ");
    case "ordering":
      return [...opts]
        .filter((o) => o.correctPosition !== null)
        .sort((a, b) => (a.correctPosition ?? 0) - (b.correctPosition ?? 0))
        .map((o) => LETTERS[opts.indexOf(o)])
        .join(", ");
    case "extended_response":
      return "Teacher scored.";
    default: {
      const text = correctAnswerText({
        id: q.id,
        type: q.type,
        points: q.points,
        grading: q.grading,
        gradingConfig: q.gradingConfig,
        options: opts,
      });
      return text ? richTextToPlain(text) : "—";
    }
  }
}

/**
 * Build the print model. `seed` fixes the matching-choice shuffle so the key
 * matches the sheet; `version` is printed in the header (A, B, …).
 */
export function buildPaperDoc(input: {
  title: string;
  courseName: string | null;
  instructions: string | null;
  sections: PaperSection[];
  served: ServedQuestion[];
  questions: Map<string, BankQuestionRow>;
  targetCodes: Map<string, string>;
  includeKey: boolean;
  version?: string;
  seed?: number;
}): PaperDoc {
  const rng = seededRng((input.seed ?? 1) * 7919);
  const blocks: PaperBlock[] = [];
  const key: KeyEntry[] = [];
  let number = 0;
  let totalPoints = 0;
  let lastSection: string | null = null;
  let lastStimulus: string | null = null;
  const sectionBy = new Map(input.sections.map((s) => [s.id, s]));
  const multiSection = new Set(input.served.map((s) => s.sectionId)).size > 1;

  for (const s of input.served) {
    const q = input.questions.get(s.questionId);
    if (!q) continue;
    if (s.sectionId !== lastSection) {
      const sec = sectionBy.get(s.sectionId);
      if (sec && (multiSection || sec.instructions))
        blocks.push({ kind: "section", title: sec.title, instructions: sec.instructions });
      lastSection = s.sectionId;
      lastStimulus = null;
    }
    if (q.stimulus && q.stimulus.id !== lastStimulus) {
      blocks.push({
        kind: "stimulus",
        title: q.stimulus.title,
        text: q.stimulus.content ? richTextToPlain(q.stimulus.content) : null,
        imageUrl: q.stimulus.kind === "image" ? q.stimulus.mediaUrl : null,
      });
      lastStimulus = q.stimulus.id;
    } else if (!q.stimulus) lastStimulus = null;

    number++;
    totalPoints += s.points;
    const isChoice =
      q.type === "multiple_choice" || q.type === "true_false" || q.type === "multiple_select";
    const listed = isChoice || q.type === "matching" || q.type === "ordering";
    const options: PaperOption[] = listed
      ? q.options
          .slice(0, 6)
          .map((o, i) => ({ letter: LETTERS[i], text: richTextToPlain(o.content) }))
      : [];
    const choices =
      q.type === "matching"
        ? shuffle(q.options.map((o) => o.matchText ?? "").filter(Boolean), rng)
        : [];
    const unit =
      q.type === "numeric"
        ? ((q.gradingConfig as { unit?: string | null } | null)?.unit ?? null)
        : null;
    blocks.push({
      kind: "question",
      number,
      points: s.points,
      type: q.type,
      targetCode: s.learningTargetId ? (input.targetCodes.get(s.learningTargetId) ?? null) : null,
      stem: richTextToPlain(q.stem),
      imageUrl: q.mediaUrl,
      options,
      choices,
      unit: unit || null,
      answerLines: ANSWER_LINES[q.type] ?? 0,
      directions: DIRECTIONS[q.type] ?? null,
    });
    if (input.includeKey) key.push({ number, answer: keyFor(q, choices), points: s.points });
  }
  return {
    title: input.title,
    subtitle: input.courseName,
    instructions: input.instructions ? richTextToPlain(input.instructions) : null,
    version: input.version ?? "A",
    blocks,
    questionCount: number,
    totalPoints: Math.round(totalPoints * 100) / 100,
    key: input.includeKey ? key : null,
  };
}

/** A file-name-safe slug for the download. */
export function paperFileName(
  title: string,
  version: string,
  ext: "docx" | "pdf",
  withKey: boolean
): string {
  const slug =
    title
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "test";
  return `${slug}-${version}${withKey ? "-KEY" : ""}.${ext}`;
}
