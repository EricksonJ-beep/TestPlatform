import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Shuffle } from "lucide-react";
import { isAuthzError, requireShared } from "@/lib/authz";
import { buildQuestionSet, seededRng } from "@/lib/assessments/serve";
import {
  getAssessmentDetail,
  loadBuilderSections,
  questionsForServedSet,
} from "@/lib/queries/assessments";
import { QuestionView } from "@/components/questions/question-view";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Preview as student" };

/**
 * One concrete draw of the assessment, exactly as the serve library would hand it
 * to a student: pool draws resolved, order randomized if set, stimulus groups
 * contiguous. The seed is in the URL so a draw can be shared or reshuffled.
 */
export default async function AssessmentPreviewPage({
  params,
  searchParams,
}: PageProps<"/app/assessments/[assessmentId]/preview">) {
  const { assessmentId } = await params;
  const sp = await searchParams;
  try {
    await requireShared({ type: "assessment", id: assessmentId }, "view");
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const detail = await getAssessmentDetail(assessmentId);
  if (!detail) notFound();
  const seed = Number(typeof sp.seed === "string" ? sp.seed : "") || 1;
  const sections = await loadBuilderSections(assessmentId);
  const served = buildQuestionSet(sections, {
    randomizeQuestions: detail.randomizeQuestions,
    rng: seededRng(seed),
  });
  const questions = await questionsForServedSet(served.map((q) => q.questionId));
  const sectionById = new Map(detail.sections.map((s) => [s.id, s]));
  const totalPoints = served.reduce((n, q) => n + q.points, 0);

  // Group consecutive questions that share a stimulus, within each section.
  type Block = {
    key: string;
    sectionId: string;
    stimulus: NonNullable<ReturnType<typeof questions.get>>["stimulus"];
    items: typeof served;
  };
  const blocks: Block[] = [];
  for (const s of served) {
    const q = questions.get(s.questionId);
    const stim = q?.stimulus ?? null;
    const last = blocks[blocks.length - 1];
    if (last && last.sectionId === s.sectionId && stim && last.stimulus?.id === stim.id)
      last.items.push(s);
    else
      blocks.push({
        key: `${s.sectionId}:${s.order}`,
        sectionId: s.sectionId,
        stimulus: stim,
        items: [s],
      });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <Link
            href={`/app/assessments/${detail.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden /> {detail.title}
          </Link>
          <h1 className="mt-2 text-2xl">Preview as student</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {served.length} {served.length === 1 ? "question" : "questions"} · {totalPoints}{" "}
            {totalPoints === 1 ? "point" : "points"} · draw #{seed}
            {detail.randomizeQuestions ? " · randomized" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/app/assessments/${detail.id}/preview?seed=${seed + 1}`} />}
        >
          <Shuffle data-icon="inline-start" aria-hidden />
          Reshuffle
        </Button>
      </div>

      {detail.instructions ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          {detail.instructions}
        </p>
      ) : null}

      {served.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing to serve yet. Add questions or a pool draw to a section.
        </p>
      ) : null}

      {blocks.map((b, i) => {
        const section = sectionById.get(b.sectionId);
        const firstOfSection = i === 0 || blocks[i - 1].sectionId !== b.sectionId;
        return (
          <section key={b.key} className="flex flex-col gap-3">
            {firstOfSection && section ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-b border-border pb-1">
                <h2 className="text-sm font-medium">{section.title}</h2>
                {section.learningTarget ? (
                  <TargetChip
                    code={section.learningTarget.code}
                    title={section.learningTarget.title}
                  />
                ) : null}
                {section.instructions ? (
                  <span className="text-xs text-muted-foreground">{section.instructions}</span>
                ) : null}
              </div>
            ) : null}
            {b.stimulus ? <StimulusPanel stimulus={b.stimulus} count={b.items.length} /> : null}
            {b.items.map((s) => {
              const q = questions.get(s.questionId);
              if (!q) return null;
              return (
                <QuestionView
                  key={s.questionId}
                  question={{ ...q, points: s.points }}
                  number={s.order}
                  total={served.length}
                  className={b.stimulus ? "ml-3 border-l-4 border-l-brand/30" : undefined}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
