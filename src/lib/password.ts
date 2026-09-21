import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Readable temp password a teacher can say out loud: e.g. "maple-7482". */
const WORDS = [
  "maple",
  "cedar",
  "river",
  "prairie",
  "falcon",
  "otter",
  "badger",
  "willow",
  "granite",
  "harbor",
  "meadow",
  "summit",
  "aspen",
  "birch",
  "canyon",
  "delta",
];
export function generateTempPassword(): string {
  const word = WORDS[randomInt(WORDS.length)];
  const num = randomInt(1000, 9999);
  return `${word}-${num}`;
}

export const passwordPolicy = {
  minLength: 8,
  message: "Use at least 8 characters.",
};
