"use client";

import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import type { ActionResult } from "@/lib/authz";
import { useAction } from "@/components/use-action";
import { setCourseCvtcRules } from "../actions";

/**
 * The course's CVTC rules switch (Jon, Oct 13 2026): corrections earn no credit and are never
 * owed; a retake is the only way up. Saving recomputes the scores it changes. The switch is
 * saved before the recompute, so when something fails the page reloads to show what is saved,
 * and "Finish recomputing" runs the recompute again for that saved value.
 */
export function CvtcToggle({ courseId, on }: { courseId: string; on: boolean }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const save = (value: boolean) =>
    run(
      setCourseCvtcRules(courseId, value)
        .catch((): ActionResult<never> => ({
          ok: false,
          status: 500,
          error: "Saving took too long or failed part way.",
        }))
        .then((r) => {
          if (!r.ok) router.refresh();
          return r;
        })
    );
  return (
    <section
      className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
      aria-labelledby="cvtc-title"
      data-cvtc={on ? "on" : "off"}
    >
      <GraduationCap className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <label className="mr-auto flex min-w-0 flex-1 items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => save(e.target.checked)}
          className="mt-0.5 size-4 accent-brand"
        />
        <span>
          <span id="cvtc-title" className="font-medium">
            CVTC rules: corrections earn no credit, retakes only
          </span>
          <span className="block text-xs text-muted-foreground">
            For every assessment in this course: corrections are never owed and never raise a score,
            and a retake is the only way up (with your OK where &ldquo;Retakes need my OK&rdquo; is
            on). Changing this recomputes the scores it affects in the course, including classes of
            teachers you&apos;ve shared these tests with.
          </span>
          {error ? (
            <span className="mt-1 block text-sm text-error-foreground">
              {error} The switch shows what is saved.{" "}
              <button
                type="button"
                className="font-medium underline"
                disabled={pending}
                onClick={() => save(on)}
              >
                Finish recomputing
              </button>
            </span>
          ) : null}
        </span>
      </label>
      <span
        className={`rounded-md px-2 py-0.5 text-xs font-medium ${on ? "bg-brand-soft text-brand-deep" : "bg-muted text-muted-foreground"}`}
      >
        {pending ? "Saving…" : on ? "On" : "Off"}
      </span>
    </section>
  );
}
