import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileUp, Library, Plus } from "lucide-react";
import { isAuthzError, requireShared } from "@/lib/authz";
import { getBank, listBankQuestions, listBankTags, listMoveTargets } from "@/lib/queries/banks";
import { getCourseDetail, listCourses } from "@/lib/queries/courses";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { BankHeader } from "./bank-header";
import { Filters } from "./filters";
import { QuestionList } from "./question-list";

export const metadata: Metadata = { title: "Question bank" };

export default async function BankPage({ params, searchParams }: PageProps<"/app/banks/[bankId]">) {
  const { bankId } = await params;
  const sp = await searchParams;
  let access;
  try {
    access = await requireShared({ type: "question_bank", id: bankId }, "view");
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const bank = await getBank(bankId);
  if (!bank) notFound();
  const canEdit = access.access === "owner" || access.access === "co_edit";

  const str = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const archivedView = sp.archived === "1";
  const filters = {
    q: str("q"),
    type: str("type"),
    targetId: str("target"),
    difficulty: str("difficulty") ? Number(str("difficulty")) : undefined,
    bloom: str("bloom"),
    tag: str("tag"),
    archived: archivedView,
  };
  const [questions, tags, course, courses, moveTargets] = await Promise.all([
    listBankQuestions(bank.id, filters),
    listBankTags(bank.id),
    bank.courseId ? getCourseDetail(bank.courseId) : Promise.resolve(null),
    access.access === "owner" ? listCourses(access.userId) : Promise.resolve([]),
    canEdit ? listMoveTargets(access.userId, bank.courseId, bank.id) : Promise.resolve([]),
  ]);
  const targets = (course?.targets ?? []).map((t) => ({ id: t.id, code: t.code, title: t.title }));
  const units = (course?.units ?? []).map((u) => ({ id: u.id, name: u.name }));
  const filtering = [
    filters.q,
    filters.type,
    filters.targetId,
    filters.difficulty,
    filters.bloom,
    filters.tag,
  ].some((v) => v !== undefined);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <Link
          href={access.access === "owner" ? "/app/banks" : "/app/shared"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />{" "}
          {access.access === "owner" ? "Question banks" : "Shared with me"}
        </Link>
        <BankHeader
          bank={bank}
          access={access.access}
          courses={courses.map((c) => ({ id: c.id, name: c.name }))}
          questionCount={questions.length}
          action={
            canEdit ? (
              <>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/app/banks/${bank.id}/import`} />}
                >
                  <FileUp data-icon="inline-start" aria-hidden />
                  Import CSV
                </Button>
                <Button
                  nativeButton={false}
                  render={<Link href={`/app/banks/${bank.id}/questions/new`} />}
                >
                  <Plus data-icon="inline-start" aria-hidden />
                  New question
                </Button>
              </>
            ) : null
          }
        />
      </div>

      <Filters
        bankId={bank.id}
        targets={targets}
        tags={tags}
        current={{
          q: filters.q,
          type: filters.type,
          target: filters.targetId,
          difficulty: filters.difficulty,
          bloom: filters.bloom,
          tag: filters.tag,
        }}
      />
      <div className="-mt-3 flex justify-end">
        <Link
          href={archivedView ? `/app/banks/${bank.id}` : `/app/banks/${bank.id}?archived=1`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {archivedView ? "Back to live questions" : "Show archived questions"}
        </Link>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Library}
            title={
              archivedView
                ? "Nothing archived"
                : filtering
                  ? "No questions match those filters"
                  : "No questions yet"
            }
            description={
              archivedView
                ? "Archived questions and older versions show up here."
                : filtering
                  ? "Clear a filter or two."
                  : canEdit
                    ? "Import the CSV template to load a whole unit at once, or write the first question by hand."
                    : "The owner hasn't added questions yet."
            }
            action={
              !filtering && !archivedView && canEdit ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    nativeButton={false}
                    render={<Link href={`/app/banks/${bank.id}/import`} />}
                  >
                    Import CSV
                  </Button>
                  <Button
                    nativeButton={false}
                    render={<Link href={`/app/banks/${bank.id}/questions/new`} />}
                  >
                    New question
                  </Button>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : (
        <QuestionList
          bankId={bank.id}
          questions={questions}
          canEdit={canEdit}
          archivedView={archivedView}
          editor={{ targets, units, moveTargets }}
        />
      )}
    </div>
  );
}
