/**
 * Pure worksheet rules (Ticket 1.14): what a pasted link means, which targets a
 * submit credits, and the Appendix B block. No database, so the gates module
 * can import from here without a cycle.
 */
import type { WorksheetCountsAs } from "@/db/types";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export const PENDING_PREFIX = "pending:";

export type WorksheetRef = { scriptId: string | null; studentUrl: string | null };

/** Strip query and hash from a pasted link so the same deployment always compares equal. */
export function normalizeStudentUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.trim();
  }
}

/** The placeholder script id for a worksheet registered by its student link before its first webhook. */
export function pendingScriptId(studentUrl: string): string {
  return PENDING_PREFIX + normalizeStudentUrl(studentUrl);
}

/**
 * What the teacher pasted: a deployed student link (…/macros/s/<deployment>/exec),
 * an editor link (…/d/<scriptId>/edit or …/home/projects/<scriptId>), or a bare script id.
 */
export function parseWorksheetRef(raw: string): WorksheetRef | null {
  const s = raw.trim();
  if (!s) return null;
  if (
    /^https?:\/\/script\.google\.com\/(?:a\/macros\/[^/]+|macros)\/s\/[\w-]+\/(exec|dev)\b/i.test(s)
  )
    return { scriptId: null, studentUrl: normalizeStudentUrl(s).replace(/\/dev$/, "/exec") };
  const m = s.match(/script\.google\.com\/(?:[^/]+\/)?(?:home\/projects|d)\/([\w-]{20,})/i);
  if (m) return { scriptId: m[1], studentUrl: null };
  if (/^[\w-]{20,}$/.test(s)) return { scriptId: s, studentUrl: null };
  return null;
}

/**
 * Which of the worksheet's targets a submit credits. With no section map (or
 * one that names none of the targets) the whole worksheet counts. With a map,
 * a mapped target is credited when its section scored above zero; targets no
 * section maps to are credited by any submit. null = everything.
 */
export function creditedTargets(input: {
  sectionTargetMap: Record<string, string> | null;
  sectionScores: Record<string, number> | null;
  targetIds: string[];
}): string[] | null {
  const entries = Object.entries(input.sectionTargetMap ?? {}).filter(([, t]) =>
    input.targetIds.includes(t)
  );
  if (entries.length === 0) return null;
  const mapped = new Set(entries.map(([, t]) => t));
  const norm = (s: string) => s.trim().toLowerCase();
  const scoreBy = new Map(
    Object.entries(input.sectionScores ?? {}).map(([k, v]) => [norm(k), Number(v)])
  );
  const out = new Set(input.targetIds.filter((t) => !mapped.has(t)));
  for (const [section, t] of entries) {
    const v = scoreBy.get(norm(section));
    if (typeof v === "number" && v > 0) out.add(t);
  }
  return [...out];
}

/** Gate rule: a completion without a credited list counts for every target; with one, only those listed. */
export function creditsTarget(credited: unknown, targetId: string): boolean {
  return !Array.isArray(credited) || credited.includes(targetId);
}

/** The Appendix B block, filled in, for the teacher to paste into a worksheet's Code.gs. */
export function webhookBlock(webhookUrl: string, secret: string): string {
  return `// ---- Bloom integration (leave URL blank to disable) ----
const BLOOM_WEBHOOK_URL = '${webhookUrl}';
const BLOOM_SECRET      = '${secret}';

function bloomNotify_(payload) {
  if (!BLOOM_WEBHOOK_URL) return;
  try {
    UrlFetchApp.fetch(BLOOM_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { 'X-Bloom-Secret': BLOOM_SECRET },
      payload: JSON.stringify(Object.assign({
        scriptId:  ScriptApp.getScriptId(),
        worksheet: PAGE_TITLE,
        url:       ScriptApp.getService().getUrl(),
        email:     Session.getActiveUser().getEmail(),
        at:        new Date().toISOString()
      }, payload))
    });
  } catch (e) { /* never block the student */ }
}
// In submitFinal, just before "return { ok: true, ...":
//   const sectionPct = {};
//   SEC_IDS.forEach(s => { sectionPct[SECTIONS[s]] = g.sections[s].total ? Math.round(100 * g.sections[s].correct / g.sections[s].total) : 0; });
//   bloomNotify_({ event: 'submit', score: pct, sectionScores: sectionPct, cardsCorrect: g.correct, totalCards: g.total, totalChecks: totalChecks });
// Optionally at the end of saveProgress:
//   bloomNotify_({ event: 'progress' });
`;
}

export const COUNTS_AS_LABEL: Record<WorksheetCountsAs, string> = {
  practice: "Practice set",
  activity: "Relearning activity",
  both: "Both",
};
