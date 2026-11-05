"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Eye, PencilLine, Plus, RotateCcw, TriangleAlert, Users } from "lucide-react";
import { cn } from "cn";
import type { QuickCheck } from "@/db/schema";
import {
  MODE_EMOJI,
  MODE_LABEL,
  MODE_LINE,
  publicCheck,
  type RelearningMode,
} from "@/lib/relearning";
import {
  blankSection,
  DEFAULT_BODY,
  formToPack,
  nextId,
  orderedSections,
  type OptionForm,
  type SectionForm,
} from "@/lib/relearning-editor";
import type { EditorTarget } from "@/lib/queries/relearning-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/use-action";
import {
  RelearningActivity,
  type ActivityRow,
} from "@/app/student/relearning/[assignmentId]/relearning-activity";
import { createRelearningOption, updateRelearningOption } from "./actions";
import { SectionEditor } from "./section-editor";

const PART_HINT = { core: "about 3–5 min", extension: "about 5–10 min" } as const;

/**
 * The Read · Watch · Do editor (Nov 5 2026): the picker card (title, one line, published), then
 * the core and extension sections in order, each with its body, quick checks and (extension) the
 * short answer. Save validates the same way the server does; "Preview as student" renders the
 * unsaved form with the student's own component, graded in the browser.
 */
