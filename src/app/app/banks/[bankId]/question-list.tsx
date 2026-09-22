"use client";

import Link from "next/link";
import { useState } from "react";
import { Archive, ArchiveRestore, Copy, FolderInput, Pencil, Tag } from "lucide-react";
import { RichText } from "@/components/rich-text";
import { TargetChip } from "@/components/targets/target-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAction } from "@/components/use-action";
import type { BankQuestionRow, QuestionForEdit } from "@/lib/queries/banks";
import { BLOOM_LABEL, TYPE_LABEL } from "@/lib/question-types";
import {
  bulkArchive,
  bulkDuplicate,
  bulkMove,
  bulkTag,
  loadQuestionForEdit,
} from "./questions/actions";
import { QuestionEditor } from "./questions/question-editor";

function gradingSummary(q: BankQuestionRow): string | null {
  const c = (q.gradingConfig ?? {}) as Record<string, unknown>;
  switch (q.type) {
    case "fill_blank":
      return `Accepted: ${((c.acceptedAnswers as string[]) ?? []).join(" | ")}`;
    case "short_answer":
      return (c.keywords as string[])?.length
        ? `Keywords: ${(c.keywords as string[]).join(" | ")}`
        : "Graded by hand";
    case "numeric": {
      const unit = c.unit ? ` ${c.unit}` : "";
      if (c.mode === "range") return `Answer: ${c.min}–${c.max}${unit}`;
      if (c.mode === "tolerance") return `Answer: ${c.answer}${unit} ± ${c.tolerance}`;
      if (c.mode === "percent_tolerance") return `Answer: ${c.answer}${unit} ± ${c.percent}%`;
      return `Answer: ${c.answer}${unit}`;
    }
    case "extended_response":
      return "Graded by hand";
    default:
      return null;
  }
}

export type ListEditorProps = {
  targets: { id: string; code: string; title: string }[];
  units: { id: string; name: string }[];
  moveTargets: { id: string; name: string }[];
  storageConfigured: boolean;
};

