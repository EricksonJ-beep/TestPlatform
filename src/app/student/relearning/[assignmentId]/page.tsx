import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, Clock, Lock } from "lucide-react";
import { eq, inArray } from "drizzle-orm";
import { cn } from "cn";
import { db, schema } from "@/db";
import { isAuthzError, isUuid, requireAssignmentAccess } from "@/lib/authz";
import { targetList } from "@/lib/quiz-practice";
import { MODE_EMOJI, MODE_LABEL, publicCheck } from "@/lib/relearning";
import { nextCheck } from "@/lib/relearning-path";
import { getRelearningView } from "@/lib/relearning-server";
import { Button } from "@/components/ui/button";
import { StartCheckButton } from "../../checks/start-check-button";
import { RelearnPicker } from "./relearn-picker";
import { RelearningActivity, type ActivityRow } from "./relearning-activity";

export const metadata: Metadata = { title: "Relearning" };

/**
 * A student's relearning on one assignment (docs/relearning-revamp-plan.md A1–A6, Q3, S2; ticket
 * R4): the Read · Watch · Do picker until they pick, then the activity, its sections in order
 * (a quiz's targets stitched together, a test one target at a time via `?target=`), and once
 * it's done, the practice check. Keys never reach the browser: quick checks go out without their
 * answers, and an explanation only once the check is right.
 */
