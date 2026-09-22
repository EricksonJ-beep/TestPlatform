import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, History } from "lucide-react";
import { isAuthzError, requireShared } from "@/lib/authz";
import { getBank, getQuestionForEdit } from "@/lib/queries/banks";
import { getCourseDetail } from "@/lib/queries/courses";
import { questionHistory } from "@/lib/questions";
import { RichText } from "@/components/rich-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditQuestionPage } from "../new-question-page";

export const metadata: Metadata = { title: "Edit question" };

export default async function Page({
  params,
}: PageProps<"/app/banks/[bankId]/questions/[questionId]">) {
  const { bankId, questionId } = await params;
  try {
    await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const [bank, question] = await Promise.all([getBank(bankId), getQuestionForEdit(questionId)]);
  if (!bank || !question || question.bankId !== bankId) notFound();
  const [course, versions] = await Promise.all([
    bank.courseId ? getCourseDetail(bank.courseId) : Promise.resolve(null),
    questionHistory(questionId),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <Link
          href={`/app/banks/${bank.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> {bank.name}
        </Link>
        <h1 className="mt-2 text-2xl">Edit question</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Version {question.version}
          {question.externalId ? ` · ${question.externalId}` : ""}
          {question.isArchived ? " · archived" : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="rounded-lg border border-border bg-card p-5">
          <EditQuestionPage
            bankId={bank.id}
            question={question}
            targets={(course?.targets ?? []).map((t) => ({
              id: t.id,
              code: t.code,
              title: t.title,
            }))}
            units={(course?.units ?? []).map((u) => ({ id: u.id, name: u.name }))}
          />
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-brand-deep" aria-hidden /> Versions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="divide-y divide-border text-sm">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className={v.id === question.id ? "bg-brand-soft/50 px-4 py-2" : "px-4 py-2"}
                >
                  <Link href={`/app/banks/${bank.id}/questions/${v.id}`} className="block">
                    <span className="font-medium">v{v.version}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      ·{" "}
                      {new Date(v.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {!v.isArchived ? (
                      <span className="text-success-foreground"> · current</span>
                    ) : null}
                    <RichText
                      text={v.stem}
                      as="span"
                      className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
