"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import type { AssessmentDetail } from "@/lib/queries/assessments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, useAction } from "@/components/use-action";
import { updateAssessmentSettings } from "../actions";
import { TYPE_HELP } from "../type-badge";

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

/** Type, attempt policy, review mode, retake threshold, and delivery options (PLAN.md §3.4). */
export function SettingsSheet({ detail }: { detail: AssessmentDetail }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(detail.type);
  const { run, pending, error, fieldErrors, reset } = useAction();

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <SheetTrigger render={<Button variant="outline" />}>
        <Settings2 data-icon="inline-start" aria-hidden />
        Settings
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <form
          className="flex flex-col gap-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(updateAssessmentSettings(detail.id, new FormData(e.currentTarget)), () =>
              setOpen(false)
            );
          }}
        >
          <SheetHeader className="p-0">
            <SheetTitle>Assessment settings</SheetTitle>
            <SheetDescription>
              These are the defaults; an assignment can override the attempt limit and window.
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="as-title">Title</Label>
            <Input id="as-title" name="title" defaultValue={detail.title} required />
            <FieldError errors={fieldErrors} name="title" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="as-type">Type</Label>
            <select
              id="as-type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as AssessmentDetail["type"])}
              className={selectClass}
            >
              <option value="practice">Practice</option>
              <option value="formative">Formative</option>
              <option value="summative">Summative</option>
            </select>
            <p className="text-xs text-muted-foreground">{TYPE_HELP[type]}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="as-instructions">Instructions to students</Label>
            <Textarea
              id="as-instructions"
              name="instructions"
              rows={3}
              defaultValue={detail.instructions ?? ""}
            />
          </div>

          <fieldset className="grid gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Attempts and retakes
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="as-attempts">Attempt limit</Label>
                <Input
                  id="as-attempts"
                  name="attemptLimit"
                  type="number"
                  min={1}
                  max={20}
                  placeholder="Unlimited"
                  defaultValue={detail.attemptLimit ?? ""}
                />
                <FieldError errors={fieldErrors} name="attemptLimit" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="as-threshold">Retake threshold %</Label>
                <Input
                  id="as-threshold"
                  name="retakeThreshold"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={detail.retakeThreshold}
                  required
                />
                <FieldError errors={fieldErrors} name="retakeThreshold" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="as-review">Corrections review</Label>
              <select
                id="as-review"
                name="reviewMode"
                defaultValue={detail.reviewMode}
                className={selectClass}
              >
                <option value="auto">Auto: submitting corrections unlocks the retake</option>
                <option value="teacher_approved">
                  Teacher approved: I review corrections first
                </option>
              </select>
            </div>
            <Toggle
              name="optionalRetakes"
              label="Allow optional retakes"
              help="Students at or above the threshold may still retake to improve."
              defaultChecked={detail.optionalRetakes}
            />
          </fieldset>

          <fieldset className="grid gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">Delivery</legend>
            <Toggle
              name="randomizeQuestions"
              label="Randomize question order"
              help="Within each section; stimulus groups stay together."
              defaultChecked={detail.randomizeQuestions}
            />
            <Toggle
              name="randomizeOptions"
              label="Randomize answer order"
              defaultChecked={detail.randomizeOptions}
            />
            <Toggle
              name="oneAtATime"
              label="One question at a time"
              defaultChecked={detail.oneAtATime}
            />
            <Toggle
              name="allowBacktrack"
              label="Allow going back to earlier questions"
              defaultChecked={detail.allowBacktrack}
            />
            <Toggle
              name="showResultsImmediately"
              label="Show results right after submitting"
              defaultChecked={detail.showResultsImmediately}
            />
          </fieldset>

          {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
          <SheetFooter className="p-0">
            <Button type="submit" disabled={pending}>
              Save settings
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
