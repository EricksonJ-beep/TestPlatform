"use client";

import { useState } from "react";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { defaultAttempts, generateAccessCode, toLocalDateTimeValue } from "@/lib/assignments";
import type { AssignmentRow } from "@/lib/queries/assignments";
import { useTzOffset } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";
import type { ActionResult } from "@/lib/authz";
import { createAssignments, updateAssignment } from "./actions";

export type AssignableAssessment = {
  id: string;
  title: string;
  type: "practice" | "formative" | "summative";
  courseName: string | null;
  attemptLimit: number | null;
  reviewMode: "auto" | "teacher_approved";
  retakeThreshold: number;
  optionalRetakes: boolean;
  showResultsImmediately: boolean;
};
export type ClassOption = { id: string; name: string; students: number };

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Toggle({
  name,
  label,
  help,
  defaultChecked,
}: {
  name: string;
  label: string;
  help?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 size-4 accent-brand"
      />
      <span>
        {label}
        {help ? <span className="block text-xs text-muted-foreground">{help}</span> : null}
      </span>
    </label>
  );
}

/**
 * Create (assessment + one or more classes) or edit (one assignment) with the
 * same form. Defaults come from the assessment's type and settings.
 */
export function AssignmentDialog({
  assessments,
  classes,
  existing,
  label = "New assignment",
}: {
  assessments: AssignableAssessment[];
  classes: ClassOption[];
  existing?: AssignmentRow;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const tzOffset = useTzOffset();
  const { run, pending, error, fieldErrors, reset } = useAction();
  const [assessmentId, setAssessmentId] = useState(
    existing?.assessmentId ?? assessments[0]?.id ?? ""
  );
  const [code, setCode] = useState(existing?.accessCode ?? "");
  const assessment = assessments.find((a) => a.id === assessmentId) ?? null;
  const attemptsDefault = existing
    ? existing.attemptsAllowed
    : assessment
      ? (assessment.attemptLimit ?? defaultAttempts(assessment.type))
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          existing ? (
            <Button variant="ghost" size="icon-sm" aria-label="Edit assignment" />
          ) : (
            <Button />
          )
        }
      >
        {existing ? (
          <Pencil aria-hidden />
        ) : (
          <>
            <Plus data-icon="inline-start" aria-hidden />
            {label}
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const p: Promise<ActionResult<unknown>> = existing
              ? updateAssignment(existing.id, fd)
              : createAssignments(fd);
            run(p, () => setOpen(false));
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {existing
                ? `Edit · ${existing.assessmentTitle} · ${existing.className}`
                : "Assign an assessment"}
            </DialogTitle>
            <DialogDescription>
              {existing
                ? "Changes apply immediately, including to students mid-attempt (their attempt deadline is kept)."
                : "Students see it on their home page inside the window. Defaults follow the assessment type."}
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="tzOffset" value={tzOffset} />

          {!existing ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="as-assessment">Assessment</Label>
                <select
                  id="as-assessment"
                  name="assessmentId"
                  value={assessmentId}
                  onChange={(e) => setAssessmentId(e.target.value)}
                  className={selectClass}
                  required
                >
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} · {a.type}
                      {a.courseName ? ` · ${a.courseName}` : ""}
                    </option>
                  ))}
                </select>
                <FieldError errors={fieldErrors} name="assessmentId" />
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Classes</legend>
                {classes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No classes yet; create one under Classes.
                  </p>
                ) : (
                  classes.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="classIds"
                        value={c.id}
                        className="size-4 accent-brand"
                      />
                      {c.name}
                      <span className="text-xs text-muted-foreground tabular">
                        · {c.students} {c.students === 1 ? "student" : "students"}
                      </span>
                    </label>
                  ))
                )}
                <FieldError errors={fieldErrors} name="classIds" />
              </fieldset>
            </>
          ) : null}

          <fieldset className="grid gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Window and access
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="as-opens">Opens</Label>
                <Input
                  id="as-opens"
                  name="opensAt"
                  type="datetime-local"
                  defaultValue={
                    existing?.opensAt
                      ? toLocalDateTimeValue(new Date(existing.opensAt), tzOffset)
                      : ""
                  }
                />
                <FieldError errors={fieldErrors} name="opensAt" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="as-closes">Closes</Label>
                <Input
                  id="as-closes"
                  name="closesAt"
                  type="datetime-local"
                  defaultValue={
                    existing?.closesAt
                      ? toLocalDateTimeValue(new Date(existing.closesAt), tzOffset)
                      : ""
                  }
                />
                <FieldError errors={fieldErrors} name="closesAt" />
              </div>
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              Leave both blank to keep it open until you close it.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="as-code">Access code</Label>
                <div className="flex gap-1">
                  <Input
                    id="as-code"
                    name="accessCode"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="None"
                    className="font-mono uppercase"
                    maxLength={12}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Generate a code"
                    onClick={() => setCode(generateAccessCode())}
                  >
                    <RefreshCw aria-hidden />
                  </Button>
                </div>
                <FieldError errors={fieldErrors} name="accessCode" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="as-limit">Time limit (minutes)</Label>
                <Input
                  id="as-limit"
                  name="timeLimitMinutes"
                  type="number"
                  min={1}
                  max={600}
                  placeholder="None"
                  defaultValue={existing?.timeLimitMinutes ?? ""}
                />
                <FieldError errors={fieldErrors} name="timeLimitMinutes" />
              </div>
            </div>
          </fieldset>

          <fieldset className="grid gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Attempts and retakes
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="as-attempts">Attempts allowed</Label>
                <Input
                  key={`${assessmentId}-${attemptsDefault}`}
                  id="as-attempts"
                  name="attemptsAllowed"
                  type="number"
                  min={1}
                  max={50}
                  placeholder="Unlimited"
                  defaultValue={attemptsDefault ?? ""}
                />
                <FieldError errors={fieldErrors} name="attemptsAllowed" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="as-threshold">Retake threshold %</Label>
                <Input
                  key={`t-${assessmentId}`}
                  id="as-threshold"
                  name="retakeThreshold"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={existing?.retakeThreshold ?? assessment?.retakeThreshold ?? 80}
                  required
                />
                <FieldError errors={fieldErrors} name="retakeThreshold" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="as-review">Corrections review</Label>
                <select
                  key={`r-${assessmentId}`}
                  id="as-review"
                  name="reviewMode"
                  defaultValue={existing?.reviewMode ?? assessment?.reviewMode ?? "auto"}
                  className={selectClass}
                >
                  <option value="auto">Auto</option>
                  <option value="teacher_approved">Teacher approved</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="as-tier2">Tier 2 up to (targets below)</Label>
                <Input
                  id="as-tier2"
                  name="tier2Max"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={existing?.tier2Max ?? 2}
                />
                <FieldError errors={fieldErrors} name="tier2Max" />
              </div>
            </div>
            <Toggle
              key={`o-${assessmentId}`}
              name="optionalRetakes"
              label="Allow optional retakes"
              defaultChecked={existing?.optionalRetakes ?? assessment?.optionalRetakes ?? true}
            />
            <Toggle
              key={`s-${assessmentId}`}
              name="resultsReleased"
              label="Show results to students right after submitting"
              defaultChecked={
                existing?.resultsReleased ?? assessment?.showResultsImmediately ?? true
              }
            />
          </fieldset>

          {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                pending || (!existing && (assessments.length === 0 || classes.length === 0))
              }
            >
              {existing ? "Save changes" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
