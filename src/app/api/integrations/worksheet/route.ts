import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { publicRoute } from "@/lib/authz";
import { recordWorksheetEvent } from "@/lib/worksheets";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  scriptId: z.string().trim().min(1).max(200),
  worksheet: z.string().trim().max(200).optional().nullable(),
  url: z.string().trim().max(2000).optional().nullable(),
  email: z.string().trim().toLowerCase().email(),
  at: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "at must be a date")
    .transform((v) => new Date(v)),
  event: z.enum(["submit", "progress"]).default("submit"),
  score: z.number().min(0).max(100).optional().nullable(),
  sectionScores: z.record(z.string().max(200), z.number()).optional().nullable(),
  cardsCorrect: z.number().int().min(0).optional().nullable(),
  totalCards: z.number().int().min(0).optional().nullable(),
  totalChecks: z.number().int().min(0).optional().nullable(),
});

/** Constant-time compare of the shared secret; false for any length mismatch. */
function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Worksheet webhook (PLAN.md §3.7a, Appendix B). Public by design: the caller
 * is a Google Apps Script, authenticated by X-Bloom-Secret, not by a session.
 * Never blocks the student: every failure is a JSON error the script ignores.
 */
export const POST = publicRoute(async (req: Request) => {
  const expected = process.env.BLOOM_WORKSHEET_SECRET?.trim();
  if (!expected)
    return Response.json({ ok: false, error: "BLOOM_WORKSHEET_SECRET is not set" }, { status: 503 });
  if (!secretMatches(req.headers.get("x-bloom-secret"), expected))
    return Response.json({ ok: false, error: "bad secret" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { ok: false, error: "bad payload", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  try {
    const r = await recordWorksheetEvent(parsed.data);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    console.error("worksheet webhook failed", err);
    return Response.json({ ok: false, error: "could not record the event" }, { status: 500 });
  }
});
