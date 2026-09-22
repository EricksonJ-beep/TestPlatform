import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireShared } from "@/lib/authz";
import { getBank } from "@/lib/queries/banks";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import questions" };

export default async function ImportPage({ params }: PageProps<"/app/banks/[bankId]/import">) {
  const { bankId } = await params;
  try {
    await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const bank = await getBank(bankId);
  if (!bank) notFound();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <Link
          href={`/app/banks/${bank.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> {bank.name}
        </Link>
        <h1 className="mt-2 text-2xl">Import questions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One question per row, in the template&apos;s column order. Nothing is written until you
          confirm the preview.
        </p>
      </div>
      <ImportWizard bankId={bank.id} bankName={bank.name} courseName={bank.courseName} />
    </div>
  );
}
