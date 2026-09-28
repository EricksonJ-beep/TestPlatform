"use client";

import { KIND_LABEL } from "@/lib/practice-rules";
import type { PinRow } from "@/lib/queries/practice";
import { TargetChip } from "@/components/targets/target-chip";
import { useAction } from "@/components/use-action";
import { setAssignmentPin } from "../../actions";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Content = {
  sets: { id: string; title: string; targetIds: string[] }[];
  activities: { id: string; title: string; kind: keyof typeof KIND_LABEL; targetIds: string[] }[];
};

/** One row per target: an activity select and a practice-set select, "Any tagged item" by default. */
export function PinsForm({
  assignmentId,
  targets,
  content,
  pins,
}: {
  assignmentId: string;
  targets: { id: string; code: string; title: string }[];
  content: Content;
  pins: PinRow[];
}) {
  const { run, pending, error } = useAction();
  const pinFor = (targetId: string) => pins.find((p) => p.learningTargetId === targetId);
  return (
    <div className="rounded-lg border border-border bg-card">
      {error ? (
        <p
          role="alert"
          className="m-3 rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {targets.map((t) => {
          const pin = pinFor(t.id);
          const acts = content.activities.filter((a) => a.targetIds.includes(t.id));
          const sets = content.sets.filter((s) => s.targetIds.includes(t.id));
          const save = (patch: { activityId?: string | null; practiceSetId?: string | null }) =>
            run(
              setAssignmentPin(assignmentId, {
                learningTargetId: t.id,
                activityId:
                  patch.activityId === undefined ? (pin?.activityId ?? null) : patch.activityId,
                practiceSetId:
                  patch.practiceSetId === undefined
                    ? (pin?.practiceSetId ?? null)
                    : patch.practiceSetId,
              })
            );
          return (
            <li
              key={t.id}
              className="grid gap-3 px-4 py-3 md:grid-cols-[12rem_1fr_1fr]"
              data-pin={t.code}
            >
              <div className="flex items-start">
                <TargetChip code={t.code} title={t.title} />
              </div>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Activity
                <select
                  className={selectClass}
                  value={pin?.activityId ?? ""}
                  disabled={pending}
                  onChange={(e) => save({ activityId: e.target.value || null })}
                  aria-label={`${t.code} activity`}
                >
                  <option value="">
                    {acts.length === 0
                      ? "None published yet (gate stays open)"
                      : `Any of ${acts.length} tagged`}
                  </option>
                  {acts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} · {KIND_LABEL[a.kind]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Practice set
                <select
                  className={selectClass}
                  value={pin?.practiceSetId ?? ""}
                  disabled={pending}
                  onChange={(e) => save({ practiceSetId: e.target.value || null })}
                  aria-label={`${t.code} practice set`}
                >
                  <option value="">
                    {sets.length === 0
                      ? "None published yet (gate stays open)"
                      : `Any of ${sets.length} tagged`}
                  </option>
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
