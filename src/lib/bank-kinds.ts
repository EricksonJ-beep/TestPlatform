/**
 * Bank types on the Question banks page (Jon, Oct 13 2026: "view/organize the
 * question banks into Practice, Quiz, Test, Retake… 4 columns… By default it
 * would be good if the program could recognize the name and auto order them…
 * the quiz with LT1 at the top and LT2 below that"). Each unit shelf shows one
 * column per type; banks whose name says none of them sit in a small "Other"
 * column that appears only when needed. Pure helpers; the page and the board
 * call these, `placeBankInColumn` persists a drag.
 */

export const BANK_KINDS = ["practice", "quiz", "test", "retake", "other"] as const;
export type BankKind = (typeof BANK_KINDS)[number];

export const BANK_KIND_LABEL: Record<BankKind, string> = {
  practice: "Practice",
  quiz: "Quiz",
  test: "Test",
  retake: "Retake",
  other: "Other",
};

export function isBankKind(v: unknown): v is BankKind {
  return typeof v === "string" && (BANK_KINDS as readonly string[]).includes(v);
}

/**
 * The type a bank's name implies. Rule: "retake" wins (a "Retake Test" is a
 * retake), then "practice", then "test" or "exam", then "quiz"; anything else
 * is "other". Whole words only, any case.
 */
export function kindFromName(name: string): BankKind {
  const n = name.toLowerCase();
  if (/\bretakes?\b/.test(n)) return "retake";
  if (/\bpractices?\b/.test(n)) return "practice";
  if (/\b(tests?|exams?)\b/.test(n)) return "test";
  if (/\bquiz(zes)?\b/.test(n)) return "quiz";
  return "other";
}

/** An assessment's own type, for a title that names no column (Jon, Oct 13 2026). */
const FROM_TYPE: Record<string, BankKind> = {
  practice: "practice",
  formative: "quiz",
  summative: "test",
};

/**
 * The column a bank (or an assessment) shows in: the one the teacher chose,
 * else the one its name implies, else, for an assessment, its type
 * (formative → Quiz, summative → Test).
 */
export function bankKind(item: { kind: string | null; name: string; type?: string }): BankKind {
  if (isBankKind(item.kind)) return item.kind;
  const fromName = kindFromName(item.name);
  return fromName === "other" && item.type ? (FROM_TYPE[item.type] ?? "other") : fromName;
}

/** "U2.LT3", "LT 3", "Unit 2 · LT3" → [2, 3]; missing parts sort last. */
function targetKey(name: string): [number, number] {
  const lt = /\bLT\s*(\d+)/i.exec(name);
  const unit = /\b(?:U|Unit\s*)(\d+)\b/i.exec(name) ?? /\bU(\d+)\.LT/i.exec(name);
  return [unit ? Number(unit[1]) : Infinity, lt ? Number(lt[1]) : Infinity];
}

/**
 * Order inside a column. Rule: banks the teacher placed by hand come first in
 * their saved order; the rest follow automatically, by learning target (LT1
 * before LT2 before LT10), then by name with numbers read as numbers.
 */
export function compareInColumn(
  a: { name: string; kindOrder: number | null },
  b: { name: string; kindOrder: number | null }
): number {
  if (a.kindOrder !== null || b.kindOrder !== null) {
    if (a.kindOrder === null) return 1;
    if (b.kindOrder === null) return -1;
    if (a.kindOrder !== b.kindOrder) return a.kindOrder - b.kindOrder;
  }
  const [ua, la] = targetKey(a.name);
  const [ub, lb] = targetKey(b.name);
  if (ua !== ub) return ua - ub;
  if (la !== lb) return la - lb;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export type KindColumn<T> = { kind: BankKind; items: T[] };

/** A unit's banks as columns: the four main types always, "Other" only when it has banks. */
export function groupByKind<
  T extends { name: string; kind: string | null; kindOrder: number | null },
>(items: T[]): KindColumn<T>[] {
  return BANK_KINDS.map((kind) => ({
    kind,
    items: items.filter((i) => bankKind(i) === kind).sort(compareInColumn),
  })).filter((c) => c.kind !== "other" || c.items.length > 0);
}

/**
 * Where a dragged bank lands among a unit's columns. Dropping on a card puts it
 * in that card's column, in front of it; dropping on a column puts it at the
 * end. Returns the column's type and its new id order (dragged bank included).
 */
export function placeInColumn<T extends { id: string }>(
  columns: KindColumn<T>[],
  draggedId: string,
  target: { cardId: string } | { kind: BankKind }
): { kind: BankKind; orderedIds: string[] } | null {
  const to =
    "cardId" in target
      ? columns.find((c) => c.items.some((i) => i.id === target.cardId))
      : columns.find((c) => c.kind === target.kind);
  if (!to) return null;
  if ("cardId" in target && target.cardId === draggedId) return null;
  const ids = to.items.map((i) => i.id).filter((id) => id !== draggedId);
  if ("cardId" in target) {
    const at = ids.indexOf(target.cardId);
    ids.splice(at < 0 ? ids.length : at, 0, draggedId);
  } else ids.push(draggedId);
  return { kind: to.kind, orderedIds: ids };
}
