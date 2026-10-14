import { ClipboardList } from "lucide-react";
import type { StudentAssignment } from "@/lib/queries/assignments";
import {
  assessmentsByStatus,
  closedCorrectionsCount,
  STATUS_TITLE,
  type StatusSection,
} from "@/lib/student-home";
import { EmptyState } from "@/components/empty-state";
import { AssignmentCard } from "./assignment-card";

/**
 * The Assessments tab grouped by status (Jon, Oct 14 2026, plan step 3): Open now, Opens soon,
 * and Closed (newest first, collapsed; it says how many still have corrections to do). Every card
 * keeps its real pill and button: a closed quiz with corrections shows "Do corrections".
 */
export function AssessmentsTab({ assignments }: { assignments: StudentAssignment[] }) {
  if (assignments.length === 0)
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={ClipboardList}
          title="No assessments yet"
          description="When your teacher opens a quiz or test for your class, it shows up here with a Start button."
        />
      </div>
    );
  const s = assessmentsByStatus(assignments);
  const withCorrections = closedCorrectionsCount(s.closed);
  return (
    <div className="flex flex-col gap-5" data-assessment-sections>
      {(["open", "soon"] as const).map((key) =>
        s[key].length ? <Section key={key} k={key} list={s[key]} /> : null
      )}
      {s.open.length === 0 && s.soon.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing open right now. Closed assessments are below.
        </p>
      ) : null}
      {s.closed.length ? (
        <details className="group" data-section="closed">
          <summary className="cursor-pointer list-none text-xs font-medium tracking-wide text-muted-foreground uppercase select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show closed</span>
            <span className="hidden group-open:inline">Hide closed</span>
            <span className="ml-1.5 font-normal tabular">· {s.closed.length}</span>
            {withCorrections ? (
              <span
                className="ml-1.5 font-normal text-coral-deep normal-case tabular"
                data-closed-corrections
              >
                · {withCorrections} {withCorrections === 1 ? "has" : "have"} corrections to do
              </span>
            ) : null}
          </summary>
          <ul className="mt-2 flex flex-col gap-3" aria-label={STATUS_TITLE.closed}>
            {s.closed.map((a) => (
              <AssignmentCard key={a.id} a={a} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Section({ k, list }: { k: StatusSection; list: StudentAssignment[] }) {
  return (
    <section aria-labelledby={`section-${k}`} data-section={k}>
      <h2
        id={`section-${k}`}
        className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {STATUS_TITLE[k]}
        <span className="ml-1.5 font-normal tabular">· {list.length}</span>
      </h2>
      <ul className="flex flex-col gap-3" aria-label={STATUS_TITLE[k]}>
        {list.map((a) => (
          <AssignmentCard key={a.id} a={a} />
        ))}
      </ul>
    </section>
  );
}
