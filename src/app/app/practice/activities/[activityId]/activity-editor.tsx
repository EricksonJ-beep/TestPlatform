"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import {
  GUIDED_NOTES_MAX_PROMPTS,
  GUIDED_NOTES_MIN_PROMPTS,
  KIND_LABEL,
  KIND_RULE,
} from "@/lib/practice-rules";
import type { ActivityDetail } from "@/lib/queries/practice";
import { LocalTime } from "@/components/local-time";
import { MediaField } from "@/components/media/media-field";
import { TargetPicker } from "@/components/targets/target-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, useAction } from "@/components/use-action";
import {
  deleteActivity,
  setActivityPublished,
  updateActivity,
  verifyCompletion,
} from "../../actions";

type Target = { id: string; code: string; title: string };

/** Edit one relearning activity: kind-specific content, targets, publish state, and who has completed it. */
export function ActivityEditor({
  detail,
  targets,
  storageConfigured,
}: {
  detail: ActivityDetail;
  targets: Target[];
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [prompts, setPrompts] = useState<{ id: string; prompt: string }[]>(() =>
    detail.prompts && detail.prompts.length
      ? detail.prompts
      : [
          { id: "p1", prompt: "" },
          { id: "p2", prompt: "" },
        ]
  );
  const save = useAction();
  const publish = useAction();
  const verify = useAction();
  const kind = detail.kind;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl">{detail.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {KIND_LABEL[kind]} · {detail.courseName ?? "No course"} ·{" "}
            {detail.isPublished ? "Published" : "Draft"} · Complete when: {KIND_RULE[kind]}
          </p>
        </div>
        <Button
          variant={detail.isPublished ? "outline" : "default"}
          disabled={publish.pending}
          onClick={() => publish.run(setActivityPublished(detail.id, !detail.isPublished))}
        >
          {detail.isPublished ? "Unpublish" : "Publish"}
        </Button>
        {confirmDelete ? (
          <>
            <Button
              variant="destructive"
              disabled={publish.pending}
              onClick={() =>
                publish.run(deleteActivity(detail.id), () => router.push("/app/practice"))
              }
            >
              Delete for good
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete activity"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      {publish.error ? (
        <p
          role="alert"
          className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {publish.error}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.run(updateActivity(detail.id, new FormData(e.currentTarget)));
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="act-title">Title</Label>
          <Input id="act-title" name="title" defaultValue={detail.title} required />
          <FieldError errors={save.fieldErrors} name="title" />
        </div>

        {kind === "video" ? (
          <>
            <MediaField
              name="url"
              label="Video (YouTube link or upload)"
              kind="video"
              defaultUrl={detail.url}
              storageConfigured={storageConfigured}
            />
            <FieldError errors={save.fieldErrors} name="url" />
          </>
        ) : null}
        {kind === "link" ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="act-url">Link</Label>
              <Input
                id="act-url"
                name="url"
                type="url"
                defaultValue={detail.url ?? ""}
                placeholder="https://docs.google.com/… or an EdPuzzle, Slides, or site link"
                required
              />
              <FieldError errors={save.fieldErrors} name="url" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="requiresTeacherVerification"
                defaultChecked={detail.requiresTeacherVerification}
                className="size-4 accent-brand"
              />
              I&apos;ll verify each completion before it counts toward a retake
            </label>
          </>
        ) : null}
        {kind === "reading" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="act-content">Reading</Label>
            <Textarea
              id="act-content"
              name="content"
              rows={16}
              defaultValue={detail.content ?? ""}
              placeholder="Write or paste the reading. Blank lines start new paragraphs; **bold**, *italic*, and $math$ work."
              required
            />
            <FieldError errors={save.fieldErrors} name="content" />
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="act-content">
              {kind === "guided_notes"
                ? "Intro (optional)"
                : "Instructions for students (optional)"}
            </Label>
            <Textarea
              id="act-content"
              name="content"
              rows={3}
              defaultValue={detail.content ?? ""}
              placeholder={
                kind === "guided_notes"
                  ? "What to read or watch before answering the prompts."
                  : "Anything students should know before they start."
              }
            />
          </div>
        )}
        {kind === "guided_notes" ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">
              Prompts ({GUIDED_NOTES_MIN_PROMPTS}–{GUIDED_NOTES_MAX_PROMPTS}, short response)
            </legend>
            {prompts.map((p, i) => (
              <div key={p.id} className="flex items-start gap-2">
                <input type="hidden" name="promptIds" value={p.id} />
                <span className="mt-2 w-5 text-sm text-muted-foreground tabular">{i + 1}.</span>
                <Textarea
                  name="prompts"
                  rows={2}
                  defaultValue={p.prompt}
                  placeholder="Explain in your own words…"
                  aria-label={`Prompt ${i + 1}`}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove prompt"
                  disabled={prompts.length <= GUIDED_NOTES_MIN_PROMPTS}
                  onClick={() => setPrompts((ps) => ps.filter((x) => x.id !== p.id))}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              disabled={prompts.length >= GUIDED_NOTES_MAX_PROMPTS}
              onClick={() =>
                setPrompts((ps) => [...ps, { id: `p${Date.now().toString(36)}`, prompt: "" }])
              }
            >
              <Plus data-icon="inline-start" aria-hidden />
              Add prompt
            </Button>
            <FieldError errors={save.fieldErrors} name="prompts" />
          </fieldset>
        ) : null}

        <TargetPicker
          targets={targets}
          defaultSelected={detail.targets.map((t) => t.id)}
          label="Learning targets (the gate this activity satisfies)"
        />
        {save.error ? <p className="text-sm text-error-foreground">{save.error}</p> : null}
        <Button type="submit" disabled={save.pending} className="self-start">
          Save
        </Button>
      </form>

      <section className="rounded-lg border border-border bg-card">
        <h2 className="border-b border-border px-4 py-2 text-sm font-medium tabular">
          {detail.completions.length}{" "}
          {detail.completions.length === 1 ? "student has" : "students have"} completed this
        </h2>
        {verify.error ? (
          <p className="m-3 rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground">
            {verify.error}
          </p>
        ) : null}
        {detail.completions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            Completions show up here as students finish. Link activities you chose to verify list a
            Verify button.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {detail.completions.map((c) => (
              <li
                key={c.studentId}
                className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm"
                data-completion={c.studentId}
              >
                <span className="font-medium">
                  {c.lastName}, {c.firstName}
                </span>
                <span className="text-muted-foreground">
                  <LocalTime date={c.completedAt} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {kind === "video" && c.evidence?.watchPercent !== undefined
                    ? `watched ${c.evidence.watchPercent}%`
                    : kind === "guided_notes" && c.evidence?.answers
                      ? `${Object.keys(c.evidence.answers).length} prompts answered`
                      : null}
                </span>
                {kind === "guided_notes" && c.evidence?.answers ? (
                  <details className="basis-full text-xs">
                    <summary className="cursor-pointer text-brand-deep">Read their notes</summary>
                    <ol className="mt-1 grid gap-1">
                      {(detail.prompts ?? []).map((p, i) => (
                        <li key={p.id}>
                          <span className="font-medium">
                            {i + 1}. {p.prompt}
                          </span>
                          <p className="whitespace-pre-wrap text-muted-foreground">
                            {c.evidence?.answers?.[p.id] ?? "—"}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                {detail.requiresTeacherVerification ? (
                  <span className="ml-auto inline-flex items-center gap-2">
                    {c.teacherVerified ? (
                      <span className="inline-flex items-center gap-1 text-success-foreground">
                        <Check className="size-4" aria-hidden /> Verified
                      </span>
                    ) : (
                      <span className="text-warning-foreground">Not verified</span>
                    )}
                    <Button
                      size="sm"
                      variant={c.teacherVerified ? "ghost" : "outline"}
                      disabled={verify.pending}
                      onClick={() =>
                        verify.run(verifyCompletion(detail.id, c.studentId, !c.teacherVerified))
                      }
                    >
                      {c.teacherVerified ? "Undo" : "Verify"}
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
