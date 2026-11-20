import Link from "next/link";
import { cn } from "cn";
import { SCHOOL_TIME_ZONE } from "@/lib/reopen";
import { TYPE_LABEL, type ToDoRow } from "@/lib/student-home";
import {
  firstUnanswered,
  fixCount,
  nowButtonLabel,
  nowStatus,
  RETAKE_CAPTION,
  retakeNote,
} from "@/lib/student-home-view";
import { btn, chip } from "@/components/home/ui";
import { LocalTime } from "@/components/local-time";
import { StepPathLines } from "@/components/step-path";
import { RequestRetakeButton } from "./assignments/[assignmentId]/request-retake-button";
import { UrgencyPill } from "./urgency-pill";

/**
 * The student home's three steps as the redesign draws them (BLOOM_HOME_REDESIGN.md §5; Jon,
 * Oct 20 2026: "the most current item at the top… then the other corrections or retake options
 * in separate sections"): one dark "do this now" panel, then "Then fix these" and "Want a higher
 * score?" side by side. The rows and their order come from `homeLanes`, unchanged. Server
 * rendered and read-only apart from "Ask to retake", so "Viewing as" sees it as is.
 */

/** Per open attempt: each served question's answered state, by assignment id. */
export type AnswerMaps = ReadonlyMap<string, boolean[]>;

const answersOf = (r: ToDoRow, maps: AnswerMaps) =>
  (r.assignmentId ? maps.get(r.assignmentId) : undefined) ?? null;

// ---------------------------------------------------------------------------
// Do this now
// ---------------------------------------------------------------------------

/**
 * §5.2: the single most urgent test (an open attempt first, then the soonest close: the Now
 * lane's own order) with its question dots and one big button; any others as compact rows under
 * it. With nothing to start it shrinks to one line.
 */