export function OptionEditor({
  optionId,
  target,
  mode,
  initial,
  editedAt,
  inProgress,
  mediaUrls,
}: {
  optionId: string | null;
  target: EditorTarget;
  mode: RelearningMode;
  initial: OptionForm;
  editedAt: string | null;
  inProgress: number;
  mediaUrls: Record<string, string>;
}) {
  const router = useRouter();
  const [form, setForm] = useState<OptionForm>(initial);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [showIssues, setShowIssues] = useState(false);
  const { pack, issues } = useMemo(() => formToPack(form, target.code, mode), [form, target, mode]);
  const packJson = JSON.stringify(pack);
  const [savedJson, setSavedJson] = useState(() =>
    optionId ? JSON.stringify(formToPack(initial, target.code, mode).pack) : ""
  );
  const dirty = packJson !== savedJson;
  const [edited, setEdited] = useState(!!editedAt);
  const save = useAction();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setSections = (fn: (s: SectionForm[]) => SectionForm[]) =>
    setForm((f) => ({ ...f, sections: orderedSections(fn(f.sections)) }));
  const updateSection = (key: string, next: SectionForm) =>
    setSections((all) => all.map((s) => (s.key === key ? next : s)));
  const move = (key: string, by: -1 | 1) =>
    setSections((all) => {
      const s = all.find((x) => x.key === key)!;
      const same = all.filter((x) => x.part === s.part);
      const i = same.indexOf(s);
      const j = i + by;
      if (j < 0 || j >= same.length) return all;
      [same[i], same[j]] = [same[j], same[i]];
      return [...all.filter((x) => x.part !== s.part), ...same];
    });
  const addSection = (part: "core" | "extension") =>
    setSections((all) => [
      ...all,
      blankSection(
        nextId(
          "n",
          all.map((s) => s.key)
        ),
        part,
        DEFAULT_BODY[mode]
      ),
    ]);

  function onSave() {
    setShowIssues(true);
    if (issues.length) return;
    const sent = packJson;
    const done = (d: { optionId: string }) => {
      setSavedJson(sent);
      setEdited(true);
      setShowIssues(false);
      if (!optionId) router.replace(`/app/practice/relearning/${d.optionId}`);
    };
    save.run(
      optionId
        ? updateRelearningOption(optionId, pack)
        : createRelearningOption(target.courseId, target.id, mode, pack),
      done
    );
  }

  const listHref = `/app/practice/relearning?course=${target.courseId}`;
  const number = new Map(form.sections.map((s, i) => [s.key, i + 1]));
  const serverIssues = save.fieldErrors.option ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4" data-option-editor={mode}>
      <div>
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Read · Watch · Do
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="mr-auto text-2xl">
            {MODE_EMOJI[mode]} {MODE_LABEL[mode]} · {target.code}
            <span className="block text-sm font-normal text-muted-foreground">
              {target.title} · {target.courseName}
            </span>
          </h1>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-muted p-[3px] text-sm" role="tablist">
              {(
                [
                  ["edit", "Edit", "", PencilLine],
                  ["preview", "Preview", "as student", Eye],
                ] as const
              ).map(([v, label, more, Icon]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    view === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-view={v}
                >
                  <Icon className="size-4" aria-hidden />
                  <span>
                    {label}
                    {more ? <span className="hidden sm:inline"> {more}</span> : null}
                  </span>
                </button>
              ))}
            </div>
            <Button onClick={onSave} disabled={save.pending || (!dirty && !!optionId)} data-save>
              {save.pending ? "Saving…" : optionId ? "Save" : "Create"}
            </Button>
          </div>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium",
              form.published ? "bg-success-soft text-success-foreground" : "bg-muted"
            )}
          >
            {form.published ? "Published" : "Draft"}
          </span>
          <span data-save-state>
            {dirty
              ? issues.length && showIssues
                ? `${issues.length} to fix`
                : optionId
                  ? "Unsaved changes"
                  : "Not created yet"
              : edited
                ? "Saved · edited in Bloom, so pack updates leave it alone"
                : "Saved · from a content pack"}
          </span>
          {inProgress ? (
            <span className="inline-flex items-center gap-1" title="They keep their progress">
              <Users className="size-3.5" aria-hidden />
              {inProgress} working on it now
            </span>
          ) : null}
        </p>
      </div>

      {showIssues && (issues.length || serverIssues.length || save.error) ? (
        <div
          className="rounded-lg border border-warning/50 bg-warning-soft px-4 py-3 text-sm"
          role="alert"
          data-issues
        >
          <p className="inline-flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4 text-warning-foreground" aria-hidden />
            Fix before saving
          </p>
          <ul className="mt-1 list-disc pl-5">
            {(issues.length ? issues : serverIssues.length ? serverIssues : [save.error]).map(
              (m) => (
                <li key={m}>{m ? m.charAt(0).toUpperCase() + m.slice(1) : m}</li>
              )
            )}
          </ul>
        </div>
      ) : save.error ? (
        <p className="text-sm text-error-foreground" role="alert">
          {save.error}
        </p>
      ) : null}

      {view === "preview" ? (
        <Preview form={form} mode={mode} target={target} mediaUrls={mediaUrls} />
      ) : (
        <>
          <section
            className="grid gap-3 rounded-lg border border-border bg-card px-4 py-4 sm:grid-cols-[1fr_auto]"
            aria-label="Picker card"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Title</span>
              <Input
                value={form.title}
                maxLength={200}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                data-field="title"
              />
            </label>
            <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--brand)]"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
                data-field="published"
              />
              Published
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium">
                One line under it{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <Input
                value={form.description}
                maxLength={300}
                placeholder={MODE_LINE[mode]}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                data-field="description"
              />
            </label>
          </section>

          {(["core", "extension"] as const).map((part) => {
            const mine = form.sections.filter((s) => s.part === part);
            return (
              <section key={part} className="flex flex-col gap-3" data-part={part}>
                <h2 className="flex items-baseline gap-2 text-base font-medium">
                  {part === "core" ? "Core" : "Extension"}
                  <span className="text-xs font-normal text-muted-foreground tabular">
                    {PART_HINT[part]} · {mine.reduce((n, s) => n + (Number(s.minutes) || 0), 0)} min
                    now
                  </span>
                </h2>
                {mine.map((s, i) => (
                  <SectionEditor
                    key={s.key}
                    number={number.get(s.key) ?? 0}
                    section={s}
                    mode={mode}
                    first={i === 0}
                    last={i === mine.length - 1}
                    allCheckIds={form.sections.flatMap((x) => x.checks.map((c) => c.id))}
                    uploaded={!!mediaUrls[s.key]}
                    onChange={(next) => updateSection(s.key, next)}
                    onMove={(by) => move(s.key, by)}
                    onRemove={() => setSections((all) => all.filter((x) => x.key !== s.key))}
                  />
                ))}
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => addSection(part)}
                  data-add-section={part}
                >
                  <Plus data-icon="inline-start" aria-hidden />
                  {part === "core" ? "Core section" : "Extension section"}
                </Button>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/**
 * "Preview as student": the unsaved form through the student's own component. Core + extension
 * is what one target gets; a quiz on two or more targets serves the cores only (Q3).
 */
function Preview({
  form,
  mode,
  target,
  mediaUrls,
}: {
  form: OptionForm;
  mode: RelearningMode;
  target: EditorTarget;
  mediaUrls: Record<string, string>;
}) {
  const [coresOnly, setCoresOnly] = useState(false);
  const [round, setRound] = useState(0);
  const { pack } = formToPack(form, target.code, mode);
  const key: Record<string, QuickCheck> = {};
  for (const s of pack.sections) for (const c of s.checks ?? []) key[c.id] = c;
  const row: ActivityRow = {
    id: "preview",
    targetId: target.id,
    code: target.code,
    title: target.title,
    finished: false,
    checkedOff: false,
    progress: {},
    explanations: {},
    sections: pack.sections
      .map((s, i) => ({
        id: form.sections[i].key,
        part: s.part,
        title: s.title ?? null,
        body: s.body,
        checks: (s.checks ?? []).map(publicCheck),
        shortAnswerPrompt: s.shortAnswer ?? null,
        estMinutes: s.minutes ?? 3,
        videoUrl: mediaUrls[form.sections[i].key] ?? null,
      }))
      .filter((s) => !coresOnly || s.part === "core"),
  };
  return (
    <div className="flex flex-col gap-3" data-preview>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-brand/50 bg-brand-soft/40 px-3 py-2 text-sm">
        <Eye className="size-4 text-brand-deep" aria-hidden />
        <span className="mr-auto">
          What a student sees. Answers are checked here; nothing saves.
        </span>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand)]"
            checked={coresOnly}
            onChange={(e) => setCoresOnly(e.target.checked)}
          />
          Core only (a quiz on 2+ targets)
        </label>
        <Button size="sm" variant="outline" onClick={() => setRound((n) => n + 1)}>
          <RotateCcw data-icon="inline-start" aria-hidden />
          Start over
        </Button>
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <h2 className="mb-3 text-2xl">Relearn {target.code}</h2>
        <RelearningActivity
          key={`${round}-${coresOnly}`}
          assignmentId="preview"
          targetId={null}
          mode={mode}
          modeLabel={`${MODE_EMOJI[mode]} ${pack.title || MODE_LABEL[mode]}`}
          switchTo={[]}
          rows={[row]}
          preview={key}
        />
      </div>
    </div>
  );
}
