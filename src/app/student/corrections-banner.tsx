import Link from "next/link";
import { PencilLine } from "lucide-react";
import type { StudentAssignment } from "@/lib/queries/assignments";
import { Button } from "@/components/ui/button";

/**
 * Corrections the student owes, at the very top of their home, above the tabs (Jon, Oct 14 2026:
 * "that information should show up right on a student's main page… almost like an advertisement…
 * especially when they got below an 80 percent"). Shows up on every visit until they're done.
 */
export function CorrectionsBanner({ items }: { items: StudentAssignment[] }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="corrections-banner-title"
      className="rounded-xl border-2 border-coral/60 bg-coral-soft p-4 sm:p-5"
      data-corrections-banner
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-coral text-white"
        >
          <PencilLine className="size-4" />
        </span>
        <div>
          <h2 id="corrections-banner-title" className="text-lg font-semibold text-[#B93E27]">
            {items.length === 1
              ? "You have corrections to do"
              : `You have ${items.length} sets of corrections to do`}
          </h2>
          <p className="text-sm text-foreground/80">
            Fixing what you missed is the fastest way to raise your score.
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((a) => (
          <BannerRow key={a.id} a={a} />
        ))}
      </ul>
    </section>
  );
}

function BannerRow({ a }: { a: StudentAssignment }) {
  const c = a.corrections!;
  const score = a.resultsReleased ? (a.final?.percent ?? a.bestPercent) : null;
  const low = score !== null && score < a.retakeThreshold;
  const started = a.state !== "corrections_returned" && c.started > 0;
  const n = `${c.remaining} missed ${c.remaining === 1 ? "question" : "questions"}`;
  const open = a.status !== "closed";
  const attemptsLeft = a.attemptsAllowed === null || a.attemptsUsed < a.attemptsAllowed;
  const goal =
    a.state === "corrections_to_full"
      ? " to raise this to 100%"
      : a.correctionsCap && c.attemptNumber === 1
        ? ` to bring this up to ${a.retakeThreshold}%`
        : open && attemptsLeft
          ? " to unlock your retake"
          : "";
  const line =
    a.state === "corrections_returned"
      ? "Your teacher sent your corrections back with a note. Revise and resubmit."
      : started
        ? `${c.started} of ${c.needed} started. Finish them${goal}.`
        : `Correct ${n}${goal}.`;
  const label =
    a.state === "corrections_returned"
      ? "Revise corrections"
      : started
        ? "Continue corrections"
        : "Do corrections";

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-lg bg-card px-4 py-3 shadow-xs"
      data-banner-assignment={a.id}
    >
      <div className="mr-auto min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{a.title}</h3>
          {score !== null ? (
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular ${
                low ? "bg-coral-soft text-[#B93E27]" : "bg-brand-soft text-brand-deep"
              }`}
              data-banner-score
            >
              {Math.round(score)}%
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {a.className} · {line}
        </p>
      </div>
      <Button
        size="lg"
        nativeButton={false}
        render={<Link href={`/student/corrections/${c.attemptId}`} />}
      >
        {label}
      </Button>
    </li>
  );
}
