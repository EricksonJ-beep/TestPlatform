"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import { RichText } from "@/components/rich-text";
import { TargetPicker } from "@/components/targets/target-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, useAction } from "@/components/use-action";
import type { QuestionForEdit } from "@/lib/queries/banks";
import {
  BLOOM_LABEL,
  BLOOM_LEVELS,
  IMPORTABLE_TYPES,
  TYPE_LABEL,
  type ImportableType,
} from "@/lib/question-types";
import { RICHTEXT_HELP } from "@/lib/richtext";
import { createQuestion, updateQuestion } from "./actions";

type OptionRow = { content: string; isCorrect: boolean; feedback: string; matchText: string };
type NumericState = {
  mode: "exact" | "tolerance" | "percent_tolerance" | "range";
  answer: string;
  tolerance: string;
  percent: string;
  min: string;
  max: string;
  unit: string;
};

export type EditorProps = {
  bankId: string;
  question?: QuestionForEdit | null;
  targets: { id: string; code: string; title: string }[];
  units: { id: string; name: string }[];
  onSaved?: (questionId: string) => void;
  onCancel?: () => void;
  compact?: boolean;
};

const EDITABLE_TYPES = IMPORTABLE_TYPES.filter(
  (t) => (t !== "matching" && t !== "ordering") || true
);
const selectClass =
  "border-input bg-background h-8 rounded-lg border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function initialOptions(q: QuestionForEdit | null | undefined, type: ImportableType): OptionRow[] {
  if (q && q.options.length)
    return q.options.map((o) => ({
      content: o.content,
      isCorrect: o.isCorrect,
      feedback: o.feedback ?? "",
      matchText: o.matchText ?? "",
    }));
  if (type === "true_false")
    return [
      { content: "True", isCorrect: true, feedback: "", matchText: "" },
      { content: "False", isCorrect: false, feedback: "", matchText: "" },
    ];
  return [
    { content: "", isCorrect: true, feedback: "", matchText: "" },
    { content: "", isCorrect: false, feedback: "", matchText: "" },
    { content: "", isCorrect: false, feedback: "", matchText: "" },
    { content: "", isCorrect: false, feedback: "", matchText: "" },
  ];
}

