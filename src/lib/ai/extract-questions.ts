/**
 * AI-assisted question extraction from a past test (PLAN.md §3.5, Ticket
 * 1.17). A .pdf goes to Claude as a document block; a .docx or .txt is
 * turned into text first. Claude returns questions in the Appendix A row
 * shape through a structured output, and every call's token usage is
 * recorded. The teacher reviews every row in the import preview before
 * anything enters a bank: the model drafts, the human confirms.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db, schema } from "@/db";

export const AI_MODEL = "claude-opus-5";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
} as const;
export type DocumentKind = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES];

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

/** What Claude is asked to return: one entry per question, in Appendix A terms. */
export const extractedQuestionSchema = z.object({
  type: z.enum([
    "multiple_choice",
    "multiple_select",
    "true_false",
    "fill_blank",
    "short_answer",
    "extended_response",
    "numeric",
    "matching",
    "ordering",
  ]),
  stem: z.string(),
  /** Answer choices in order (a, b, c…); empty for open-response types. For matching: "left :: right" pairs. For ordering: the items in correct order. */
  options: z.array(z.string()),
  /** multiple_choice / true_false: the correct option letter; multiple_select: letters joined by commas; fill_blank / short_answer: accepted answers joined by " | "; numeric: the number; extended_response, matching, ordering: empty. */
  correct: z.string(),
  explanation: z.string().nullable(),
  /** The learning target code or label printed with the question or section (e.g. "LT4"), if any. */
  learning_target: z.string().nullable(),
  points: z.number().nullable(),
  /** Measurement unit for numeric answers, if the question asks for one. */
  unit: z.string().nullable(),
});
export const extractionSchema = z.object({
  questions: z.array(extractedQuestionSchema),
  /** Anything the teacher should know: unreadable pages, answer key not found, guesses made. */
  notes: z.string().nullable(),
});
export type ExtractedQuestion = z.infer<typeof extractedQuestionSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

export type ExtractInput = {
  fileName: string;
  kind: DocumentKind;
  bytes: Buffer;
  courseName: string;
  targets: { code: string; title: string }[];
  teacherId: string;
};

export type ExtractResult = Extraction & {
  usage: { inputTokens: number; outputTokens: number; model: string };
};

function systemPrompt(courseName: string, targets: { code: string; title: string }[]): string {
  const targetList = targets.length
    ? targets.map((t) => `${t.code} — ${t.title}`).join("\n")
    : "(no learning targets defined yet)";
  return `You extract assessment questions from a teacher's past test so they can be imported into a question bank. The course is "${courseName}". Its learning targets:
${targetList}

Read the whole document. Return every question you can find, in document order, using the answer key when one is present anywhere in the document (an answer key page, bold or underlined choices, asterisks, "Answer:" lines). If a question's key cannot be found, still return the question with an empty "correct" and say so in notes.

Rules:
- type: multiple_choice for one correct choice; multiple_select when the question says "select all"; true_false; fill_blank for a blank with a short factual answer; short_answer for a sentence-length answer; extended_response for essays; numeric for a calculated number; matching for paired lists; ordering for sequences.
- options: the choices exactly as written, without their letters, in order. Leave empty for open-response types. For matching, each entry is "left :: right". For ordering, the items in the correct order.
- correct: the letter (a, b, c…) for multiple_choice and true_false (true_false options must be exactly ["True", "False"]); letters joined by commas for multiple_select; accepted answers joined by " | " for fill_blank and short_answer; the number only for numeric; empty for extended_response, matching, and ordering.
- learning_target: the code from the list above when the question or its section names one or clearly matches one; otherwise null. Never invent codes.
- explanation: only if the document gives one; otherwise null.
- Keep the stem's wording. Use plain text; write math like 3 × 10^5 and units like cm³ as they appear.
- Do not make up questions, options, or answers.`;
}

/** The model call. Callers have checked the guard, the size, and the rate limit. */
export async function extractQuestions(input: ExtractInput): Promise<ExtractResult> {
  if (!isAiConfigured()) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.kind === "pdf") {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: input.bytes.toString("base64"),
      },
      title: input.fileName,
    });
  } else {
    const text =
      input.kind === "docx" ? await docxToText(input.bytes) : input.bytes.toString("utf8");
    if (!text.trim()) throw new Error("The document has no readable text.");
    content.push({
      type: "text",
      text: `<document title="${input.fileName}">\n${text}\n</document>`,
    });
  }
  content.push({
    type: "text",
    text: "Extract every question and its answer key from this document.",
  });

  const stream = client.messages.stream({
    model: AI_MODEL,
    max_tokens: 32000,
    system: systemPrompt(input.courseName, input.targets),
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(extractionSchema) },
  });
  const message = await stream.finalMessage();
  const usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    model: message.model,
  };
  await db.insert(schema.aiUsage).values({
    teacherId: input.teacherId,
    purpose: "import_document",
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    fileName: input.fileName,
  });
  console.info(
    `[ai] import_document ${input.fileName}: ${usage.inputTokens} in / ${usage.outputTokens} out (${usage.model})`
  );
  if (message.stop_reason === "refusal")
    throw new Error("The model declined to read this document.");
  if (message.stop_reason === "max_tokens")
    throw new Error("The document is too long to extract in one pass; split it and try again.");
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The model's answer wasn't valid JSON.");
  }
  const parsed = extractionSchema.safeParse(json);
  if (!parsed.success) throw new Error("The model's answer didn't match the expected shape.");
  return { ...parsed.data, usage };
}

async function docxToText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value;
}
