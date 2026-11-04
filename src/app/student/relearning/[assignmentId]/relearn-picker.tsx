"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "cn";
import { useAction } from "@/components/use-action";
import { targetList } from "@/lib/quiz-practice";
import { MODE_EMOJI, type ModeChoice, type RelearningMode } from "@/lib/relearning";
import { startRelearning } from "../actions";

/**
 * The Relearn picker (A1, A4, Q2): three big cards, Read 📖 · Watch 🎬 · Do 🧩, each with its line
 * and "About N min". On a quiz, each 80%+ target is a tick box that folds it into the same
 * activity for 100%. Picking a card starts the activity; the student can switch until they finish.
 */
export function RelearnPicker({
  assignmentId,
  targetId,
  choices,
  fallbackCodes,
  addable,
  needsPick,
}: {
  assignmentId: string;
  /** A test target (S2); null on a quiz. */
  targetId: string | null;
  choices: ModeChoice[];
  /** Per mode, the targets that use another mode because this one isn't built for them (A5). */
  fallbackCodes: Partial<Record<RelearningMode, string[]>>;
  addable: { id: string; code: string; percent: number }[];
  /** A quiz with nothing required: tick at least one target first. */
  needsPick: boolean;
}) {
  const { run, pending, error } = useAction();
  const [add, setAdd] = useState<string[]>([]);
  const blocked = needsPick && add.length === 0;

  return (
    <section className="flex flex-col gap-3" data-relearn-picker>
      <h2 className="text-base font-medium">How do you want to relearn it?</h2>
      {addable.length ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          {addable.map((t) => {
            const on = add.includes(t.id);
            return (
              <label
                key={t.id}
                className="flex min-h-11 cursor-pointer items-center gap-3"
                data-add-target={t.code}
              >
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--brand)]"
                  checked={on}
                  disabled={pending}
                  onChange={(e) =>
                    setAdd((cur) =>
                      e.target.checked ? [...cur, t.id] : cur.filter((x) => x !== t.id)
                    )
                  }
                />
                <span>
                  <span className="font-medium">
                    Add {t.code} ({t.percent}%)
                  </span>{" "}
                  to reach 100%. <span className="text-muted-foreground">Adds about 3–5 min.</span>
                </span>
              </label>
            );
          })}
          {needsPick ? (
            <p className="text-xs text-muted-foreground">Tick a target to start.</p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {choices.map((c) => {
          const borrowed = fallbackCodes[c.mode] ?? [];
          return (
            <button
              key={c.mode}
              type="button"
              disabled={pending || blocked}
              onClick={() => run(startRelearning(assignmentId, c.mode, { targetId, add }))}
              className={cn(
                "flex min-h-32 flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors",
                "hover:border-brand hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-brand",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
              data-mode={c.mode}
            >
              <span className="text-3xl" aria-hidden>
                {MODE_EMOJI[c.mode]}
              </span>
              <span className="text-base font-semibold">{c.title}</span>
              <span className="text-sm text-muted-foreground">{c.line}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-brand-deep tabular">
                <Clock className="size-3.5" aria-hidden /> About {Math.max(1, c.minutes)} min
              </span>
              {borrowed.length ? (
                <span className="text-xs text-muted-foreground">
                  {targetList(borrowed)} uses another kind (not built yet)
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        You can switch until you finish. Switching back picks up where you left off.
      </p>
      {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
    </section>
  );
}
