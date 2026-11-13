import { requireOwner, withAuthzRoute } from "@/lib/authz";
import { getTierBoard, getTierBoardVersion } from "@/lib/queries/tiers";

export const dynamic = "force-dynamic";

/** The tier board's data, polled by the board page every few seconds (PLAN.md §3.11). */
export const GET = withAuthzRoute<{ params: Promise<{ assignmentId: string }> }>(
  async (req, ctx) => {
    const { assignmentId } = await ctx.params;
    await requireOwner({ type: "assignment", id: assignmentId });
    const sp = new URL(req.url).searchParams;
    const all = sp.get("all") === "1";
    // The page sends the version it holds (H5.1): when nothing has changed, answer with that
    // alone and skip the per-student load.
    const held = sp.get("v");
    if (held && held === (await getTierBoardVersion(assignmentId, { allPeriods: all })))
      return Response.json({ unchanged: true }, { headers: { "cache-control": "no-store" } });
    const board = await getTierBoard(assignmentId, { allPeriods: all });
    if (!board) return Response.json({ error: "Not a summative." }, { status: 404 });
    return Response.json(board, { headers: { "cache-control": "no-store" } });
  }
);
