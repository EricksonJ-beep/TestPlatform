import { strToU8, zipSync } from "fflate";
import { requireOwner, withAuthzRoute } from "@/lib/authz";
import { getSkywardExport } from "@/lib/queries/skyward";

export const dynamic = "force-dynamic";

/** A file name the teacher typed, kept to what a file system and Skyward's picker accept. */
function cleanName(name: string | null | undefined): string {
  return (name ?? "").replace(/[^\w,.-]+/g, "").slice(0, 60);
}

function csvResponse(csv: string, name: string) {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * The Skyward files for one assignment (docs/relearning-revamp-plan.md K1–K2, ticket R8): `?file=i`
 * downloads one CSV, otherwise every file comes as one .zip (or the CSV itself when there's only
 * one). Each `n` query parameter, in file order, renames a file. Owner only.
 */
export const GET = withAuthzRoute<{ params: Promise<{ assignmentId: string }> }>(
  async (req, ctx) => {
    const { assignmentId } = await ctx.params;
    await requireOwner({ type: "assignment", id: assignmentId });
    const data = await getSkywardExport(assignmentId);
    if (!data) return new Response("Not found", { status: 404 });
    const url = new URL(req.url);
    const typed = url.searchParams.getAll("n");
    const names = data.files.map((f, i) => cleanName(typed[i]) || f.name);
    const file = url.searchParams.get("file");
    if (file !== null) {
      const i = Number(file);
      if (!Number.isInteger(i) || !data.files[i]) return new Response("Not found", { status: 404 });
      return csvResponse(data.files[i].csv, names[i]);
    }
    if (data.files.length === 1) return csvResponse(data.files[0].csv, names[0]);
    const used = new Map<string, number>();
    const entries: Record<string, Uint8Array> = {};
    data.files.forEach((f, i) => {
      const n = (used.get(names[i]) ?? 0) + 1;
      used.set(names[i], n);
      entries[`${n > 1 ? `${names[i]}-${n}` : names[i]}.csv`] = strToU8(f.csv);
    });
    const zip = zipSync(entries);
    const slug = `${data.assignment.title} ${data.assignment.className}`
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "");
    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}-skyward.zip"`,
        "Cache-Control": "no-store",
      },
    });
  }
);
