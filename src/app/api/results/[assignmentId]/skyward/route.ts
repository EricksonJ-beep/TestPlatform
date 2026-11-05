import { strToU8, zipSync } from "fflate";
import { requireOwner, withAuthzRoute } from "@/lib/authz";
import { getSkywardExport, type SkywardExport } from "@/lib/queries/skyward";
import { changedRowsOnly, recordSkywardMarks } from "@/lib/queries/skyward-updates";
import { isSameOrigin } from "@/lib/same-origin";
import { skywardCsv, type SkywardFile } from "@/lib/skyward";

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

/** One CSV, or every file as one .zip (just the CSV when there's only one). */
function filesResponse(
  data: SkywardExport,
  files: SkywardFile[],
  names: string[],
  file: string | null
): Response {
  if (file !== null) {
    const i = Number(file);
    if (!Number.isInteger(i) || !files[i]) return new Response("Not found", { status: 404 });
    return csvResponse(files[i].csv, names[i]);
  }
  const picked = files.map((f, i) => ({ f, name: names[i] })).filter((x) => x.f.rows > 0);
  if (picked.length === 0) return new Response("Nothing to download", { status: 404 });
  if (picked.length === 1) return csvResponse(picked[0].f.csv, picked[0].name);
  const used = new Map<string, number>();
  const entries: Record<string, Uint8Array> = {};
  for (const { f, name } of picked) {
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    entries[`${n > 1 ? `${name}-${n}` : name}.csv`] = strToU8(f.csv);
  }
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

/**
 * The Skyward files for one assignment (docs/relearning-revamp-plan.md K1–K2, ticket R8): `?file=i`
 * downloads one CSV, otherwise every file comes as one .zip (or the CSV itself when there's only
 * one). Each `n` query parameter, in file order, renames a file. Owner only. A plain link: it
 * records nothing (the page's buttons use POST below).
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
    return filesResponse(data, data.files, names, url.searchParams.get("file"));
  }
);

/**
 * The same files from the page's Download buttons (a form post), and Bloom remembers what it handed
 * over as what Skyward now has (Skyward updates, Nov 5 2026). `changes=1` cuts each file to the
 * students whose score changed since. Owner only, and only from Bloom's own pages.
 */
export const POST = withAuthzRoute<{ params: Promise<{ assignmentId: string }> }>(
  async (req, ctx) => {
    if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
    const { assignmentId } = await ctx.params;
    await requireOwner({ type: "assignment", id: assignmentId });
    const data = await getSkywardExport(assignmentId);
    if (!data) return new Response("Not found", { status: 404 });
    const form = await req.formData();
    const typed = form.getAll("n").map(String);
    const names = data.files.map((f, i) => cleanName(typed[i]) || f.name);
    const changesOnly = form.get("changes") === "1";
    const files = changesOnly
      ? (await changedRowsOnly(data)).map((f) => ({ ...f, csv: skywardCsv(f.students) }))
      : data.files;
    const fileParam = form.get("file");
    const file = fileParam === null ? null : String(fileParam);
    const res = filesResponse(data, files, names, file);
    if (res.ok) {
      const handed = file === null ? files : [files[Number(file)]];
      await recordSkywardMarks(assignmentId, handed, "export");
    }
    return res;
  }
);
