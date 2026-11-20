"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CircleCheck, Users } from "lucide-react";
import { cn } from "cn";
import {
  DEFAULT_FILTERS,
  gradebookView,
  rightNow,
  type GradebookFilters,
  type GradebookView,
  type LiveRow,
  type WhoChip,
} from "@/lib/gradebook-view";
import { needsYouCounts } from "@/lib/needs-you";
import type { ClassGradebook } from "@/lib/queries/class-gradebook";
import type { NeedsYou } from "@/lib/queries/dashboard";
import {
  countWord,
  firstAndInitial,
  liveSummary,
  mostToDo,
  unitGroups,
  upNext,
  type LiveSummary,
} from "@/lib/teacher-home";
import { Gradebook } from "@/components/app/class-gradebook";
import { GradebookPanel, type PanelTarget } from "@/components/app/gradebook-panel";
import { useHideScores } from "@/components/app/hide-scores";
import { NeedsYouInbox } from "@/components/app/needs-you";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { LetContinueButton } from "@/app/app/results/[assignmentId]/let-continue-button";
import { btn, card, chip } from "./ui";

/**
 * The teacher home between the header and Recent activity (home pages redesign §3). **Live
 * mode**, while a student of the selected class is testing or paused: the dark "Live test" panel,
 * the status strip, the gradebook, and the queue under it. **Quiet mode** otherwise: the dark
 * "Needs you" panel beside "Up next" and "Most to do", then "Where the period stands" with the
 * gradebook behind "Open gradebook". The mode follows the page's own data, which `LiveRefresh`
 * keeps current, so it switches without a reload. This component owns the gradebook's filters
 * and the side panel, so the chips, the tiles and the names all drive the same view.
 */
