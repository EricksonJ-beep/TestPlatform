"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Copy, Eye, Plus, Send, Trash2, Undo2 } from "lucide-react";
import type { AssessmentDetail } from "@/lib/queries/assessments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";
import {
  addSection,
  addSectionPerTarget,
  deleteAssessment,
  duplicateAssessment,
  setPublished,
} from "../actions";
import { TYPE_STYLE } from "../type-badge";
import { BankPane, type BuilderPool } from "./bank-pane";
import { SectionCard } from "./section-card";
import { SettingsSheet } from "./settings-sheet";

export type BuilderTarget = { id: string; code: string; title: string };

export const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function Builder({
  detail,
  access,
  targets,
  pools,
  banks,
  totalPoints,
}: {
  detail: AssessmentDetail;
  access: "owner" | "view" | "copy" | "co_edit";
  targets: BuilderTarget[];
  pools: BuilderPool[];
  banks: { id: string; name: string }[];
  totalPoints: number;
}) {
  const router = useRouter();
  const canEdit = access === "owner" || access === "co_edit";
  const { run, pending, error } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const questionCount = detail.sections.reduce(
    (n, s) => n + s.items.reduce((m, i) => m + (i.kind === "question" ? 1 : i.drawCount), 0),
    0
  );
  const untargeted = detail.sections.filter((s) => !s.learningTargetId);
  const covered = new Set(detail.sections.map((s) => s.learningTargetId));
  const missingTargets = targets.filter((t) => !covered.has(t.id));
  const summative = detail.type === "summative";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl">{detail.title}</h1>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[detail.type]}`}
            >
              {detail.type}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${detail.isPublished ? "bg-brand-soft text-brand-deep" : "bg-muted text-muted-foreground"}`}
            >
              {detail.isPublished ? "Published" : "Draft"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.courseName ?? "No course"} ·{" "}
            <span className="tabular">
              {detail.sections.length} {detail.sections.length === 1 ? "section" : "sections"} ·{" "}
              {questionCount} {questionCount === 1 ? "question" : "questions"} · {totalPoints}{" "}
              {totalPoints === 1 ? "point" : "points"}
            </span>
            {detail.assignments > 0 ? ` · assigned ${detail.assignments}×` : ""}
          </p>
          {error ? <p className="mt-1 text-sm text-error-foreground">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/app/assessments/${detail.id}/preview`} />}
          >
            <Eye data-icon="inline-start" aria-hidden />
            Preview as student
          </Button>
          {canEdit ? <SettingsSheet detail={detail} /> : null}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(duplicateAssessment(detail.id), ({ assessmentId }) =>
                router.push(`/app/assessments/${assessmentId}`)
              )
            }
          >
            <Copy data-icon="inline-start" aria-hidden />
            Duplicate
          </Button>
          {canEdit ? (
            detail.isPublished ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(setPublished(detail.id, false))}
              >
                <Undo2 data-icon="inline-start" aria-hidden />
                Unpublish
              </Button>
            ) : (
              <Button disabled={pending} onClick={() => run(setPublished(detail.id, true))}>
                <Send data-icon="inline-start" aria-hidden />
                Publish
              </Button>
            )
          ) : null}
          {access === "owner" && detail.assignments === 0 ? (
            confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(deleteAssessment(detail.id), () => router.push("/app/assessments"))
                  }
                >
                  Delete for good
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete">
                <Trash2 aria-hidden />
              </Button>
            )
          ) : null}
        </div>
      </div>

      {summative && canEdit && (untargeted.length > 0 || missingTargets.length > 0) ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-coral/40 bg-coral-soft/40 px-4 py-3 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0 text-[#B93E27]" aria-hidden />
          <div className="mr-auto">
            <p className="font-medium">
              Summatives work best with one section per learning target.
            </p>
            <p className="text-muted-foreground">
              {untargeted.length > 0
                ? `${untargeted.length} ${untargeted.length === 1 ? "section has" : "sections have"} no target, so scores there can't feed a targeted retake. `
                : ""}
              {missingTargets.length > 0
                ? `No section yet for ${missingTargets.map((t) => t.code).join(", ")}.`
                : ""}
            </p>
          </div>
          {missingTargets.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(addSectionPerTarget(detail.id))}
            >
              Add a section per target
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        {canEdit ? (
          <BankPane
            assessmentId={detail.id}
            banks={banks}
            pools={pools}
            targets={targets}
            sections={detail.sections.map((s) => ({ id: s.id, title: s.title }))}
          />
        ) : null}
        <div className={`flex flex-col gap-3 ${canEdit ? "" : "lg:col-span-2"}`}>
          {detail.sections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No sections yet. Add one below; every question lives in a section, and a section can
              carry a learning target so scores roll up by target.
            </div>
          ) : (
            detail.sections.map((s, i) => (
              <SectionCard
                key={s.id}
                assessmentId={detail.id}
                section={s}
                index={i}
                count={detail.sections.length}
                targets={targets}
                canEdit={canEdit}
                summative={summative}
              />
            ))
          )}
          {canEdit ? <AddSectionForm assessmentId={detail.id} targets={targets} /> : null}
        </div>
      </div>
    </div>
  );
}

function AddSectionForm({
  assessmentId,
  targets,
}: {
  assessmentId: string;
  targets: BuilderTarget[];
}) {
  const { run, pending, error, fieldErrors } = useAction();
  return (
    <form
      className="grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        run(addSection(assessmentId, new FormData(form)), () => form.reset());
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="ns-title">New section</Label>
        <Input id="ns-title" name="title" placeholder="Section title" required />
        <FieldError errors={fieldErrors} name="title" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ns-target">Learning target</Label>
        <select id="ns-target" name="learningTargetId" className={selectClass} defaultValue="">
          <option value="">No target</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} · {t.title}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        <Plus data-icon="inline-start" aria-hidden />
        Add section
      </Button>
      {error ? <p className="text-sm text-error-foreground sm:col-span-3">{error}</p> : null}
    </form>
  );
}
