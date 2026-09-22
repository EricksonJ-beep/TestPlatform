"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Layers, Pencil, Trash2, X } from "lucide-react";
import { TYPE_LABEL } from "@/lib/question-types";
import type { SectionDetail, SectionItem } from "@/lib/queries/assessments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichText } from "@/components/rich-text";
import { TargetChip } from "@/components/targets/target-chip";
import { FieldError, useAction } from "@/components/use-action";
import {
  deleteSection,
  moveItem,
  moveSection,
  removeItem,
  updateItem,
  updateSection,
} from "../actions";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function itemPoints(i: SectionItem) {
  return i.kind === "question" ? (i.points ?? i.question.points) : null;
}

export function SectionCard({
  assessmentId,
  section,
  index,
  count,
  targets,
  canEdit,
  summative,
}: {
  assessmentId: string;
  section: SectionDetail;
  index: number;
  count: number;
  targets: { id: string; code: string; title: string }[];
  canEdit: boolean;
  summative: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { run, pending, error, fieldErrors, reset } = useAction();
  const fixedPoints = section.items.reduce((n, i) => n + (itemPoints(i) ?? 0), 0);
  const draws = section.items.filter((i) => i.kind === "pool").length;

  return (
    <section
      className="rounded-lg border border-border bg-card"
      aria-label={`Section ${index + 1}: ${section.title}`}
    >
      <header className="flex flex-wrap items-start gap-2 border-b border-border px-3 py-2">
        {editing ? (
          <form
            className="grid flex-1 gap-2 sm:grid-cols-[1fr_1fr] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              run(updateSection(assessmentId, section.id, new FormData(e.currentTarget)), () =>
                setEditing(false)
              );
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor={`st-${section.id}`}>Title</Label>
              <Input
                id={`st-${section.id}`}
                name="title"
                defaultValue={section.title}
                required
                autoFocus
              />
              <FieldError errors={fieldErrors} name="title" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`slt-${section.id}`}>Learning target</Label>
              <select
                id={`slt-${section.id}`}
                name="learningTargetId"
                defaultValue={section.learningTargetId ?? ""}
                className={selectClass}
              >
                <option value="">No target</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`si-${section.id}`}>Instructions (optional)</Label>
              <Input
                id={`si-${section.id}`}
                name="instructions"
                defaultValue={section.instructions ?? ""}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={pending}>
                Save section
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  reset();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground tabular">{index + 1}</span>
              <h2 className="text-base font-medium">{section.title}</h2>
              {section.learningTarget ? (
                <TargetChip
                  code={section.learningTarget.code}
                  title={section.learningTarget.title}
                />
              ) : summative ? (
                <span className="rounded-md bg-coral-soft px-2 py-0.5 text-xs font-medium text-[#B93E27]">
                  No target
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground tabular">
              {section.items.length - draws} fixed · {draws} {draws === 1 ? "draw" : "draws"} ·{" "}
              {fixedPoints} fixed {fixedPoints === 1 ? "point" : "points"}
              {section.instructions ? ` · ${section.instructions}` : ""}
            </p>
          </div>
        )}
        {canEdit && !editing ? (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit section"
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move section up"
              disabled={pending || index === 0}
              onClick={() => run(moveSection(assessmentId, section.id, "up"))}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move section down"
              disabled={pending || index === count - 1}
              onClick={() => run(moveSection(assessmentId, section.id, "down"))}
            >
              <ArrowDown aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete section"
              disabled={pending}
              onClick={() => {
                if (
                  section.items.length === 0 ||
                  window.confirm(`Delete "${section.title}" and its ${section.items.length} items?`)
                )
                  run(deleteSection(assessmentId, section.id));
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ) : null}
        {error ? <p className="basis-full text-sm text-error-foreground">{error}</p> : null}
      </header>

      {section.items.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">
          Empty. Pick questions from the bank on the left, or add a pool draw.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {section.items.map((item, i) => (
            <ItemRow
              key={item.id}
              assessmentId={assessmentId}
              item={item}
              index={i}
              count={section.items.length}
              canEdit={canEdit}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function ItemRow({
  assessmentId,
  item,
  index,
  count,
  canEdit,
}: {
  assessmentId: string;
  item: SectionItem;
  index: number;
  count: number;
  canEdit: boolean;
}) {
  const { run, pending, error } = useAction();
  return (
    <li className="flex flex-wrap items-start gap-2 px-3 py-2 text-sm">
      <span className="w-5 pt-0.5 text-xs text-muted-foreground tabular">{index + 1}</span>
      <div className="min-w-0 flex-1">
        {item.kind === "question" ? (
          <>
            <RichText text={item.question.stem} className="line-clamp-2" />
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>
                {TYPE_LABEL[item.question.type as keyof typeof TYPE_LABEL] ?? item.question.type}
              </span>
              {item.question.stimulusTitle ? <span>· {item.question.stimulusTitle}</span> : null}
              {item.question.targets.map((t) => (
                <TargetChip key={t.id} code={t.code} title={t.title} className="h-5" />
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5">
              <Layers className="size-4 text-muted-foreground" aria-hidden />
              Draw{" "}
              {canEdit ? (
                <Input
                  type="number"
                  min={1}
                  max={100}
                  aria-label="Questions to draw"
                  className="h-7 w-16"
                  defaultValue={item.drawCount}
                  onBlur={(e) => {
                    const v = e.currentTarget.valueAsNumber;
                    if (Number.isInteger(v) && v !== item.drawCount)
                      run(updateItem(assessmentId, item.id, { drawCount: v }));
                  }}
                />
              ) : (
                <strong>{item.drawCount}</strong>
              )}{" "}
              from <strong>{item.pool.name}</strong>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.pool.size} live {item.pool.size === 1 ? "question" : "questions"}
              {item.pool.targets.length
                ? ` · ${item.pool.targets.map((t) => t.code).join(", ")}`
                : ""}
              {item.pool.drawStimulusGroups ? " · whole stimulus groups" : ""}
              {item.drawCount > item.pool.size ? (
                <span className="text-[#B93E27]"> · pool is smaller than the draw</span>
              ) : null}
            </p>
          </>
        )}
        {error ? <p className="mt-1 text-xs text-error-foreground">{error}</p> : null}
      </div>
      {item.kind === "question" ? (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="sr-only">Points</span>
          {canEdit ? (
            <Input
              type="number"
              min={0}
              max={100}
              aria-label="Points"
              className="h-7 w-16"
              defaultValue={item.points ?? item.question.points}
              onBlur={(e) => {
                const v = e.currentTarget.valueAsNumber;
                const current = item.points ?? item.question.points;
                if (Number.isInteger(v) && v !== current)
                  run(
                    updateItem(assessmentId, item.id, {
                      points: v === item.question.points ? null : v,
                    })
                  );
              }}
            />
          ) : (
            <span className="tabular">{item.points ?? item.question.points}</span>
          )}
          pt
        </label>
      ) : null}
      {canEdit ? (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Move up"
            disabled={pending || index === 0}
            onClick={() => run(moveItem(assessmentId, item.id, "up"))}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Move down"
            disabled={pending || index === count - 1}
            onClick={() => run(moveItem(assessmentId, item.id, "down"))}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove"
            disabled={pending}
            onClick={() => run(removeItem(assessmentId, item.id))}
          >
            <X aria-hidden />
          </Button>
        </div>
      ) : null}
    </li>
  );
}
