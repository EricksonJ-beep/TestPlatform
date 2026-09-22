"use client";

import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { cn } from "cn";
import type { Answer } from "@/lib/grading";
import type { StudentQuestion } from "@/lib/queries/attempts";
import { RichText } from "@/components/rich-text";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** True when the answer would count as something other than blank. */
export function isAnswered(a: Answer): boolean {
  if (!a) return false;
  switch (a.kind) {
    case "choice":
      return !!a.optionId;
    case "multi":
      return a.optionIds.length > 0;
    case "text":
      return a.text.trim().length > 0;
    case "match":
      return Object.values(a.pairs).some((v) => v);
    case "order":
      return a.optionIds.length > 0;
  }
}

const row =
  "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-[15px] leading-snug transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const rowIdle = "border-border bg-card hover:border-brand/50";
const rowOn = "border-brand bg-brand-soft ring-2 ring-brand/40";

/** Large tappable answer rows (PLAN.md §5 screen 3) with an unmistakable selected state. */
export function AnswerInput({
  question: q,
  answer,
  onChange,
}: {
  question: StudentQuestion;
  answer: Answer;
  onChange: (a: Answer) => void;
}) {
  if (q.type === "multiple_choice" || q.type === "true_false") {
    const chosen = answer?.kind === "choice" ? answer.optionId : null;
    return (
      <div role="radiogroup" aria-label="Answer choices" className="grid gap-2">
        {q.options.map((o, i) => {
          const on = chosen === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={cn(row, on ? rowOn : rowIdle)}
              onClick={() => onChange({ kind: "choice", optionId: on ? null : o.id })}
            >
              <span
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular",
                  on ? "border-brand bg-brand text-white" : "border-border text-muted-foreground"
                )}
              >
                {on ? <Check className="size-4" aria-hidden /> : String.fromCharCode(65 + i)}
              </span>
              <RichText text={o.content} />
            </button>
          );
        })}
      </div>
    );
  }

  if (q.type === "multiple_select") {
    const chosen = new Set(answer?.kind === "multi" ? answer.optionIds : []);
    return (
      <div role="group" aria-label="Select all that apply" className="grid gap-2">
        <p className="text-xs text-muted-foreground">Select all that apply.</p>
        {q.options.map((o, i) => {
          const on = chosen.has(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              className={cn(row, on ? rowOn : rowIdle)}
              onClick={() => {
                const next = new Set(chosen);
                if (on) next.delete(o.id);
                else next.add(o.id);
                onChange({
                  kind: "multi",
                  optionIds: q.options.map((x) => x.id).filter((id) => next.has(id)),
                });
              }}
            >
              <span
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-sm font-semibold tabular",
                  on ? "border-brand bg-brand text-white" : "border-border text-muted-foreground"
                )}
              >
                {on ? <Check className="size-4" aria-hidden /> : String.fromCharCode(65 + i)}
              </span>
              <RichText text={o.content} />
            </button>
          );
        })}
      </div>
    );
  }

  if (q.type === "numeric") {
    const text = answer?.kind === "text" ? answer.text : "";
    return (
      <div className="flex items-center gap-2">
        <Input
          aria-label="Your answer"
          inputMode="decimal"
          className="h-12 w-56 text-lg"
          value={text}
          placeholder="Enter a number"
          onChange={(e) => onChange({ kind: "text", text: e.target.value })}
        />
        {q.unit ? <span className="text-sm text-muted-foreground">{q.unit}</span> : null}
      </div>
    );
  }

  if (q.type === "fill_blank" || q.type === "short_answer") {
    const text = answer?.kind === "text" ? answer.text : "";
    return (
      <Input
        aria-label="Your answer"
        className="h-12 max-w-xl text-lg"
        value={text}
        placeholder="Type your answer"
        autoComplete="off"
        onChange={(e) => onChange({ kind: "text", text: e.target.value })}
      />
    );
  }

  if (q.type === "extended_response") {
    const text = answer?.kind === "text" ? answer.text : "";
    return (
      <Textarea
        aria-label="Your response"
        rows={8}
        className="text-[15px]"
        value={text}
        placeholder="Write your response"
        onChange={(e) => onChange({ kind: "text", text: e.target.value })}
      />
    );
  }

  if (q.type === "matching") {
    const pairs = answer?.kind === "match" ? answer.pairs : {};
    return (
      <ul className="grid gap-2">
        {q.options.map((o) => (
          <li
            key={o.id}
            className="grid items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 sm:grid-cols-[1fr_auto_1fr]"
          >
            <RichText text={o.content} />
            <span className="hidden text-muted-foreground sm:inline">→</span>
            <select
              aria-label={`Match for ${o.content}`}
              className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
              value={pairs[o.id] ?? ""}
              onChange={(e) =>
                onChange({ kind: "match", pairs: { ...pairs, [o.id]: e.target.value } })
              }
            >
              <option value="">Choose…</option>
              {q.choices.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    );
  }

  if (q.type === "ordering") {
    const order =
      answer?.kind === "order" && answer.optionIds.length === q.options.length
        ? answer.optionIds
        : q.options.map((o) => o.id);
    const byId = new Map(q.options.map((o) => [o.id, o]));
    const move = (i: number, d: -1 | 1) => {
      const j = i + d;
      if (j < 0 || j >= order.length) return;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      onChange({ kind: "order", optionIds: next });
    };
    return (
      <ol className="grid gap-2">
        <p className="text-xs text-muted-foreground">Put these in order, first at the top.</p>
        {order.map((id, i) => (
          <li
            key={id}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span className="w-6 text-sm text-muted-foreground tabular">{i + 1}.</span>
            <span className="flex-1">
              <RichText text={byId.get(id)?.content ?? ""} />
            </span>
            <button
              type="button"
              aria-label="Move up"
              className="rounded-md p-2 hover:bg-muted disabled:opacity-30"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Move down"
              className="rounded-md p-2 hover:bg-muted disabled:opacity-30"
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">This question type isn&apos;t supported yet.</p>
  );
}
