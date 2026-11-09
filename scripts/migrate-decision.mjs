/**
 * Should this build touch the database? (hardening plan H2.1, Nov 9 2026)
 *
 * Production builds always migrate. A preview build migrates too unless MIGRATE_ON_PREVIEW=0,
 * because today previews share the live database and Jon reviews a pull request on its preview
 * (docs/decisions.md: "preview builds share the live database"). Once previews have their own
 * Neon branch, leave it on: the preview then migrates its own copy. Set MIGRATE_ON_PREVIEW=0
 * in Vercel to stop previews changing the database they share.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ run: boolean, reason: string, sharedPreview: boolean }}
 */
export function migrateDecision(env) {
  if (!env.DATABASE_URL?.trim())
    return { run: false, reason: "DATABASE_URL not set", sharedPreview: false };
  const where = env.VERCEL_ENV?.trim() || "local";
  if (where === "preview" || where === "development") {
    const off = /^(0|false|off|no)$/i.test(env.MIGRATE_ON_PREVIEW?.trim() ?? "");
    if (off)
      return {
        run: false,
        reason: `MIGRATE_ON_PREVIEW is off (${where} build)`,
        sharedPreview: false,
      };
    return { run: true, reason: `${where} build`, sharedPreview: true };
  }
  return { run: true, reason: `${where} build`, sharedPreview: false };
}

/** The database host, for the build log (never the password). */
export function databaseHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "an unreadable DATABASE_URL";
  }
}
