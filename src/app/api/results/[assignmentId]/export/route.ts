import { requireOwner, withAuthzRoute } from "@/lib/authz";
import { toCsv } from "@/lib/csv";
import { getAssignmentRow } from "@/lib/queries/assignments";
import { highestScoresRows } from "@/lib/queries/results";

export const dynamic = "force-dynamic";

/**
 * Highest scores as a CSV for gradebook entry (Skyward): one row per enrolled
 * student, last name first, with the score that counts. Blank score = no attempt.
 */
export const GET = withAuthzRoute<{ params: Promise<{ assignmentId: string }> }>(
  async (_req, ctx) => {
    const { assignmentId } = await ctx.params;
    await requireOwner({ type: "assignment", id: assignmentId });
    const [row, rows] = await Promise.all([
      getAssignmentRow(assignmentId),
      highestScoresRows(assignmentId),
    ]);
    if (!row) return new Response("Not found", { status: 404 });
    const csv = toCsv(
      ["last_name", "first_name", "email", "score", "max_score", "percent", "attempts"],
      rows.map((r) => [
        r.lastName,
        r.firstName,
        r.email,
        r.score,
        r.maxScore,
        r.percent === null ? null : Math.round(r.percent * 10) / 10,
        r.attempts,
      ])
    );
    const slug = `${row.assessmentTitle} ${row.className}`
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-scores.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
);
