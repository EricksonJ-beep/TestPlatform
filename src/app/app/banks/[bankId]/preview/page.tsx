import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireShared } from "@/lib/authz";
import { getBank, listBankQuestions } from "@/lib/queries/banks";
import { groupByStimulus } from "@/lib/stimulus-groups";
import { QuestionView } from "@/components/questions/question-view";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";

export const metadata: Metadata = { title: "Preview as student" };

/**
 * The bank's questions laid out the way a student will see them: shared
 * stimuli render once above their group, groups stay contiguous.
 */
export default async function BankPreviewPage({
  params,
  searchParams,
}: PageProps<"/app/banks/[bankId]/preview">) {
  const { bankId } = await params;
  const sp = await searchParams;
  try {
    await requireShared({ type: "question_bank", id: bankId }, "view");
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const bank = await getBank(bankId);
  if (!bank) notFound();
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const questions = await listBankQuestions(bank.id, {
    q: str("q"),
    type: str("type"),
    targetId: str("target"),
    tag: str("tag"),
  });
  const groups = groupByStimulus(questions);
  // Number questions in the grouped (served) order without mutating during render.
  const numberOf = new Map<string, number>();
  groups.flatMap((g) => g.questions).forEach((q, i) => numberOf.set(q.id, i + 1));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <Link
          href={`/app/banks/${bank.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> {bank.name}
        </Link>
        <h1 className="mt-2 text-2xl">Preview as student</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {questions.length} {questions.length === 1 ? "question" : "questions"} · shared stimuli
          appear once above their group.
        </p>
      </div>
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-3">
          {g.stimulus ? <StimulusPanel stimulus={g.stimulus} count={g.questions.length} /> : null}
          {g.questions.map((q) => (
            <QuestionView
              key={q.id}
              question={q}
              number={numberOf.get(q.id)}
              total={questions.length}
              className={g.stimulus ? "ml-3 border-l-4 border-l-brand/30" : undefined}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