export function NowPanel({ rows, answers }: { rows: ToDoRow[]; answers: AnswerMaps }) {
  if (rows.length === 0)
    return (
      <section
        className="bloom-panel rounded-[28px] px-5 py-5 sm:px-9"
        aria-label="Do this now"
        data-lane="now"
      >
        <p className="text-[17px]">Nothing to start. Your next quiz will show up here.</p>
      </section>
    );
  const [r, ...rest] = rows;
  const map = answersOf(r, answers);
  const answered = map ? map.filter(Boolean).length : (r.progress?.value ?? null);
  const total = map ? map.length : (r.progress?.max ?? null);
  const a = r.action?.kind === "link" ? r.action : null;
  return (
    <section
      className="bloom-panel rounded-[28px] p-5 sm:p-9"
      aria-labelledby="now-title"
      data-lane="now"
      data-todo-group="todo"
      data-todo-kind={r.kind}
      data-assignment={r.assignmentId ?? undefined}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
        {r.when ? <UrgencyPill at={r.when.at} schoolTimeZone={SCHOOL_TIME_ZONE} /> : null}
        {r.when ? (
          <span className="text-on-ink-muted" data-when>
            {r.when.label} <LocalTime date={r.when.at} mode="at" />
          </span>
        ) : null}
        {r.type ? (
          <span className="inline-flex min-h-8 items-center rounded-full border border-white/40 px-3 text-[13px] font-semibold">
            {TYPE_LABEL[r.type]}
          </span>
        ) : null}
        {r.className ? <span className="text-on-ink-muted">{r.className}</span> : null}
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-10 gap-y-7">
        <div className="min-w-0 flex-[1_1_420px]">
          <h2
            id="now-title"
            className="font-display text-[clamp(34px,6vw,52px)] leading-[1.02] font-semibold tracking-[-0.03em]"
          >
            {r.title}
          </h2>
          <p className="mt-3 text-[17px] text-on-ink-muted">{nowStatus(r, map)}</p>
          {map && map.length > 0 ? <QuestionDots answers={map} /> : null}
        </div>
        <div className="flex flex-col items-start gap-4 sm:items-end">
          {answered !== null && total ? (
            <p className="flex items-baseline gap-3">
              <span className="font-display text-[64px] leading-none font-semibold tracking-[-0.03em] tabular">
                {answered}
              </span>
              <span className="text-[17px] text-on-ink-muted">of {total} answered</span>
            </p>
          ) : null}
          {a ? (
            <Link
              href={a.href}
              className="inline-flex h-[60px] items-center justify-center rounded-xl bg-eosin px-8 text-[19px] font-bold whitespace-nowrap text-ink hover:bg-eosin-pale"
              aria-label={`${nowButtonLabel(r)}: ${r.title}`}
            >
              {nowButtonLabel(r)}
            </Link>
          ) : null}
        </div>
      </div>

      {rest.length ? (
        <ul className="mt-8 flex flex-col gap-2.5" aria-label="Also to start">
          {rest.map((x) => (
            <li
              key={x.key}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-ink-raised px-5 py-4"
              data-todo-kind={x.kind}
              data-assignment={x.assignmentId ?? undefined}
            >
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-[13px] font-semibold text-stain-light">
                  {x.kind === "keep_going" ? "In progress" : "Not started"}
                  {x.type ? `, ${TYPE_LABEL[x.type].toLowerCase()}` : ""}
                </p>
                <h3 className="font-body text-[17px] leading-snug font-semibold tracking-normal">
                  {x.title}
                </h3>
                <p className="text-sm text-on-ink-muted">
                  {x.when ? (
                    <>
                      {x.when.label} <LocalTime date={x.when.at} mode="day-at" />.{" "}
                    </>
                  ) : null}
                  {x.progress ? `${x.progress.label}.` : nowStatus(x, answersOf(x, answers))}
                </p>
              </div>
              {x.action?.kind === "link" ? (
                <Link
                  href={x.action.href}
                  className={cn(btn.base, btn.eosin)}
                  aria-label={`${x.action.label}: ${x.title}`}
                >
                  {x.action.label}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * One 15px circle per question, coloured by that question's own answered state, so a skipped
 * question shows as a gap; the next unanswered one is pink and pulses. Over 60 questions, a
 * single 12px bar instead.
 */
function QuestionDots({ answers }: { answers: boolean[] }) {
  const answered = answers.filter(Boolean).length;
  const label = `${answered} of ${answers.length} questions answered`;
  if (answers.length > 60)
    return (
      <div
        className="mt-6 h-3 w-full max-w-[560px] overflow-hidden rounded-full bg-white/[0.18]"
        role="img"
        aria-label={label}
        data-question-progress
      >
        <div
          className="h-full rounded-full bg-stain-light"
          style={{ width: `${(answered / answers.length) * 100}%` }}
        />
      </div>
    );
  const next = firstUnanswered(answers);
  return (
    <div
      className="mt-6 flex max-w-[560px] flex-wrap gap-[7px]"
      role="img"
      aria-label={label}
      data-question-dots
    >
      {answers.map((done, i) => (
        <span
          key={i}
          className={cn(
            "size-[15px] rounded-full",
            done ? "bg-stain-light" : i + 1 === next ? "bloom-pulse bg-eosin" : "bg-white/[0.18]"
          )}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Then fix these
// ---------------------------------------------------------------------------

function SectionHead({ id, title, count }: { id: string; title: string; count: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="font-display text-[26px] leading-tight font-semibold tracking-tight">
        {title}
      </h2>
      <p className="text-[15px] text-ink-muted tabular">{count}</p>
    </div>
  );
}

function TypeChip({ type }: { type: ToDoRow["type"] }) {
  return type ? <span className={cn(chip.base, chip.neutral)}>{TYPE_LABEL[type]}</span> : null;
}

/**
 * §5.3: one white card per thing to fix (corrections, and the steps that unlock a retake): the
 * title, the row's own sentence, its progress in amber, and one full-width button.
 */
export function FixSection({ rows, first }: { rows: ToDoRow[]; first: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-labelledby="fix-title"
      data-lane="fix"
      data-todo-group="todo"
    >
      <SectionHead
        id="fix-title"
        title={first ? "Fix these" : "Then fix these"}
        count={fixCount(rows)}
      />
      <ul className="flex flex-col gap-4">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5"
            data-todo-kind={r.kind}
            data-assignment={r.assignmentId ?? undefined}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="font-body text-lg leading-snug font-bold tracking-normal">
                {r.title}
              </h3>
              <TypeChip type={r.type} />
            </div>
            {r.path?.length ? <StepPathLines lines={r.path} mini /> : null}
            {r.why ? <p>{r.why}</p> : null}
            {r.note ? (
              <p className="rounded-xl bg-owed px-3 py-2 text-[15px] text-owed-text">
                Your teacher: “{r.note}”
              </p>
            ) : null}
            {r.checklist.length ? (
              <ul className="flex flex-col gap-1 text-sm" aria-label="Relearning checklist">
                {r.checklist.map((t) => (
                  <li key={t.code} className="flex flex-wrap gap-x-3">
                    <span className="font-semibold tabular">{t.code}</span>
                    <span className="text-ink-muted">
                      {[
                        `corrections ${t.corrections ? "done" : "not yet"}`,
                        `activity ${t.activity ? "done" : "not yet"}`,
                        `practice ${t.practice ? "done" : "not yet"}`,
                      ].join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {r.progress ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className="h-2.5 min-w-24 flex-1 overflow-hidden rounded-full bg-line-soft"
                  aria-hidden
                >
                  <span
                    className="block h-full rounded-full bg-owed-bar"
                    style={{
                      width: `${r.progress.max > 0 ? Math.min(100, (r.progress.value / r.progress.max) * 100) : 0}%`,
                    }}
                  />
                </span>
                <span className="text-sm text-ink-muted tabular">{r.progress.label}</span>
              </div>
            ) : null}
            {r.when || r.minutes ? (
              <p className="text-sm text-ink-muted" data-when>
                {r.when ? (
                  <>
                    {r.when.label} <LocalTime date={r.when.at} />.{" "}
                  </>
                ) : null}
                {r.minutes ? `About ${r.minutes} minutes.` : null}
              </p>
            ) : null}
            <RowAction r={r} className="h-12 w-full" look={btn.dark} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A row's one button: a link, or the request button. Nothing while it waits. */
function RowAction({ r, className, look }: { r: ToDoRow; className?: string; look: string }) {
  const a = r.action;
  if (!a) return null;
  if (a.kind === "ask")
    return (
      <RequestRetakeButton
        assignmentId={a.assignmentId}
        attemptNumber={a.attemptNumber}
        label={a.label}
        title={r.title}
        look="home"
      />
    );
  return (
    <Link
      href={a.href}
      className={cn(btn.base, look, className)}
      aria-label={`${a.what ?? a.label}: ${r.title}`}
    >
      {a.label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Want a higher score?
// ---------------------------------------------------------------------------

/**
 * §5.4: one white card listing every retake on offer, each with a note and one 44px button:
 * "Ask to retake" (outline), "Practice" where practice comes first (violet), or, once asked,
 * when it was sent and no button. What asking leads to is said once, under the card.
 */
export function RetakeSection({
  rows,
  asked,
  askedAt,
}: {
  rows: ToDoRow[];
  /** Requests already sent, waiting on the teacher. */
  asked: ToDoRow[];
  askedAt: ReadonlyMap<string, Date>;
}) {
  const n = rows.length + asked.length;
  if (n === 0) return null;
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-labelledby="retake-title"
      data-lane="level"
      data-todo-group="higher"
    >
      <SectionHead id="retake-title" title="Want a higher score?" count={`${n} you can retake`} />
      <ul className="rounded-[20px] border border-line bg-surface px-5">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line-soft py-4 first:border-t-0"
            data-todo-kind={r.kind}
            data-assignment={r.assignmentId ?? undefined}
          >
            <div className="min-w-0 flex-1 basis-56">
              <h3 className="font-body text-base leading-snug font-bold tracking-normal">
                {r.title}
              </h3>
              {r.path?.length ? <StepPathLines lines={r.path} mini /> : null}
              {retakeNote(r) ? <p className="text-sm text-ink-muted">{retakeNote(r)}</p> : null}
              {r.when ? (
                <p className="text-sm text-ink-muted" data-when>
                  {r.when.label} <LocalTime date={r.when.at} />.
                </p>
              ) : null}
            </div>
            <RowAction
              r={r}
              look={r.action?.kind === "link" && r.action.primary ? btn.primary : btn.outline}
            />
          </li>
        ))}
        {asked.map((r, i) => {
          const at = r.assignmentId ? askedAt.get(r.assignmentId) : undefined;
          return (
            <li
              key={r.key}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line-soft py-4 first:border-t-0"
              data-todo-kind={r.kind}
              data-todo-group="waiting"
              data-assignment={r.assignmentId ?? undefined}
              // Where focus lands after "Ask to retake": the button that had it is gone.
              data-ask-focus={i === 0 ? "" : undefined}
              tabIndex={i === 0 ? -1 : undefined}
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-body text-base leading-snug font-bold tracking-normal">
                  {r.action?.kind === "link" ? (
                    <Link href={r.action.href} className="underline-offset-2 hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    r.title
                  )}
                </h3>
                <p className="text-sm text-ink-muted">
                  {at ? (
                    <>
                      Asked <LocalTime date={at} />.{" "}
                    </>
                  ) : null}
                  Waiting on your teacher.
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-muted">{RETAKE_CAPTION}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Waiting on your teacher
// ---------------------------------------------------------------------------

/**
 * What the student has turned in and the teacher hasn't answered yet, other than a retake
 * request (that one sits with the retakes): a grade, corrections being checked, an activity to
 * check off. Not counted, and quiet: nothing here is the student's move.
 */
export function WaitingSection({ rows }: { rows: ToDoRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="waiting-title"
      data-todo-group="waiting"
    >
      <SectionHead id="waiting-title" title="Waiting on your teacher" count={`${rows.length}`} />
      <ul className="rounded-[20px] border border-line bg-surface px-5">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line-soft py-4 first:border-t-0"
            data-todo-kind={r.kind}
            data-assignment={r.assignmentId ?? undefined}
          >
            <div className="min-w-0 flex-1 basis-56">
              <h3 className="font-body text-base leading-snug font-bold tracking-normal">
                {r.title}
              </h3>
              {r.why ? <p className="text-sm text-ink-muted">{r.why}</p> : null}
            </div>
            <RowAction r={r} look={btn.outline} />
          </li>
        ))}
      </ul>
    </section>
  );
}
