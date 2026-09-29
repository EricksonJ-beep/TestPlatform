import { requireOwner, withAuthzRoute } from "@/lib/authz";
import { getTierBoard } from "@/lib/queries/tiers";

export const dynamic = "force-dynamic";

/** The tier board's data, polled by the board page every few seconds (PLAN.md §3.11). */
export const GET = withAuthzRoute<{ params: Promise<{ assignmentId: string }> }>(
  async (req, ctx) => {
    const { assignmentId } = await ctx.params;
    await requireOwner({ type: "assignment", id: assignmentId });
    const all = new URL(req.url).searchParams.get("all") === "1";
    const board = await getTierBoard(assignmentId, { allPeriods: all });
    if (!board) return Response.json({ error: "Not a summative." }, { status: 404 });
    return Response.json(board, { headers: { "cache-control": "no-store" } });
  }
);
