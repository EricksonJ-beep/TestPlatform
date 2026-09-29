import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getTierBoard } from "@/lib/queries/tiers";
import { TierBoardView } from "./tier-board";

export const metadata: Metadata = { title: "Tier board" };

/** Teacher screen 6b (PLAN.md §5): the live three-column board for one summative. */
export default async function TierBoardPage({
  params,
  searchParams,
}: PageProps<"/app/results/[assignmentId]/tiers">) {
  const { assignmentId } = await params;
  const sp = await searchParams;
  try {
    await requireOwner({ type: "assignment", id: assignmentId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const allPeriods = sp.all === "1";
  const board = await getTierBoard(assignmentId, { allPeriods });
  if (!board) notFound();
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <Link
        href={`/app/results/${assignmentId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> {board.assignment.title}
      </Link>
      <TierBoardView initial={JSON.parse(JSON.stringify(board))} />
    </div>
  );
}
