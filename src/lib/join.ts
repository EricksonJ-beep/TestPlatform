/**
 * Class join codes and username accounts. Students who join with a code get a
 * username (no email); teachers and email-created students keep email logins.
 */
import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

/** e.g. "BIO3-K7QX": a readable prefix from the class name plus four random characters. */
export function generateJoinCode(className: string, random: () => number = Math.random): string {
  const letters = className
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const word = (letters[0] ?? "CLASS").slice(0, 4).toUpperCase();
  const digit = letters.find((w) => /^\d+$/.test(w) || /^\d/.test(w))?.match(/\d/)?.[0] ?? "";
  const prefix = (word + digit).slice(0, 5) || "CLASS";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `${prefix}-${tail}`;
}

/** Codes compare case-insensitively, ignoring spaces and dashes. */
export function normalizeJoinCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/** "Karmalynne", "Barnard" → "karmalynne.barnard"; ASCII letters and digits only. */
export function usernameBase(firstName: string, lastName: string): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const first = slug(firstName) || "student";
  const last = slug(lastName);
  return last ? `${first}.${last}` : first;
}

/** First free username: the base, then base2, base3, … */
export async function uniqueUsername(firstName: string, lastName: string): Promise<string> {
  const base = usernameBase(firstName, lastName);
  const taken = new Set(
    (
      await db
        .select({ username: schema.users.username })
        .from(schema.users)
        .where(sql`lower(${schema.users.username}) like ${base + "%"}`)
    ).map((r) => r.username?.toLowerCase())
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
  return `${base}${randomInt(1000, 9999)}`;
}

/** A login identifier is an email when it has an "@", otherwise a username. */
export async function findUserByIdentifier(identifier: string) {
  const id = identifier.trim().toLowerCase();
  if (!id) return null;
  return (
    (await db.query.users.findFirst({
      where: id.includes("@")
        ? sql`lower(${schema.users.email}) = ${id}`
        : sql`lower(${schema.users.username}) = ${id}`,
    })) ?? null
  );
}

/** Ensure a class has a join code; returns it. */
export async function ensureJoinCode(classId: string): Promise<string> {
  const cls = await db.query.classes.findFirst({
    columns: { id: true, name: true, joinCode: true },
    where: sql`${schema.classes.id} = ${classId}`,
  });
  if (!cls) throw new Error("class not found");
  if (cls.joinCode) return cls.joinCode;
  return rotateJoinCode(classId, cls.name);
}

/** Issue a fresh code (old one stops working). Retries on the rare collision. */
export async function rotateJoinCode(classId: string, className: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateJoinCode(className);
    const clash = await db.query.classes.findFirst({
      columns: { id: true },
      where: sql`lower(${schema.classes.joinCode}) = ${code.toLowerCase()}`,
    });
    if (clash) continue;
    await db
      .update(schema.classes)
      .set({ joinCode: code })
      .where(sql`${schema.classes.id} = ${classId}`);
    return code;
  }
  throw new Error("could not generate a unique join code");
}