export function ClassHome({
  course,
  period,
  gradebook: gb,
  inbox,
}: {
  course: { id: string; name: string } | null;
  /** The selected class's words: "3rd hour". */
  period: string | null;
  gradebook: ClassGradebook | null;
  inbox: NeedsYou;
}) {
  const [filters, setFilters] = useState<GradebookFilters>(DEFAULT_FILTERS);
  const [panel, setPanel] = useState<PanelTarget | null>(null);
  const [open, setOpen] = useState(false);
  const hideScores = useHideScores();
  const gradebookRef = useRef<HTMLDivElement>(null);
  const counts = needsYouCounts(inbox);
  const set = (patch: Partial<GradebookFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const ready = gb && gb.students.length > 0 && gb.columns.length > 0 ? gb : null;
  const view = ready ? gradebookView(ready, filters) : null;
  const live = ready ? rightNow(ready) : { testing: [], paused: [] };
  const summary = ready ? liveSummary(ready, live) : null;

  /** A chip above the gradebook filters it, as the old counters did, and brings it into view. */
  const pickChip = (c: WhoChip) => {
    set({ chip: filters.chip === c ? null : c });
    setOpen(true);
    requestAnimationFrame(() =>
      gradebookRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" })
    );
  };
  const openCell = (r: LiveRow) =>
    setPanel({ kind: "cell", studentId: r.student.id, assignmentId: r.assignmentId });

  const gradebookPart =
    ready && view ? (
      <Gradebook
        gb={ready}
        view={view}
        filters={filters}
        set={set}
        hideScores={hideScores}
        onOpen={setPanel}
      />
    ) : null;

  return (
    <>
      {ready && view && summary ? (
        // ---- Live mode ----
        <>
          <LivePanel
            summary={summary}
            paused={live.paused}
            period={period ?? ready.class.name}
            onOpen={openCell}
          />
          <section
            className={cn(card, "flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4")}
            aria-label="Status"
            data-status-strip
          >
            <NeedsYouLine total={counts.total} />
            <StateChips view={view} active={filters.chip} onPick={pickChip} testing />
          </section>
          <section
            ref={gradebookRef}
            className={cn(card, "scroll-mt-4 p-5 sm:p-7")}
            aria-label="Gradebook"
          >
            {gradebookPart}
          </section>
          {counts.total > 0 ? (
            <section
              id="needs-you"
              className={cn(card, "flex scroll-mt-4 flex-col gap-4 p-5 sm:p-7")}
              aria-labelledby="needs-you-title"
            >
              <div>
                <h2
                  id="needs-you-title"
                  className="font-display text-2xl font-semibold tracking-tight"
                >
                  Needs you
                </h2>
                <p className="text-sm text-ink-muted">
                  From all your courses; each row says which class it&apos;s in.
                </p>
              </div>
              <NeedsYouInbox inbox={inbox} />
            </section>
          ) : (
            <NeedsYouInbox inbox={inbox} />
          )}
        </>
      ) : (
        // ---- Quiet mode ----
        <>
          <div className="flex flex-wrap items-start gap-6">
            <section
              id="needs-you"
              className="bloom-panel min-w-0 flex-[3_1_480px] scroll-mt-4 rounded-[28px] p-5 sm:p-8"
              aria-labelledby="needs-you-title"
              data-quiet-panel
            >
              <p className="text-[15px] font-semibold text-eosin-pale">
                {ready ? "Nobody is testing right now" : "Needs you"}
              </p>
              <h2
                id="needs-you-title"
                className="mt-2 font-display text-[clamp(30px,5vw,44px)] leading-[1.04] font-semibold tracking-[-0.025em]"
                data-needs-total={counts.total}
              >
                {counts.total === 0
                  ? "You're all caught up"
                  : `${countWord(counts.total)} ${counts.total === 1 ? "thing needs" : "things need"} you`}
              </h2>
              {counts.total === 0 ? (
                <p className="mt-3 text-[15px] text-on-ink-muted" data-needs-you-empty>
                  Retake requests, corrections and grading land here.
                </p>
              ) : (
                <p className="mt-3 text-[15px] text-on-ink-muted">
                  From all your courses; each row says which class it&apos;s in.
                </p>
              )}
              <div className="mt-5 empty:hidden">
                <NeedsYouInbox inbox={inbox} tone="dark" />
              </div>
            </section>
            {ready && view ? (
              <QuietSide gb={ready} view={view} period={period} onOpen={setPanel} />
            ) : null}
          </div>

          {ready && view ? (
            <section
              ref={gradebookRef}
              className={cn(card, "flex scroll-mt-4 flex-col gap-6 p-5 sm:p-7")}
              aria-labelledby="stands-title"
              data-where-stands
            >
              <div className="flex flex-wrap items-center gap-3">
                <h2
                  id="stands-title"
                  className="mr-auto font-display text-[26px] leading-tight font-semibold tracking-tight"
                >
                  Where {period ?? ready.class.name} stands
                </h2>
                <StateChips view={view} active={filters.chip} onPick={pickChip} />
                <button
                  type="button"
                  className={cn(btn.base, btn.dark)}
                  aria-expanded={open}
                  aria-controls="home-gradebook"
                  data-open-gradebook
                  onClick={() => setOpen(!open)}
                >
                  {open ? "Close gradebook" : "Open gradebook"}
                </button>
              </div>
              <UnitBars gb={ready} view={view} hideScores={hideScores} />
              {open ? (
                <div id="home-gradebook" className="border-t border-line pt-6">
                  {gradebookPart}
                </div>
              ) : null}
            </section>
          ) : (
            <section className={cn(card, "p-5")}>
              <NoGradebook course={course} gb={gb} />
            </section>
          )}
        </>
      )}

      {ready ? (
        <GradebookPanel
          gb={ready}
          target={panel}
          hideScores={hideScores}
          showPractice={filters.showPractice}
          onTarget={setPanel}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Live mode
// ---------------------------------------------------------------------------

/**
 * The dark "Live test" panel (§3.3): the assessment most of the room is on, three figures, one
 * ring tile per student testing (most answered first), and who is paused with "Let them
 * continue". A tile or a paused name opens that student's cell, as the old strip's names did.
 */
function LivePanel({
  summary: s,
  paused,
  period,
  onOpen,
}: {
  summary: LiveSummary;
  paused: LiveRow[];
  period: string;
  onOpen: (r: LiveRow) => void;
}) {
  return (
    <section
      className="bloom-panel rounded-[28px] p-5 sm:p-8"
      aria-labelledby="live-title"
      data-right-now
    >
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="min-w-0 flex-[1_1_380px]">
          <p className="flex items-center gap-3 text-[15px] font-semibold text-eosin-pale">
            <span className="bloom-pulse size-2.5 shrink-0 rounded-full bg-eosin" aria-hidden />
            Live now in {period}
          </p>
          <h2
            id="live-title"
            className="mt-3 font-display text-[clamp(30px,5vw,44px)] leading-[1.04] font-semibold tracking-[-0.025em]"
          >
            {s.title}
          </h2>
          <p className="mt-3 text-[15px] text-on-ink-muted">
            {s.closesAt ? (
              <>
                Closes <LocalTime date={s.closesAt} mode="at" />.{" "}
              </>
            ) : null}
            {s.roomLeft
              ? s.roomLeft === "time's up"
                ? "Time is up for most of the room."
                : `${s.roomLeft} for most of the room.`
              : null}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-4">
          <Figure n={String(s.testing)} label="testing" />
          <Figure n={String(s.paused)} label="paused" pale />
          <Figure n={`${s.turnedIn} of ${s.roster}`} label="turned in" />
        </dl>
      </div>

      {s.tiles.length ? (
        <ul
          className="mt-7 grid gap-2.5"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(156px, 100%), 1fr))" }}
        >
          {s.tiles.map(({ row: r, line }) => (
            <li key={r.attemptId} data-testing={r.attemptId}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[14px] bg-ink-raised px-3 py-2.5 text-left hover:brightness-125"
                onClick={() => onOpen(r)}
              >
                {/* Decorative: the tile's text carries the count. */}
                <span
                  aria-hidden
                  className="grid size-[46px] shrink-0 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(var(--color-stain-light) ${
                      r.total > 0 ? Math.round((r.answered / r.total) * 360) : 0
                    }deg, rgba(255,255,255,0.16) 0deg)`,
                  }}
                >
                  <span className="grid size-9 place-items-center rounded-full bg-ink-raised font-display text-[15px] font-semibold tabular">
                    {r.answered}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{firstAndInitial(r.student)}</span>
                  <span className="block text-[13px] leading-tight text-on-ink-muted">
                    <span className="sr-only">{r.answered} </span>
                    {line}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {paused.length ? (
        <div className="mt-6 border-t border-white/[0.16] pt-5">
          <p className="text-[15px] font-semibold text-eosin-pale">Paused, waiting on you</p>
          <ul className="mt-3 flex flex-wrap gap-2.5">
            {paused.map((r) => (
              <li
                key={r.attemptId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] bg-ink-raised py-2 pr-2 pl-4"
                data-paused={r.attemptId}
              >
                <button
                  type="button"
                  className="min-h-11 rounded-md text-left hover:underline"
                  onClick={() => onOpen(r)}
                >
                  <span className="block font-semibold">{firstAndInitial(r.student)}</span>
                  <span className="block text-[13px] text-on-ink-muted">
                    {r.title}, {r.answered} of {r.total}
                  </span>
                </button>
                <LetContinueButton attemptId={r.attemptId} asked={r.asked} tone="panel" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Figure({ n, label, pale = false }: { n: string; label: string; pale?: boolean }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-sm text-on-ink-muted">{label}</dt>
      <dd
        className={cn(
          "font-display text-[34px] leading-none font-semibold tracking-[-0.02em] tabular",
          pale && "text-eosin-pale"
        )}
      >
        {n}
      </dd>
    </div>
  );
}

/** The status strip's left side (§3.3): the queue's count and a way to it, or the all-clear. */
function NeedsYouLine({ total }: { total: number }) {
  if (total === 0)
    return (
      <p className="mr-auto flex items-center gap-2 text-[15px]" data-needs-you-empty>
        <CircleCheck className="size-5 shrink-0 text-done" aria-hidden />
        Nothing is waiting on you. Retake requests, corrections and grading land here.
      </p>
    );
  return (
    <p className="mr-auto flex flex-wrap items-center gap-x-3 text-[15px]" data-needs-total={total}>
      <span className="font-semibold">
        {countWord(total)} {total === 1 ? "thing needs" : "things need"} you.
      </span>
      <a
        href="#needs-you"
        className="inline-flex min-h-11 items-center font-semibold text-stain-deep underline"
      >
        Review
      </a>
    </p>
  );
}

/**
 * The counts above the gradebook (§3.3, §3.4): testing now, corrections owed, missing. Each
 * filters the gradebook the way the old counters did; pressed again, it clears.
 */
function StateChips({
  view,
  active,
  onPick,
  testing = false,
}: {
  view: GradebookView;
  active: WhoChip | null;
  onPick: (c: WhoChip) => void;
  /** Live mode also shows "testing now". */
  testing?: boolean;
}) {
  const all: { who: WhoChip; label: string; look: string }[] = [
    { who: "testing", label: "testing now", look: chip.violet },
    { who: "corrections", label: "corrections owed", look: chip.owed },
    { who: "missing", label: "missing", look: chip.missing },
  ];
  const shown = all.filter((c) => testing || c.who !== "testing");
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Filter the gradebook"
    >
      {shown.map((c) => (
        <button
          key={c.who}
          type="button"
          aria-pressed={active === c.who}
          data-state-chip={c.who}
          className={cn(
            chip.base,
            "min-h-11 px-4",
            c.look,
            active === c.who && "outline-2 outline-offset-1 outline-ink"
          )}
          onClick={() => onPick(c.who)}
        >
          <span className="tabular">{view.chips[c.who]}</span> {c.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiet mode
// ---------------------------------------------------------------------------

/** The narrow column beside the queue (§3.4): "Up next" and "Most to do", each omitted when empty. */
function QuietSide({
  gb,
  view,
  period,
  onOpen,
}: {
  gb: ClassGradebook;
  view: GradebookView;
  period: string | null;
  onOpen: (t: PanelTarget) => void;
}) {
  const next = upNext(gb);
  const most = mostToDo(view.rows);
  if (!next && !most) return null;
  return (
    <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
      {next ? (
        <section
          className="rounded-[24px] bg-stain p-6 text-white"
          aria-labelledby="up-next-title"
          data-up-next
        >
          <p className="text-sm font-semibold">Up next, {period ?? gb.class.name}</p>
          <h2
            id="up-next-title"
            className="mt-2 font-display text-2xl leading-tight font-semibold tracking-tight"
          >
            {next.title}
          </h2>
          <p className="mt-2 text-[15px]">
            {next.status === "scheduled" ? (
              next.opensAt ? (
                <>
                  Opens <LocalTime date={next.opensAt} mode="day-at" />.
                </>
              ) : (
                "Not open yet."
              )
            ) : (
              <>
                {next.closesAt ? (
                  <>
                    Closes <LocalTime date={next.closesAt} mode="day-at" />.
                  </>
                ) : (
                  "Open now."
                )}{" "}
                {next.turnedIn} of {next.roster} turned in.
              </>
            )}
          </p>
          <Link
            href={`/app/results/${next.assignmentId}`}
            className={cn(btn.base, btn.white, "mt-4")}
          >
            Open live view
          </Link>
        </section>
      ) : null}
      {most ? (
        <section className={cn(card, "p-6")} aria-labelledby="most-title" data-most-to-do>
          <h2
            id="most-title"
            className="font-display text-2xl leading-tight font-semibold tracking-tight"
          >
            Most to do
          </h2>
          <ul className="mt-3 flex flex-col">
            {most.top.map((m) => (
              <li key={m.student.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] px-2 text-left text-[15px] font-medium hover:bg-stain-wash"
                  onClick={() => onOpen({ kind: "student", studentId: m.student.id })}
                >
                  <span className="truncate">
                    {m.student.firstName} {m.student.lastName}
                  </span>
                  <span
                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-owed px-1.5 text-[13px] font-bold text-owed-text tabular"
                    aria-label={`${m.count} to do`}
                  >
                    {m.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {most.more ? <p className="mt-2 px-2 text-sm text-ink-muted">{most.more}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

/**
 * "Where the period stands" (§3.4): the class average of each assessment as a bar, grouped by
 * unit, from the same averages the gradebook's class row shows. Under 70 the bar is lighter.
 * With "Hide scores" on, the numbers and the bars' lengths drop out.
 */
function UnitBars({
  gb,
  view,
  hideScores,
}: {
  gb: ClassGradebook;
  view: GradebookView;
  hideScores: boolean;
}) {
  const groups = unitGroups(view.columns);
  if (groups.length === 0)
    return (
      <p className="text-[15px] text-ink-muted">
        No scores yet. Class averages show here once {gb.class.name} turns something in.
      </p>
    );
  return (
    <div>
      <div
        className="grid gap-7"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}
      >
        {groups.map((g) => (
          <div key={g.unitId ?? "none"} data-unit-group={g.unitId ?? "none"}>
            <h3 className="font-body text-[15px] font-bold tracking-normal">{g.name}</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {g.rows.map((r) => {
                const avg = r.average === null ? null : Math.round(r.average);
                return (
                  <li key={r.assignmentId} className="flex items-center gap-3" title={r.title}>
                    <span className="w-16 shrink-0 truncate text-sm text-ink-muted">{r.label}</span>
                    <span
                      className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-line-soft"
                      aria-hidden
                    >
                      {avg !== null && !hideScores ? (
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            avg < 70 ? "bg-stain-pale" : "bg-stain"
                          )}
                          style={{ width: `${Math.max(0, Math.min(100, avg))}%` }}
                        />
                      ) : null}
                    </span>
                    <span className="w-9 shrink-0 text-right font-display text-base font-semibold tabular">
                      {avg !== null && !hideScores ? avg : "–"}
                      <span className="sr-only"> class average on {r.title}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-5 text-[13px] text-ink-muted">Class averages. Lighter bars are below 70.</p>
    </div>
  );
}

/** No course, no class, nobody enrolled, or nothing assigned: what to do next. */
function NoGradebook({
  course,
  gb,
}: {
  course: { id: string; name: string } | null;
  gb: ClassGradebook | null;
}) {
  const [title, description, href, label] = !course
    ? [
        "No course yet",
        "Make a course and a class, and this class's gradebook shows here.",
        "/app/courses",
        "Courses",
      ]
    : !gb
      ? [
          `No classes on ${course.name} yet`,
          "Add a class period for this course on the Classes page, or pick another course in the sidebar.",
          "/app/classes",
          "Classes",
        ]
      : gb.students.length === 0
        ? [
            "Nobody has joined this class yet",
            "Students show here once they join with the class code.",
            `/app/classes/${gb.class.id}`,
            "Class page",
          ]
        : [
            "Nothing assigned yet",
            "Tests you assign to this class show here as columns.",
            "/app/assign",
            "Assign",
          ];
  return (
    <EmptyState
      icon={Users}
      title={title}
      description={description}
      action={
        <Link href={href} className={cn(btn.base, btn.outline)}>
          {label}
        </Link>
      }
      className="py-6"
    />
  );
}