export default async function RelearningPage({
  params,
  searchParams,
}: PageProps<"/student/relearning/[assignmentId]">) {
  const { assignmentId } = await params;
  const sp = await searchParams;
  const targetParam = typeof sp.target === "string" && isUuid(sp.target) ? sp.target : null;
  let access;
  try {
    access = await requireAssignmentAccess(assignmentId);
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "student") notFound();
  const [asg] = await db
    .select({ title: schema.assessments.title, type: schema.assessments.type })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!asg) notFound();
  const view = await getRelearningView(assignmentId, access.userId, targetParam);
  const back = (
    <Link
      href={`/student/assignments/${assignmentId}`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden /> {asg.title}
    </Link>
  );
  if (!view) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {back}
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          There&apos;s no relearning to do on this one right now.
        </p>
      </div>
    );
  }

  const { plan, bundle } = view;
  const state = plan.ctx.state;
  const info = new Map(state.targets.map((t) => [t.id, t]));
  const code = (id: string) => info.get(id)?.code ?? "";
  const isTest = state.type === "summative";
  const codes = targetList(bundle.targetIds.map(code));
  const check = nextCheck(state);
  const bundleCheck =
    check?.kind === "path" && bundle.bundleId && check.bundleId === bundle.bundleId ? check : null;

  // A test's other required targets, each relearned on its own (S2).
  const others = isTest ? plan.bundles.filter((b) => b !== bundle) : [];

  // The rows as the browser gets them: sections without keys, explanations only once right.
  const mediaIds = [...view.sectionsByRow.values()]
    .flat()
    .map((s) => s.mediaAssetId)
    .filter((id): id is string => !!id);
  const media = mediaIds.length
    ? await db
        .select({ id: schema.mediaAssets.id, url: schema.mediaAssets.url })
        .from(schema.mediaAssets)
        .where(inArray(schema.mediaAssets.id, mediaIds))
    : [];
  const mediaUrl = new Map(media.map((m) => [m.id, m.url]));
  const rows: ActivityRow[] = bundle.rows.map((r) => {
    const sections = view.sectionsByRow.get(r.id) ?? [];
    const progress = r.progress ?? {};
    const explanations: Record<string, string> = {};
    for (const s of sections)
      for (const c of s.checks)
        if (progress.checks?.[c.id]?.correct && c.explanation) explanations[c.id] = c.explanation;
    return {
      id: r.id,
      targetId: r.learningTargetId,
      code: code(r.learningTargetId),
      title: info.get(r.learningTargetId)?.title ?? "",
      finished: r.finishedAt !== null,
      checkedOff: !!r.checkedOffBy,
      progress,
      explanations,
      sections: sections.map((s) => ({
        id: s.id,
        part: s.part,
        title: s.title,
        body: s.body,
        checks: s.checks.map(publicCheck),
        shortAnswerPrompt: s.shortAnswerPrompt,
        estMinutes: s.estMinutes,
        videoUrl: s.mediaAssetId ? (mediaUrl.get(s.mediaAssetId) ?? null) : null,
      })),
    };
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" data-relearning-page>
      <div>
        {back}
        <h1 className="mt-2 text-2xl">Relearn {codes || "your targets"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {bundle.targetIds
            .map((id) => info.get(id)?.title)
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {others.length ? (
        <nav
          className="flex flex-wrap gap-2 text-sm"
          aria-label="Your other targets"
          data-other-targets
        >
          {plan.bundles.map((b) => {
            const id = b.targetIds[0];
            const here = b === bundle;
            return (
              <Link
                key={id}
                href={`/student/relearning/${assignmentId}?target=${id}`}
                aria-current={here ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3",
                  here
                    ? "border-brand bg-brand-soft font-medium text-brand-deep"
                    : "border-border bg-card hover:bg-muted/50"
                )}
              >
                {b.finished ? (
                  <CheckCircle2 className="size-4 text-success-foreground" aria-label="done" />
                ) : null}
                {code(id)}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {bundle.finished ? (
        <section
          className="flex flex-col gap-3 rounded-lg border border-success/40 bg-success-soft px-4 py-4 text-sm sm:flex-row sm:items-center"
          data-relearning-done
        >
          <span className="mr-auto inline-flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-foreground" aria-hidden />
            <span>
              <strong>Relearning done.</strong>{" "}
              {bundleCheck
                ? `Next: a practice check on ${targetList(bundleCheck.targetIds.map(code))}. Get ${state.passMark} of 5 right; your first answer counts.`
                : "Your next step is on the assignment page."}
            </span>
          </span>
          {bundleCheck ? (
            <StartCheckButton
              assignmentId={assignmentId}
              kind="path"
              bundleId={bundleCheck.bundleId}
            />
          ) : (
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/student/assignments/${assignmentId}`} />}
            >
              Back to {asg.title}
            </Button>
          )}
        </section>
      ) : !bundle.bundleId && !bundle.open ? (
        <p
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-relearning-locked
        >
          <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Your relearning opens once your corrections are turned in.
          <Link
            href={`/student/corrections/${plan.ctx.firstAttemptId}`}
            className="ml-auto font-medium text-brand-deep hover:underline"
          >
            Corrections
          </Link>
        </p>
      ) : !bundle.bundleId && view.choices.length === 0 ? (
        <p
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-relearning-unbuilt
        >
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Your teacher will give you a relearning activity for {codes}. They&apos;ll check it off
          here when you&apos;re done.
        </p>
      ) : !bundle.bundleId ? (
        <RelearnPicker
          assignmentId={assignmentId}
          targetId={isTest ? (bundle.targetIds[0] ?? null) : null}
          choices={view.choices}
          fallbackCodes={Object.fromEntries(
            view.choices.map((c) => [c.mode, c.fallbackFor.map(code)])
          )}
          addable={bundle.addable.map((id) => ({
            id,
            code: code(id),
            percent: Math.round(info.get(id)?.firstPercent ?? 0),
          }))}
          needsPick={bundle.targetIds.length === 0}
        />
      ) : null}

      {bundle.bundleId && !bundle.finished && bundle.mode ? (
        <RelearningActivity
          assignmentId={assignmentId}
          targetId={isTest ? (bundle.targetIds[0] ?? null) : null}
          mode={bundle.mode}
          modeLabel={`${MODE_EMOJI[bundle.mode]} ${MODE_LABEL[bundle.mode]}`}
          switchTo={view.choices
            .filter((c) => c.mode !== bundle.mode)
            .map((c) => ({ mode: c.mode, label: `${MODE_EMOJI[c.mode]} ${MODE_LABEL[c.mode]}` }))}
          rows={rows}
        />
      ) : null}
    </div>
  );
}
