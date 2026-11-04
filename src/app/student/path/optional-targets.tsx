"use client";

import { useAction } from "@/components/use-action";
import { setQuizCorrectionsOptIn } from "../actions";
import { setRelearningTargetAdded } from "../relearning/actions";

/**
 * A quiz's 80%+ targets (Q2, decision 31): fix the missed questions to raise one to 90%, or also
 * relearn it in the same activity and check to reach 100%. Adding to the relearning happens on the
 * Read · Watch · Do picker until the activity starts, then here.
 */
export function OptionalTargets({
  assignmentId,
  targets,
  relearningStarted,
}: {
  assignmentId: string;
  targets: { id: string; code: string; percent: number; correcting: boolean; added: boolean }[];
  relearningStarted: boolean;
}) {
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm" data-optional-targets>
      <p className="font-medium">Want more points on the targets you already passed?</p>
      {targets.map((t) => (
        <div key={t.id} className="flex flex-col gap-1" data-optional-target={t.code}>
          {t.percent < 90 ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-[var(--brand)]"
                checked={t.correcting || t.added}
                disabled={pending || t.added}
                onChange={(e) => run(setQuizCorrectionsOptIn(assignmentId, t.id, e.target.checked))}
              />
              <span>
                Fix my mistakes on <span className="font-medium">{t.code}</span> ({t.percent}%) to
                raise it to 90%.
              </span>
            </label>
          ) : null}
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="size-5 accent-[var(--brand)]"
              checked={t.added}
              disabled={pending || !relearningStarted}
              onChange={(e) => run(setRelearningTargetAdded(assignmentId, t.id, e.target.checked))}
            />
            <span>
              Add <span className="font-medium">{t.code}</span> ({t.percent}%) to your relearning to
              reach 100%. <span className="text-muted-foreground">Adds about 3–5 minutes.</span>
              {!relearningStarted ? (
                <span className="block text-xs text-muted-foreground">
                  You can tick this when you pick Read, Watch or Do.
                </span>
              ) : null}
            </span>
          </label>
        </div>
      ))}
      {error ? <p className="text-xs text-error-foreground">{error}</p> : null}
    </div>
  );
}
