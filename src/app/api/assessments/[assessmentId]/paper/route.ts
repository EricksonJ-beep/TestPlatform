import { requireShared, withAuthzRoute } from "@/lib/authz";
import { buildQuestionSet, seededRng } from "@/lib/assessments/serve";
import { buildPaperDoc, paperFileName } from "@/lib/paper/model";
import { renderDocx, type ImageBytes } from "@/lib/paper/render-docx";
import { renderPdf } from "@/lib/paper/render-pdf";
import {
  getAssessmentDetail,
  loadBuilderSections,
  questionsForServedSet,
} from "@/lib/queries/assessments";
import { listTargets } from "@/lib/queries/courses";
import { getObjectStream, isMediaProxyUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_IMAGES = 40;

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}
function jpgSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}

/** Fetch the images a paper needs: R2 objects through the storage client, anything else over HTTP. */
async function loadImages(urls: string[]): Promise<Map<string, ImageBytes>> {
  const out = new Map<string, ImageBytes>();
  for (const url of [...new Set(urls)].slice(0, MAX_IMAGES)) {
    try {
      let bytes: Uint8Array | null = null;
      if (isMediaProxyUrl(url)) {
        const obj = await getObjectStream(url.slice("/api/media/".length));
        if (obj) bytes = await readAll(obj.body);
      } else if (/^https?:\/\//.test(url)) {
        const r = await fetch(url);
        if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
      }
      if (!bytes) continue;
      const png = pngSize(bytes);
      const jpg = png ? null : jpgSize(bytes);
      if (png) out.set(url, { data: bytes, type: "png", ...png });
      else if (jpg) out.set(url, { data: bytes, type: "jpg", ...jpg });
    } catch {
      /* the paper prints "[image]" in its place */
    }
  }
  return out;
}

/**
 * Download an assessment as paper: ?format=docx|pdf, &key=1 for the answer key,
 * &version=A (printed; B, C… change the seed so pool draws and matching
 * choices differ), &shuffle=1 to apply the assessment's question shuffle.
 * Anyone who can view the assessment can print it.
 */
export const GET = withAuthzRoute<{ params: Promise<{ assessmentId: string }> }>(
  async (req, ctx) => {
    const { assessmentId } = await ctx.params;
    await requireShared({ type: "assessment", id: assessmentId }, "view");
    const sp = new URL(req.url).searchParams;
    const format = sp.get("format") === "docx" ? "docx" : "pdf";
    const includeKey = sp.get("key") === "1";
    const version = (sp.get("version") ?? "A").replace(/[^A-Za-z0-9]/g, "").slice(0, 4) || "A";
    const shuffle = sp.get("shuffle") === "1";
    const seed = [...version].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7);

    const detail = await getAssessmentDetail(assessmentId);
    if (!detail) return new Response("Not found", { status: 404 });
    const sections = await loadBuilderSections(assessmentId);
    const served = buildQuestionSet(sections, {
      randomizeQuestions: shuffle && detail.randomizeQuestions,
      rng: seededRng(seed),
    });
    const questions = await questionsForServedSet(served.map((s) => s.questionId));
    const targets = detail.courseId ? await listTargets(detail.courseId) : [];
    const doc = buildPaperDoc({
      title: detail.title,
      courseName: detail.courseName,
      instructions: detail.instructions,
      sections: detail.sections.map((s) => ({
        id: s.id,
        title: s.title,
        instructions: s.instructions,
      })),
      served,
      questions,
      targetCodes: new Map(targets.map((t) => [t.id, t.code])),
      includeKey,
      version,
      seed,
    });
    const urls = doc.blocks
      .flatMap((b) => (b.kind === "question" || b.kind === "stimulus" ? [b.imageUrl] : []))
      .filter((u): u is string => !!u);
    const images = await loadImages(urls);
    const lookup = (u: string) => images.get(u);
    const fileName = paperFileName(detail.title, version, format, includeKey);
    const body = format === "docx" ? await renderDocx(doc, lookup) : await renderPdf(doc, lookup);
    return new Response(body as BodyInit, {
      headers: {
        "content-type":
          format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  }
);
