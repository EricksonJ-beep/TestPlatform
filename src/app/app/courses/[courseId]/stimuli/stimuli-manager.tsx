"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon, Music, Pencil, Plus, Trash2, Video } from "lucide-react";
import { MediaField } from "@/components/media/media-field";
import { EmptyState } from "@/components/empty-state";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";
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
import { Textarea } from "@/components/ui/textarea";
import { FieldError, useAction } from "@/components/use-action";
import type { StimulusRow } from "@/lib/queries/stimuli";
import { RICHTEXT_HELP } from "@/lib/richtext";
import type { ActionResult } from "@/lib/authz";
import { createStimulus, deleteStimulus, updateStimulus } from "./actions";

type Kind = StimulusRow["kind"];
type Editing = { mode: "new" } | { mode: "edit"; row: StimulusRow } | null;
const KIND_ICON = { text: FileText, image: ImageIcon, video: Video, audio: Music } as const;
const KIND_LABEL = {
  text: "Passage",
  image: "Image or graph",
  video: "Video",
  audio: "Audio",
} as const;

export function StimuliManager({
  courseId,
  stimuli,
  storageConfigured,
}: {
  courseId: string;
  stimuli: StimulusRow[];
  storageConfigured: boolean;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [kind, setKind] = useState<Kind>("text");
  const { run, pending, error, fieldErrors, reset } = useAction();

  function open(e: Editing) {
    setEditing(e);
    setKind(e?.mode === "edit" ? e.row.kind : "text");
  }
  function close() {
    setEditing(null);
    reset();
  }
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    fd.set("kind", kind);
    const p: Promise<ActionResult<unknown>> =
      editing.mode === "new"
        ? createStimulus(courseId, fd)
        : updateStimulus(courseId, editing.row.id, fd);
    run(p, close);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button onClick={() => open({ mode: "new" })}>
          <Plus data-icon="inline-start" aria-hidden /> New stimulus
        </Button>
        {error && !editing ? <span className="text-sm text-error-foreground">{error}</span> : null}
      </div>

      {stimuli.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={FileText}
            title="No stimuli yet"
            description="Add a passage or graph here, or import questions with a stimulus_ref column and they'll appear automatically."
          />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {stimuli.map((s) => {
            const Icon = KIND_ICON[s.kind];
            return (
              <li
                key={s.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-brand-deep" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base">{s.title || s.ref || "Untitled"}</h2>
                    <p className="text-xs text-muted-foreground">
                      {KIND_LABEL[s.kind]}
                      {s.ref ? ` · ref ${s.ref}` : ""} · {s.questions}{" "}
                      {s.questions === 1 ? "question" : "questions"}
                    </p>
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Edit"
                    onClick={() => open({ mode: "edit", row: s })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Delete"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete "${s.title || s.ref}"?`))
                        run(deleteStimulus(courseId, s.id));
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <StimulusPanel
                  stimulus={{
                    id: s.id,
                    kind: s.kind,
                    title: s.title,
                    content: s.content,
                    mediaUrl: s.mediaUrl,
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {editing?.mode === "edit" ? "Edit stimulus" : "New stimulus"}
              </DialogTitle>
              <DialogDescription>
                Students see the title and content; the ref is only for CSV imports.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr_10rem]">
                <div className="grid gap-1.5">
                  <Label htmlFor="st-kind">Kind</Label>
                  <select
                    id="st-kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as Kind)}
                    className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none"
                  >
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="st-title">Title</Label>
                  <Input
                    id="st-title"
                    name="title"
                    placeholder="Tomato growth graph"
                    defaultValue={editing?.mode === "edit" ? (editing.row.title ?? "") : ""}
                    autoFocus
                  />
                  <FieldError errors={fieldErrors} name="title" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="st-ref">CSV ref</Label>
                  <Input
                    id="st-ref"
                    name="ref"
                    placeholder="tomato-graph"
                    defaultValue={editing?.mode === "edit" ? (editing.row.ref ?? "") : ""}
                  />
                  <FieldError errors={fieldErrors} name="ref" />
                </div>
              </div>
              {kind !== "text" ? (
                <div className="grid gap-1.5">
                  <MediaField
                    name="mediaUrl"
                    label={KIND_LABEL[kind]}
                    kind={kind}
                    defaultUrl={editing?.mode === "edit" ? editing.row.mediaUrl : null}
                    storageConfigured={storageConfigured}
                  />
                  <FieldError errors={fieldErrors} name="mediaUrl" />
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="st-content">
                  {kind === "text" ? "Passage" : "Caption (optional)"}
                </Label>
                <Textarea
                  id="st-content"
                  name="content"
                  rows={kind === "text" ? 8 : 2}
                  defaultValue={editing?.mode === "edit" ? (editing.row.content ?? "") : ""}
                />
                <p className="text-xs text-muted-foreground">{RICHTEXT_HELP}</p>
                <FieldError errors={fieldErrors} name="content" />
              </div>
            </div>
            {error && !Object.keys(fieldErrors).length ? (
              <p
                role="alert"
                className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
              >
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {editing?.mode === "edit" ? "Save" : "Add stimulus"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