function initialNumeric(q: QuestionForEdit | null | undefined): NumericState {
  const c = (q?.gradingConfig ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  return {
    mode: (c.mode as NumericState["mode"]) ?? "exact",
    answer: s(c.answer),
    tolerance: s(c.tolerance),
    percent: s(c.percent),
    min: s(c.min),
    max: s(c.max),
    unit: s(c.unit),
  };
}

function lines(v: unknown): string {
  return Array.isArray(v) ? (v as string[]).join("\n") : "";
}

export function QuestionEditor({
  bankId,
  question,
  targets,
  units,
  onSaved,
  onCancel,
  compact = false,
}: EditorProps) {
  const isEdit = !!question;
  const [type, setType] = useState<ImportableType>(
    (question?.type as ImportableType) ?? "multiple_choice"
  );
  const [stem, setStem] = useState(question?.stem ?? "");
  const [options, setOptions] = useState<OptionRow[]>(() => initialOptions(question, type));
  const [numeric, setNumeric] = useState<NumericState>(() => initialNumeric(question));
  const [grading, setGrading] = useState<"auto" | "manual">(question?.grading ?? "auto");
  const [partialCredit, setPartialCredit] = useState<boolean>(
    (question?.gradingConfig as { partialCredit?: boolean } | null)?.partialCredit ?? false
  );
  const stemRef = useRef<HTMLTextAreaElement>(null);
  const { run, pending, error, fieldErrors } = useAction();
  const cfg = (question?.gradingConfig ?? {}) as Record<string, unknown>;

  function changeType(next: ImportableType) {
    setType(next);
    if (next === "true_false")
      setOptions([
        { content: "True", isCorrect: true, feedback: "", matchText: "" },
        { content: "False", isCorrect: false, feedback: "", matchText: "" },
      ]);
    else if (type === "true_false") setOptions(initialOptions(null, next));
    if (next === "extended_response") setGrading("manual");
    if (next === "short_answer" && !isEdit) setGrading("manual");
  }

  function insertMarkup(before: string, after: string) {
    const el = stemRef.current;
    if (!el) return;
    const start = el.selectionStart ?? stem.length;
    const end = el.selectionEnd ?? stem.length;
    const selected = stem.slice(start, end);
    const next = stem.slice(0, start) + before + selected + after + stem.slice(end);
    setStem(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  const hasOptions =
    type === "multiple_choice" ||
    type === "multiple_select" ||
    type === "true_false" ||
    type === "ordering" ||
    type === "matching";
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const list = (name: string, sep: RegExp) =>
      String(fd.get(name) ?? "")
        .split(sep)
        .map((s) => s.trim())
        .filter(Boolean);
    const payload = {
      type,
      stem,
      explanation: String(fd.get("explanation") ?? ""),
      points: Number(fd.get("points") ?? 1),
      difficulty: Number(fd.get("difficulty") ?? 3),
      bloom: (fd.get("bloom") as string) || null,
      grading,
      topic: String(fd.get("topic") ?? ""),
      unitId: (fd.get("unitId") as string) || null,
      tags: list("tags", /,/),
      notes: String(fd.get("notes") ?? ""),
      targetIds: fd.getAll("targetIds").map(String),
      standardCodes: list("standardCodes", /,/),
      mediaUrl: String(fd.get("mediaUrl") ?? ""),
      videoUrl: String(fd.get("videoUrl") ?? ""),
      options: hasOptions
        ? options.map((o, i) => ({
            content: o.content,
            isCorrect: o.isCorrect,
            feedback: o.feedback || null,
            matchText: o.matchText || null,
            correctPosition: type === "ordering" ? i + 1 : null,
          }))
        : [],
      acceptedAnswers: list("acceptedAnswers", /\n|\|/),
      keywords: list("keywords", /\n|\|/),
      partialCredit,
      numeric:
        type === "numeric"
          ? {
              mode: numeric.mode,
              answer: num(numeric.answer),
              tolerance: num(numeric.tolerance),
              percent: num(numeric.percent),
              min: num(numeric.min),
              max: num(numeric.max),
              unit: numeric.unit,
            }
          : null,
    };
    run(
      isEdit ? updateQuestion(bankId, question!.id, payload) : createQuestion(bankId, payload),
      ({ questionId }) => onSaved?.(questionId)
    );
  }

  const preview = useMemo(() => stem.trim(), [stem]);

  return (
    <form onSubmit={onSubmit} className={cn("flex flex-col gap-5", compact ? "" : "max-w-4xl")}>
      {isEdit && question?.isArchived ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          This is an archived version. Saving is disabled; edit the current version instead.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="qe-type">Type</Label>
          <select
            id="qe-type"
            value={type}
            onChange={(e) => changeType(e.target.value as ImportableType)}
            className={selectClass}
          >
            {EDITABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label>Learning targets</Label>
          <TargetPicker targets={targets} defaultSelected={question?.targetIds ?? []} label="" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <Label htmlFor="qe-stem" className="mr-auto">
            Question
          </Label>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => insertMarkup("_{", "}")}
            title="Subscript"
          >
            x<sub>2</sub>
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => insertMarkup("^{", "}")}
            title="Superscript"
          >
            x<sup>2</sup>
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => insertMarkup("$", "$")}
            title="Math (LaTeX)"
          >
            ∑
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => insertMarkup("**", "**")}
            title="Bold"
          >
            B
          </Button>
        </div>
        <Textarea
          id="qe-stem"
          ref={stemRef}
          value={stem}
          onChange={(e) => setStem(e.target.value)}
          rows={4}
          required
          placeholder={
            type === "fill_blank" ? "Red blood cells are also called ___." : "Write the question…"
          }
        />
        <p className="text-xs text-muted-foreground">{RICHTEXT_HELP}</p>
        <FieldError errors={fieldErrors} name="stem" />
        {preview ? (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-[15px]">
            <RichText text={preview} />
          </div>
        ) : null}
      </div>

      {hasOptions ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">
            {type === "true_false"
              ? "Answer"
              : type === "matching"
                ? "Pairs"
                : type === "ordering"
                  ? "Options in the correct order"
                  : "Options"}
          </legend>
          {type === "multiple_select" ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-brand"
                checked={partialCredit}
                onChange={(e) => setPartialCredit(e.target.checked)}
              />{" "}
              Partial credit per correct option
            </label>
          ) : null}
          <div className="grid gap-2">
            {options.map((o, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_auto] items-start gap-2">
                <div className="flex h-8 items-center">
                  {type === "true_false" || type === "multiple_choice" ? (
                    <input
                      type="radio"
                      name="correct"
                      className="size-4 accent-brand"
                      checked={o.isCorrect}
                      onChange={() =>
                        setOptions(options.map((x, k) => ({ ...x, isCorrect: k === i })))
                      }
                      aria-label={`Option ${i + 1} is correct`}
                    />
                  ) : type === "multiple_select" ? (
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      checked={o.isCorrect}
                      onChange={(e) =>
                        setOptions(
                          options.map((x, k) =>
                            k === i ? { ...x, isCorrect: e.target.checked } : x
                          )
                        )
                      }
                      aria-label={`Option ${i + 1} is correct`}
                    />
                  ) : (
                    <span className="w-5 text-center text-sm text-muted-foreground tabular">
                      {i + 1}.
                    </span>
                  )}
                </div>
                <div className="grid gap-1">
                  {type === "true_false" ? (
                    <span className="flex h-8 items-center text-sm">{o.content}</span>
                  ) : (
                    <div
                      className={
                        type === "matching"
                          ? "grid gap-2 sm:grid-cols-[1fr_auto_1fr]"
                          : "grid gap-1"
                      }
                    >
                      <Input
                        value={o.content}
                        onChange={(e) =>
                          setOptions(
                            options.map((x, k) => (k === i ? { ...x, content: e.target.value } : x))
                          )
                        }
                        placeholder={type === "matching" ? "Left" : `Option ${i + 1}`}
                        aria-label={`Option ${i + 1}`}
                      />
                      {type === "matching" ? (
                        <>
                          <span className="hidden self-center text-sm text-muted-foreground sm:inline">
                            ::
                          </span>
                          <Input
                            value={o.matchText}
                            onChange={(e) =>
                              setOptions(
                                options.map((x, k) =>
                                  k === i ? { ...x, matchText: e.target.value } : x
                                )
                              )
                            }
                            placeholder="Right"
                            aria-label={`Match ${i + 1}`}
                          />
                        </>
                      ) : null}
                    </div>
                  )}
                  {type === "multiple_choice" || type === "multiple_select" ? (
                    <Input
                      value={o.feedback}
                      onChange={(e) =>
                        setOptions(
                          options.map((x, k) => (k === i ? { ...x, feedback: e.target.value } : x))
                        )
                      }
                      placeholder="Feedback if chosen (optional)"
                      className="h-7 text-xs"
                      aria-label={`Feedback for option ${i + 1}`}
                    />
                  ) : null}
                </div>
                {type !== "true_false" ? (
                  <div className="flex h-8 items-center gap-0.5">
                    {type === "ordering" ? (
                      <>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => setOptions(swap(options, i, i - 1))}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Move down"
                          disabled={i === options.length - 1}
                          onClick={() => setOptions(swap(options, i, i + 1))}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove option ${i + 1}`}
                      disabled={options.length <= 2}
                      onClick={() => setOptions(options.filter((_, k) => k !== i))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
          {type !== "true_false" && options.length < 10 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="justify-self-start"
              onClick={() =>
                setOptions([
                  ...options,
                  { content: "", isCorrect: false, feedback: "", matchText: "" },
                ])
              }
            >
              <Plus data-icon="inline-start" aria-hidden /> Add option
            </Button>
          ) : null}
          <FieldError errors={fieldErrors} name="options" />
        </fieldset>
      ) : null}

      {type === "fill_blank" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="qe-accepted">Accepted answers (one per line, case-insensitive)</Label>
          <Textarea
            id="qe-accepted"
            name="acceptedAnswers"
            rows={3}
            defaultValue={lines(cfg.acceptedAnswers)}
            placeholder={"erythrocytes\nerythrocyte"}
          />
          <FieldError errors={fieldErrors} name="acceptedAnswers" />
        </div>
      ) : null}

      {type === "short_answer" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="qe-keywords">
            Keywords for auto-grading (one per line; leave blank to grade by hand)
          </Label>
          <Textarea id="qe-keywords" name="keywords" rows={3} defaultValue={lines(cfg.keywords)} />
          <FieldError errors={fieldErrors} name="keywords" />
        </div>
      ) : null}

      {type === "numeric" ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Numeric answer</legend>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_8rem]">
            <select
              value={numeric.mode}
              onChange={(e) =>
                setNumeric({ ...numeric, mode: e.target.value as NumericState["mode"] })
              }
              className={selectClass}
              aria-label="Grading mode"
            >
              <option value="exact">Exact</option>
              <option value="tolerance">± tolerance</option>
              <option value="percent_tolerance">± percent</option>
              <option value="range">Range</option>
            </select>
            {numeric.mode === "range" ? (
              <>
                <Input
                  type="number"
                  step="any"
                  value={numeric.min}
                  onChange={(e) => setNumeric({ ...numeric, min: e.target.value })}
                  placeholder="Min"
                  aria-label="Min"
                />
                <Input
                  type="number"
                  step="any"
                  value={numeric.max}
                  onChange={(e) => setNumeric({ ...numeric, max: e.target.value })}
                  placeholder="Max"
                  aria-label="Max"
                />
              </>
            ) : (
              <>
                <Input
                  type="number"
                  step="any"
                  value={numeric.answer}
                  onChange={(e) => setNumeric({ ...numeric, answer: e.target.value })}
                  placeholder="Answer"
                  aria-label="Answer"
                />
                {numeric.mode === "tolerance" ? (
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={numeric.tolerance}
                    onChange={(e) => setNumeric({ ...numeric, tolerance: e.target.value })}
                    placeholder="± tolerance"
                    aria-label="Tolerance"
                  />
                ) : numeric.mode === "percent_tolerance" ? (
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={numeric.percent}
                    onChange={(e) => setNumeric({ ...numeric, percent: e.target.value })}
                    placeholder="± %"
                    aria-label="Percent tolerance"
                  />
                ) : (
                  <span />
                )}
              </>
            )}
            <Input
              value={numeric.unit}
              onChange={(e) => setNumeric({ ...numeric, unit: e.target.value })}
              placeholder="Unit (m/s)"
              aria-label="Unit"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            With a unit set, answers with or without that unit both match.
          </p>
          <FieldError errors={fieldErrors} name="numeric" />
        </fieldset>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="qe-points">Points</Label>
          <Input
            id="qe-points"
            name="points"
            type="number"
            min={0}
            max={100}
            defaultValue={question?.points ?? 1}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="qe-difficulty">Difficulty (1–5)</Label>
          <Input
            id="qe-difficulty"
            name="difficulty"
            type="number"
            min={1}
            max={5}
            defaultValue={question?.difficulty ?? 3}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="qe-bloom">Bloom&apos;s level</Label>
          <select
            id="qe-bloom"
            name="bloom"
            defaultValue={question?.bloom ?? ""}
            className={selectClass}
          >
            <option value="">—</option>
            {BLOOM_LEVELS.map((b) => (
              <option key={b} value={b}>
                {BLOOM_LABEL[b]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="qe-grading">Grading</Label>
          <select
            id="qe-grading"
            value={grading}
            onChange={(e) => setGrading(e.target.value as "auto" | "manual")}
            disabled={type === "extended_response"}
            className={selectClass}
          >
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="qe-unit">Unit</Label>
          <select
            id="qe-unit"
            name="unitId"
            defaultValue={question?.unitId ?? ""}
            className={selectClass}
          >
            <option value="">—</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="qe-topic">Topic</Label>
          <Input
            id="qe-topic"
            name="topic"
            defaultValue={question?.topic ?? ""}
            placeholder="Blood"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="qe-standards">Standards (comma-separated codes)</Label>
          <Input
            id="qe-standards"
            name="standardCodes"
            defaultValue={question?.standardCodes.join(", ") ?? ""}
            placeholder="HS-LS1-2"
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="qe-tags">Tags (comma-separated)</Label>
        <Input
          id="qe-tags"
          name="tags"
          defaultValue={question?.tags.join(", ") ?? ""}
          placeholder="blood, plasma"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="qe-explanation">Explanation shown after grading</Label>
        <Textarea
          id="qe-explanation"
          name="explanation"
          rows={2}
          defaultValue={question?.explanation ?? ""}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="qe-image">Image URL</Label>
          <Input
            id="qe-image"
            name="mediaUrl"
            type="url"
            defaultValue={question?.mediaUrl ?? ""}
            placeholder="https://… (upload arrives in Ticket 1.4)"
          />
          <FieldError errors={fieldErrors} name="mediaUrl" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="qe-video">Video URL (YouTube ok)</Label>
          <Input id="qe-video" name="videoUrl" type="url" defaultValue={question?.videoUrl ?? ""} />
          <FieldError errors={fieldErrors} name="videoUrl" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="qe-notes">Private notes (never shown to students)</Label>
        <Textarea id="qe-notes" name="notes" rows={2} defaultValue={question?.notes ?? ""} />
      </div>

      {error && !Object.keys(fieldErrors).length ? (
        <p
          role="alert"
          className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || (isEdit && question?.isArchived)}>
          {pending
            ? "Saving…"
            : isEdit
              ? `Save as version ${(question?.version ?? 1) + 1}`
              : "Add question"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        {isEdit ? (
          <span className="text-xs text-muted-foreground">
            Saving keeps version {question?.version} in history.
          </span>
        ) : null}
      </div>
    </form>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
