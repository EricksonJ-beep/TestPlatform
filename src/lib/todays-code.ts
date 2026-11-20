/**
 * Today's code (Jon, Nov 20 2026: "a master password… the password for today is like coffee
 * 123… an actual word and then a couple numbers that I could remember and relay to the kids").
 * Pure rules. One code per teacher, the one the resume code always was (`resume_codes`), which
 * now also stands in for any of that teacher's test access codes while it runs:
 *
 * - The teacher types it (a word and at least two digits) or takes a suggestion; "New code"
 *   still gives a random six-character one for the hour.
 * - It always runs out: this hour (50 minutes) or the rest of the school day (4:00 PM).
 * - It opens only what asks for a code. The window, attempts, the retake rules and the
 *   teacher's unlocks are untouched.
 */
import { RESUME_CODE_MS } from "@/lib/pause";
import { schoolDate, schoolOffset } from "@/lib/reopen";

export type CodeLength = "hour" | "day";

/** The school day ends at 4:00 PM on the school's clock. */
export const SCHOOL_DAY_END_HOUR = 16;

export const CODE_RULE_TEXT =
  "Use a word and at least two numbers, like coffee123 (6 to 20 letters and numbers).";

/**
 * A code the teacher typed, as stored: lower case, spaces and dashes dropped (codes are matched
 * ignoring case, spaces and dashes). Rule: 6 to 20 letters and digits, at least three letters
 * and at least two digits, so a bare word or a bare number is never the code.
 */
export function checkTypedCode(raw: string): { ok: true; code: string } | { ok: false } {
  const code = raw.replace(/[\s-]/g, "").toLowerCase();
  if (!/^[a-z0-9]{6,20}$/.test(code)) return { ok: false };
  const letters = code.replace(/[^a-z]/g, "").length;
  const digits = code.length - letters;
  return letters >= 3 && digits >= 2 ? { ok: true, code } : { ok: false };
}

const WORDS = [
  "coffee", "fish", "maple", "river", "tiger", "pizza", "comet", "otter", "cedar", "falcon",
  "badger", "cactus", "pepper", "rocket", "walnut", "meadow", "pickle", "puffin", "marble",
  "lemon", "panda", "robin", "storm", "acorn", "bison", "canoe", "daisy", "ember", "heron",
  "mango",
]; // prettier-ignore

/** A suggestion to say out loud: a plain word and three digits ("fish365"). */
export function suggestCode(random: () => number = Math.random): string {
  const word = WORDS[Math.floor(random() * WORDS.length)];
  const number = 100 + Math.floor(random() * 900);
  return `${word}${number}`;
}

/**
 * When a code set now runs out. "hour" is one class period. "day" is 4:00 PM on the school's
 * clock (`SCHOOL_TIME_ZONE`); with less than a class period left before then, or after it, the
 * code gets the class period instead.
 */
export function codeExpiry(length: CodeLength, now: Date): Date {
  const period = new Date(now.getTime() + RESUME_CODE_MS);
  if (length === "hour") return period;
  const { y, m, d } = schoolDate(now);
  const wall = Date.UTC(y, m - 1, d, SCHOOL_DAY_END_HOUR);
  // The offset at that wall time; read twice so a guess on the wrong side of a change settles.
  const guess = wall - schoolOffset(new Date(wall));
  const end = new Date(wall - schoolOffset(new Date(guess)));
  return end.getTime() > period.getTime() ? end : period;
}
