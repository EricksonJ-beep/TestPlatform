"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from "lucide-react";
import { cn } from "cn";
import { HOSTED_ACTIVITY_PAGES } from "@/lib/hosted-activities";
import type { RelearningMode } from "@/lib/relearning";
import {
  BODY_LABEL,
  blankCheck,
  formatClock,
  nextId,
  parseClock,
  youtubeIdFrom,
  youtubeStartFrom,
  type BodyType,
  type CheckForm,
  type SectionForm,
} from "@/lib/relearning-editor";
import { Prose } from "@/app/student/relearning/[assignmentId]/relearning-activity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const selectClass =
  "h-8 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const BODY_TYPES: BodyType[] = ["text", "video", "flashcards", "worked_steps", "interactive"];
const RICH_HINT = "**bold**, *italic*, H_{2}O, 10^{3}, $math$";

/** One section: its header (part, title, type, minutes, order), its body, checks and short answer. */
export function SectionEditor({
  number,
  section: s,
  mode,
  first,
  last,
  allCheckIds,
  uploaded,
  onChange,
  onMove,
  onRemove,
}: {
  number: number;
  section: SectionForm;
  mode: RelearningMode;
  first: boolean;
  last: boolean;
  allCheckIds: string[];
  /** Plays Jon's own recording (A6) instead of YouTube. */
  uploaded: boolean;
  onChange: (next: SectionForm) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<SectionForm>) => onChange({ ...s, ...patch });
  const label = `Section ${number}`;
  const addCheck = () =>
    set({
      checks: [
        ...s.checks,
        blankCheck(
          nextId("q", allCheckIds),
          s.type === "flashcards" ? "multiple_choice" : undefined
        ),
      ],
    });
  return (
    <article
      className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-3 sm:px-4"
      aria-label={label}
      data-section-editor={number}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-deep tabular"
          aria-hidden
        >
          {number}
        </span>
        <Input
          value={s.title}
          placeholder={s.part === "core" ? "The key idea" : "Go further"}
          aria-label={`${label} title`}
          maxLength={200}
          className="min-w-40 flex-1"
          onChange={(e) => set({ title: e.target.value })}
        />
        <select
          value={s.type}
          aria-label={`${label} type`}
          className={selectClass}
          onChange={(e) => set({ type: e.target.value as BodyType })}
          data-field="type"
        >
          {BODY_TYPES.filter(
            (t) => t !== "interactive" || s.type === "interactive" || mode === "do"
          ).map((t) => (
            <option key={t} value={t}>
              {BODY_LABEL[t]}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Input
            value={s.minutes}
            inputMode="numeric"
            aria-label={`${label} minutes`}
            className="w-12 text-center tabular"
            onChange={(e) => set({ minutes: e.target.value })}
          />
          min
        </label>
        <select
          value={s.part}
          aria-label={`${label} part`}
          className={selectClass}
          onChange={(e) => set({ part: e.target.value as SectionForm["part"] })}
        >
          <option value="core">Core</option>
          <option value="extension">Extension</option>
        </select>
        <span className="ml-auto inline-flex items-center">
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label={`Move ${label.toLowerCase()} up`}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label={`Move ${label.toLowerCase()} down`}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onRemove}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="text-muted-foreground hover:text-error-foreground"
          >
            <Trash2 aria-hidden />
          </Button>
        </span>
      </header>

      {s.type === "text" ? <TextBody s={s} set={set} label={label} /> : null}
      {s.type === "video" ? <VideoBody s={s} set={set} label={label} uploaded={uploaded} /> : null}
      {s.type === "flashcards" ? <CardsBody s={s} set={set} label={label} /> : null}
      {s.type === "worked_steps" ? <StepsBody s={s} set={set} label={label} /> : null}
      {s.type === "interactive" ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hosted page</span>
          <select
            value={s.page}
            className={selectClass}
            onChange={(e) => set({ page: e.target.value })}
          >
            <option value="">Pick a page</option>
            {HOSTED_ACTIVITY_PAGES.map((p) => (
              <option key={p.path} value={p.path}>
                {p.title}
              </option>
            ))}
            {s.page && !HOSTED_ACTIVITY_PAGES.some((p) => p.path === s.page) ? (
              <option value={s.page}>{s.page}</option>
            ) : null}
          </select>
        </label>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          Quick checks{" "}
          <span className="font-normal text-muted-foreground tabular">{s.checks.length}</span>
        </h3>
        {s.checks.map((c, i) => (
          <CheckEditor
            key={c.id}
            check={c}
            index={i}
            section={s}
            onChange={(next) => set({ checks: s.checks.map((x) => (x.id === c.id ? next : x)) })}
            onRemove={() => set({ checks: s.checks.filter((x) => x.id !== c.id) })}
          />
        ))}
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={addCheck}
          data-add-check
        >
          <Plus data-icon="inline-start" aria-hidden />
          Check
        </Button>
      </div>

      {s.part === "extension" || s.shortAnswer ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Short answer{" "}
            <span className="font-normal text-muted-foreground">
              (optional; one per option, in the extension)
            </span>
          </span>
          <Input
            value={s.shortAnswer}
            maxLength={1000}
            placeholder="A question students answer in a full sentence"
            onChange={(e) => set({ shortAnswer: e.target.value })}
            data-field="short-answer"
          />
        </label>
      ) : null}
    </article>
  );
}

type BodyProps = { s: SectionForm; set: (p: Partial<SectionForm>) => void; label: string };

function TextBody({ s, set, label }: BodyProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="font-medium">Reading</span>
          <span className="text-xs text-muted-foreground">
            {RICH_HINT} · blank line = paragraph
          </span>
        </span>
        <Textarea
          value={s.text}
          aria-label={`${label} reading`}
          className="min-h-56 font-mono text-[13px] leading-relaxed"
          onChange={(e) => set({ text: e.target.value })}
          data-field="text"
        />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-muted-foreground">Preview</span>
        <div
          className="max-h-96 min-h-24 overflow-y-auto rounded-lg border border-border bg-background px-3 py-3"
          data-text-preview
        >
          {s.text.trim() ? (
            <Prose text={s.text} />
          ) : (
            <p className="text-muted-foreground">The reading shows here as students see it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ClockInput({
  value,
  onChange,
  label,
  placeholder = "m:ss",
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const bad = value.trim() !== "" && parseClock(value) === null;
  return (
    <Input
      value={value}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={bad || undefined}
      inputMode="numeric"
      className="w-20 tabular"
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const sec = parseClock(value);
        if (sec !== null && value.trim()) onChange(formatClock(sec));
      }}
    />
  );
}

function VideoBody({ s, set, label, uploaded }: BodyProps & { uploaded: boolean }) {
  const id = youtubeIdFrom(s.video);
  return (
    <div className="flex flex-col gap-2 text-sm">
      {uploaded ? (
        <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
          Plays your uploaded recording. The YouTube link below is the fallback.
        </p>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="font-medium">YouTube link or id</span>
        <Input
          value={s.video}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label={`${label} YouTube link`}
          aria-invalid={(s.video.trim() !== "" && !id) || undefined}
          onChange={(e) => {
            const v = e.target.value;
            const start = youtubeStartFrom(v);
            set({ video: v, ...(start !== null && !s.start ? { start: formatClock(start) } : {}) });
          }}
          onBlur={() => {
            if (id && id !== s.video) set({ video: id });
          }}
          data-field="video"
        />
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs text-muted-foreground tabular" data-video-id>
          {id ? (
            <span className="inline-flex items-center gap-1 text-success-foreground">
              <Check className="size-3.5" aria-hidden /> {id}
            </span>
          ) : s.video.trim() ? (
            <span className="text-error-foreground">Not a YouTube link</span>
          ) : (
            "Play it on a student account first (Restricted Mode)."
          )}
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="text-muted-foreground">Clip</span>
          <ClockInput
            value={s.start}
            onChange={(v) => set({ start: v })}
            label={`${label} start`}
            placeholder="start"
          />
          <span aria-hidden>–</span>
          <ClockInput
            value={s.end}
            onChange={(v) => set({ end: v })}
            label={`${label} end`}
            placeholder="end"
          />
        </span>
      </div>
    </div>
  );
}

function RowList<T extends { id: string }>({
  rows,
  onChange,
  prefix,
  blank,
  noun,
  render,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  prefix: string;
  blank: (id: string) => T;
  noun: string;
  render: (row: T, i: number, update: (patch: Partial<T>) => void) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-start gap-2">
          <span className="mt-1.5 w-5 shrink-0 text-right text-xs text-muted-foreground tabular">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            {render(r, i, (patch) =>
              onChange(rows.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
            )}
          </div>
          <span className="inline-flex shrink-0">
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={i === 0}
              aria-label={`Move ${noun} ${i + 1} up`}
              onClick={() => {
                const next = [...rows];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onChange(next);
              }}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${noun} ${i + 1}`}
              className="text-muted-foreground hover:text-error-foreground"
              onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
            >
              <X aria-hidden />
            </Button>
          </span>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="self-start text-brand-deep"
        onClick={() =>
          onChange([
            ...rows,
            blank(
              nextId(
                prefix,
                rows.map((r) => r.id)
              )
            ),
          ])
        }
      >
        <Plus data-icon="inline-start" aria-hidden />
        {noun.charAt(0).toUpperCase() + noun.slice(1)}
      </Button>
    </div>
  );
}

function CardsBody({ s, set, label }: BodyProps) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        Cards <span className="font-normal text-muted-foreground">front · back</span>
      </span>
      <RowList
        rows={s.cards}
        onChange={(cards) => set({ cards })}
        prefix="k"
        blank={(id) => ({ id, front: "", back: "" })}
        noun="card"
        render={(c, i, update) => (
          <div className="grid gap-1.5 sm:grid-cols-[1fr_2fr]">
            <Input
              value={c.front}
              placeholder="Front"
              aria-label={`${label} card ${i + 1} front`}
              onChange={(e) => update({ front: e.target.value })}
            />
            <Input
              value={c.back}
              placeholder="Back"
              aria-label={`${label} card ${i + 1} back`}
              onChange={(e) => update({ back: e.target.value })}
            />
          </div>
        )}
      />
    </div>
  );
}

function StepsBody({ s, set, label }: BodyProps) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Problem</span>
        <Textarea
          value={s.problem}
          aria-label={`${label} problem`}
          className="min-h-16"
          onChange={(e) => set({ problem: e.target.value })}
        />
      </label>
      <span className="font-medium">
        Steps <span className="font-normal text-muted-foreground">shown one at a time</span>
      </span>
      <RowList
        rows={s.steps}
        onChange={(steps) => set({ steps })}
        prefix="s"
        blank={(id) => ({ id, text: "" })}
        noun="step"
        render={(st, i, update) => (
          <Textarea
            value={st.text}
            aria-label={`${label} step ${i + 1}`}
            className="min-h-10"
            rows={2}
            onChange={(e) => update({ text: e.target.value })}
          />
        )}
      />
    </div>
  );
}

function CheckEditor({
  check: c,
  index,
  section: s,
  onChange,
  onRemove,
}: {
  check: CheckForm;
  index: number;
  section: SectionForm;
  onChange: (next: CheckForm) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<CheckForm>) => onChange({ ...c, ...patch });
  const label = `Check ${index + 1}`;
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-3 text-sm"
      data-check-editor={c.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground tabular">{index + 1}</span>
        <select
          value={c.kind}
          aria-label={`${label} kind`}
          className={selectClass}
          onChange={(e) => {
            const kind = e.target.value as CheckForm["kind"];
            const fill = kind === "multiple_choice" && c.options.length < 2;
            set({ kind, ...(fill ? { options: blankCheck(c.id).options, answer: "a" } : {}) });
          }}
        >
          <option value="multiple_choice">Multiple choice</option>
          <option value="fill_blank">Fill in</option>
        </select>
        {s.type === "video" ? (
          <label className="inline-flex items-center gap-1.5 text-muted-foreground">
            Pause at
            <ClockInput
              value={c.at}
              onChange={(v) => set({ at: v })}
              label={`${label} pause time`}
              placeholder="end"
            />
          </label>
        ) : null}
        {s.type === "worked_steps" ? (
          <label className="inline-flex items-center gap-1.5 text-muted-foreground">
            After
            <select
              value={c.afterStepId}
              aria-label={`${label} follows step`}
              className={selectClass}
              onChange={(e) => set({ afterStepId: e.target.value })}
            >
              <option value="">the last step</option>
              {s.steps.map((st, i) => (
                <option key={st.id} value={st.id}>
                  step {i + 1}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto text-muted-foreground hover:text-error-foreground"
          aria-label={`Remove ${label.toLowerCase()}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <Input
        value={c.prompt}
        placeholder="Question"
        aria-label={`${label} question`}
        onChange={(e) => set({ prompt: e.target.value })}
        data-field="prompt"
      />
      {c.kind === "multiple_choice" ? (
        <div
          className="grid gap-1.5 sm:grid-cols-2"
          role="radiogroup"
          aria-label={`${label} options`}
        >
          {c.options.map((o, i) => {
            const right = c.answer === o.id;
            return (
              <div key={o.id} className="flex items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={right}
                  aria-label={`Option ${i + 1} is the right answer`}
                  title="Mark as the right answer"
                  onClick={() => set({ answer: o.id })}
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full border outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    right
                      ? "border-success bg-success text-white"
                      : "border-input text-transparent hover:border-success"
                  )}
                >
                  <Check className="size-4" aria-hidden />
                </button>
                <Input
                  value={o.text}
                  placeholder={`Option ${i + 1}`}
                  aria-label={`${label} option ${i + 1}`}
                  onChange={(e) =>
                    set({
                      options: c.options.map((x) =>
                        x.id === o.id ? { ...x, text: e.target.value } : x
                      ),
                    })
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove option ${i + 1}`}
                  className="text-muted-foreground"
                  disabled={c.options.length <= 2}
                  onClick={() => set({ options: c.options.filter((x) => x.id !== o.id) })}
                >
                  <X aria-hidden />
                </Button>
              </div>
            );
          })}
          {c.options.length < 6 ? (
            <Button
              size="sm"
              variant="ghost"
              className="self-start justify-self-start text-brand-deep sm:col-span-2"
              onClick={() =>
                set({
                  options: [
                    ...c.options,
                    {
                      id:
                        "abcdefghij".split("").find((l) => !c.options.some((o) => o.id === l)) ??
                        `o${c.options.length}`,
                      text: "",
                    },
                  ],
                })
              }
            >
              <Plus data-icon="inline-start" aria-hidden />
              Option
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">
            Accepted answers (case, spaces and a final period don&apos;t matter)
          </span>
          {c.accepted.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={a}
                placeholder={i === 0 ? "2" : "two"}
                aria-label={`${label} accepted answer ${i + 1}`}
                onChange={(e) =>
                  set({ accepted: c.accepted.map((x, j) => (j === i ? e.target.value : x)) })
                }
              />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove accepted answer ${i + 1}`}
                className="text-muted-foreground"
                disabled={c.accepted.length <= 1}
                onClick={() => set({ accepted: c.accepted.filter((_, j) => j !== i) })}
              >
                <X aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="self-start text-brand-deep"
            onClick={() => set({ accepted: [...c.accepted, ""] })}
          >
            <Plus data-icon="inline-start" aria-hidden />
            Answer
          </Button>
        </div>
      )}
      <Textarea
        value={c.explanation}
        placeholder="Explanation, shown once it's right (optional)"
        aria-label={`${label} explanation`}
        rows={2}
        className="min-h-9"
        onChange={(e) => set({ explanation: e.target.value })}
      />
    </div>
  );
}
