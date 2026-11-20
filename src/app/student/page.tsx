import Link from "next/link";
import { closeExpiredAttempts } from "@/lib/attempt-sweep";
import { eq } from "drizzle-orm";
import { KeyRound } from "lucide-react";
import { cn } from "cn";
import { db, schema } from "@/db";
import { requireStudent, studentCourseIds } from "@/lib/authz";
import { listCustomPracticeOptions } from "@/lib/custom-practice";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { listStudentClasses } from "@/lib/queries/classes";
import { getStudentPractice } from "@/lib/queries/practice";
import { listStudentResults } from "@/lib/queries/student-results";
import { getAnswerMaps, getRetakeAskTimes } from "@/lib/queries/student-home";
import { buildStudentToDo, homeLanes, homeTab } from "@/lib/student-home";
import { classChip, homeHeadline } from "@/lib/student-home-view";
import { btn, chip } from "@/components/home/ui";
import { AssessmentsTab } from "./assessments-tab";
import { PracticeTab } from "./practice-tab";
import { ResultsTab } from "./results-tab";
import { AskAnnouncer } from "./ask-announcer";
import { FixSection, NowPanel, RetakeSection, WaitingSection } from "./home-sections";
import { PathIntro } from "./path/path-intro";

const TAB_TITLE = {
  assessments: "Assessments",
  practice: "Practice",
  results: "My results",
} as const;

/**
 * The student home (Jon, Oct 14 2026, docs/student-home-plan.md; Oct 20 2026 "Three lanes"; drawn
 * as the home pages redesign, BLOOM_HOME_REDESIGN.md §5): the sections live in the top bar
 * (`?tab=`, layout). Home shows the greeting and the class chips, then the three steps in their
 * unchanged order: one large "do this now" panel, "Then fix these" and "Want a higher score?".
 * Each other section has the page to itself. Reads only, so "View as student" sees it as is.
 */
export default async function StudentHome({ searchParams }: PageProps<"/student">) {
  const tab = homeTab((await searchParams).tab);
  const session = await requireStudent();
  // A test of theirs that ran out of time is submitted before the list is read (H3.2). Not
  // under "View as student": that view only reads.
  if (!session.viewingAs) await closeExpiredAttempts({ studentId: session.userId });
  const [classes, assignments] = await Promise.all([
    listStudentClasses(session.userId),
    listStudentAssignments(session.userId),
  ]);
  // Each tab loads only what it shows (H5.2, Nov 9 2026): the results list and the practice
  // shelves are the heavy reads, and neither is on every tab.
  if (tab === "assessments" || tab === "results")
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <h1 className="text-2xl">{TAB_TITLE[tab]}</h1>
        {tab === "assessments" ? (
          <AssessmentsTab assignments={assignments} />
        ) : (
          <ResultsTab results={await listStudentResults(session.userId, assignments)} />
        )}
      </div>
    );

  const [practice, buildable, me] = await Promise.all([
    getStudentPractice(session.userId, assignments),
    studentCourseIds(session.userId).then(listCustomPracticeOptions),
    tab === "home"
      ? db.query.users.findFirst({
          columns: { mustChangePassword: true },
          where: eq(schema.users.id, session.userId),
        })
      : null,
  ]);

  if (tab === "practice")
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <h1 className="text-2xl">{TAB_TITLE[tab]}</h1>
        <PracticeTab practice={practice} buildable={buildable} />
      </div>
    );

  // One list (Jon, Oct 14 2026): the sections below show exactly these rows.
  const list = buildStudentToDo({
    assignments,
    activities: practice.activities,
    buildableTargetIds: new Set(
      buildable.flatMap((c) => c.units.flatMap((u) => u.targets.map((t) => t.id)))
    ),
  });
  const lanes = homeLanes(list);
  const asked = lanes.waiting.filter((r) => r.kind === "retake_requested");
  const waiting = lanes.waiting.filter((r) => r.kind !== "retake_requested");
  // The question dots: each open attempt's per-question answered state, by assignment.
  const open = assignments.filter((a) => a.inProgressAttemptId);
  const [byAttempt, askedAt] = await Promise.all([
    getAnswerMaps(
      session.userId,
      open.map((a) => a.inProgressAttemptId!)
    ),
    getRetakeAskTimes(
      session.userId,
      asked.flatMap((r) => (r.assignmentId ? [r.assignmentId] : []))
    ),
  ]);
  const answers = new Map(
    open.flatMap((a) => {
      const map = byAttempt.get(a.inProgressAttemptId!);
      return map ? [[a.id, map] as const] : [];
    })
  );

  return (
    <div className="bloom-home flex flex-col gap-7 text-base">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="font-display text-[clamp(30px,5.5vw,40px)] leading-[1.1] font-semibold tracking-[-0.025em]">
            {homeHeadline(session.firstName, lanes)}
          </h1>
          <p className="sr-only" data-todo-count={list.count}>
            {list.headline}
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-2" aria-label="Your classes">
          {classes.map((c) => (
            <li key={c.id} className={cn(chip.base, chip.neutral, "min-h-11 px-4 text-sm")}>
              {classChip(c)}
            </li>
          ))}
          <li>
            <Link href="/student/join" className={cn(btn.base, btn.outline, "rounded-full")}>
              Join a class
            </Link>
          </li>
        </ul>
      </div>

      {me?.mustChangePassword ? (
        <Link
          href="/student/password"
          className="flex flex-wrap items-center gap-3 rounded-[20px] bg-owed px-5 py-4 text-[15px] text-owed-text"
          data-password-nudge
        >
          <KeyRound className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 basis-64">
            You&apos;re still using the temporary password your teacher gave you. Pick your own so
            nobody else can log in as you.
          </span>
          <span className="font-bold underline">Change it</span>
        </Link>
      ) : null}

      {/* The new relearning path (L1): a first-time "how it works", once they're on it. */}
      {assignments.some((a) => a.path) ? <PathIntro /> : null}

      <AskAnnouncer>
        <div className="flex flex-col gap-7">
          <NowPanel rows={lanes.now} answers={answers} />
          {lanes.fix.length || lanes.level.length || asked.length ? (
            <div
              className="grid items-start gap-7"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}
            >
              <FixSection rows={lanes.fix} first={lanes.now.length === 0} />
              <RetakeSection rows={lanes.level} asked={asked} askedAt={askedAt} />
            </div>
          ) : null}
          <WaitingSection rows={waiting} />
        </div>
      </AskAnnouncer>
    </div>
  );
}