/** Question list with selection, bulk actions, and a slide-in editor. */
export function QuestionList({
  bankId,
  questions,
  canEdit,
  archivedView,
  editor,
}: {
  bankId: string;
  questions: BankQuestionRow[];
  canEdit: boolean;
  archivedView: boolean;
  editor: ListEditorProps;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<QuestionForEdit | null>(null);
  const [dialog, setDialog] = useState<"tag" | "move" | null>(null);
  const { run, pending, error } = useAction();
  const ids = [...selected];
  const allSelected = questions.length > 0 && selected.size === questions.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(questions.map((q) => q.id)));
  }
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  async function openEditor(id: string) {
    const r = await loadQuestionForEdit(bankId, id);
    if (r.ok && r.data) setEditing(r.data);
  }
  const done = () => setSelected(new Set());

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all"
            />
            <span className="text-muted-foreground tabular">{selected.size} selected</span>
          </label>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            size="sm"
            variant="outline"
            disabled={!ids.length || pending}
            onClick={() => setDialog("tag")}
          >
            <Tag data-icon="inline-start" aria-hidden /> Tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!ids.length || pending || !editor.moveTargets.length}
            onClick={() => setDialog("move")}
            title={
              editor.moveTargets.length ? undefined : "No other bank on this course to move to"
            }
          >
            <FolderInput data-icon="inline-start" aria-hidden /> Move
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!ids.length || pending}
            onClick={() => run(bulkDuplicate(bankId, ids), done)}
          >
            <Copy data-icon="inline-start" aria-hidden /> Duplicate
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!ids.length || pending}
            onClick={() => run(bulkArchive(bankId, ids, !archivedView), done)}
          >
            {archivedView ? (
              <ArchiveRestore data-icon="inline-start" aria-hidden />
            ) : (
              <Archive data-icon="inline-start" aria-hidden />
            )}
            {archivedView ? "Restore" : "Archive"}
          </Button>
          {error ? <span className="ml-2 text-error-foreground">{error}</span> : null}
        </div>
      ) : null}

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {questions.map((q) => {
          const summary = gradingSummary(q);
          return (
            <li key={q.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 text-sm hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                  {canEdit ? (
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-brand"
                      checked={selected.has(q.id)}
                      onChange={() => toggle(q.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Select question"
                    />
                  ) : null}
                  <Badge variant="secondary" className="mt-0.5 shrink-0">
                    {TYPE_LABEL[q.type]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <RichText text={q.stem} as="p" className="line-clamp-2" />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {q.targets.map((t) => (
                        <TargetChip key={t.id} code={t.code} title={t.title} />
                      ))}
                      {q.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs leading-5 text-muted-foreground tabular">
                    <div>
                      {q.points} {q.points === 1 ? "pt" : "pts"}
                    </div>
                    <div>
                      D{q.difficulty}
                      {q.bloom ? ` · ${BLOOM_LABEL[q.bloom]}` : ""}
                    </div>
                  </div>
                  {canEdit && !archivedView ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Edit question"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void openEditor(q.id);
                      }}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  ) : null}
                </summary>
                <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                  {q.options.length ? (
                    <ol className="mb-2 grid gap-1">
                      {q.options.map((o, i) => (
                        <li
                          key={i}
                          className={o.isCorrect ? "font-medium text-success-foreground" : ""}
                        >
                          <span className="mr-2 tabular">{String.fromCharCode(97 + i)}.</span>
                          <RichText text={o.content} />
                          {o.matchText ? (
                            <span className="text-muted-foreground"> :: {o.matchText}</span>
                          ) : null}
                          {o.correctPosition ? (
                            <span className="text-muted-foreground">
                              {" "}
                              (position {o.correctPosition})
                            </span>
                          ) : null}
                          {o.isCorrect ? " ✓" : ""}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {summary ? <p className="mb-1">{summary}</p> : null}
                  {q.explanation ? (
                    <p className="mb-1">
                      <span className="font-medium">Explanation:</span>{" "}
                      <RichText text={q.explanation} />
                    </p>
                  ) : null}
                  {q.mediaUrl ? <p className="truncate">Image: {q.mediaUrl}</p> : null}
                  {q.videoUrl ? <p className="truncate">Video: {q.videoUrl}</p> : null}
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs">
                    <span>
                      {[
                        q.topic,
                        q.stimulusRef ? `Stimulus: ${q.stimulusRef}` : null,
                        q.externalId ? `ID ${q.externalId}` : null,
                        `v${q.version}`,
                        q.grading === "manual" ? "manual grading" : "auto-graded",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {canEdit ? (
                      <Link
                        href={`/app/banks/${bankId}/questions/${q.id}`}
                        className="font-medium text-brand-deep hover:underline"
                      >
                        Open full editor and history
                      </Link>
                    ) : null}
                  </p>
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Edit question</SheetTitle>
            <SheetDescription>
              Saving creates version {(editing?.version ?? 1) + 1}; the current one stays in
              history.
            </SheetDescription>
          </SheetHeader>
          {editing ? (
            <div className="px-4 pb-6">
              <QuestionEditor
                key={editing.id}
                bankId={bankId}
                question={editing}
                targets={editor.targets}
                units={editor.units}
                storageConfigured={editor.storageConfigured}
                compact
                onSaved={() => setEditing(null)}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={dialog === "tag"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const tags = String(new FormData(e.currentTarget).get("tags") ?? "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              run(bulkTag(bankId, ids, tags), () => {
                setDialog(null);
                done();
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>
                Tag {ids.length} question{ids.length === 1 ? "" : "s"}
              </DialogTitle>
              <DialogDescription>Tags are added; existing tags stay.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="bt-tags">Tags (comma-separated)</Label>
              <Input id="bt-tags" name="tags" placeholder="review, unit-3" autoFocus required />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Add tags
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "move"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const to = String(new FormData(e.currentTarget).get("toBankId") ?? "");
              run(bulkMove(bankId, ids, to), () => {
                setDialog(null);
                done();
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>
                Move {ids.length} question{ids.length === 1 ? "" : "s"}
              </DialogTitle>
              <DialogDescription>
                Only banks on the same course are listed, so targets and pools stay valid.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="bm-bank">Destination bank</Label>
              <select
                id="bm-bank"
                name="toBankId"
                className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none"
                required
              >
                {editor.moveTargets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Move
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
