import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireShared } from "@/lib/authz";
import { getBank } from "@/lib/queries/banks";
import { getCourseDetail } from "@/lib/queries/courses";
import { isStorageConfigured } from "@/lib/storage";
import { NewQuestionPage } from "../new-question-page";

export const metadata: Metadata = { title: "New question" };

export default async function Page({ params }: PageProps<"/app/banks/[bankId]/questions/new">) {
  const { bankId } = await params;
  try {
    await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const bank = await getBank(bankId);
  if (!bank) notFound();
  const course = bank.courseId ? await getCourseDetail(bank.courseId) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <Link
          href={`/app/banks/${bank.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> {bank.name}
        </Link>
        <h1 className="mt-2 text-2xl">New question</h1>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <NewQuestionPage
          bankId={bank.id}
          targets={(course?.targets ?? []).map((t) => ({ id: t.id, code: t.code, title: t.title }))}
          units={(course?.units ?? []).map((u) => ({ id: u.id, name: u.name }))}
          storageConfigured={isStorageConfigured()}
        />
      </div>
    </div>
  );
}
