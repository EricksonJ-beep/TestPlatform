/**
 * Should this build touch the database? (hardening plan H2, Nov 9–11 2026)
 *
 * Production builds always migrate.
 *
 * Preview builds (Jon, Nov 11 2026: "Go with the Neon branch per preview"): each preview gets
 * its own copy of the database from Vercel's Neon integration, and migrates that copy. The live
 * data is never touched before a pull request is merged. `LIVE_DATABASE_HOST` (the live
 * database's host, set in Vercel for every environment) is how the build knows the difference:
 *   - the preview's database is a different host  → its own branch: migrate it;
 *   - the preview's database IS the live host     → the branch is missing (the setting is off,
 *     or it failed): leave the database alone and say how to fix it.
 * Without LIVE_DATABASE_HOST the build can't tell, so it migrates as it always did and warns.
 * MIGRATE_ON_PREVIEW=0 still turns preview migrations off altogether.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ run: boolean, reason: string, sharedPreview: boolean, blocked: boolean }}
 */
export function migrateDecision(env) {
  const no = { sharedPreview: false, blocked: false };
  if (!env.DATABASE_URL?.trim()) return { run: false, reason: "DATABASE_URL not set", ...no };
  const where = env.VERCEL_ENV?.trim() || "local";
  if (where !== "preview" && where !== "development")
    return { run: true, reason: `${where} build`, ...no };

  if (/^(0|false|off|no)$/i.test(env.MIGRATE_ON_PREVIEW?.trim() ?? ""))
    return { run: false, reason: `MIGRATE_ON_PREVIEW is off (${where} build)`, ...no };

  const live = env.LIVE_DATABASE_HOST?.trim();
  if (!live) return { run: true, reason: `${where} build`, sharedPreview: true, blocked: false };
  if (sameDatabaseHost(databaseHost(env.DATABASE_URL), live))
    return {
      run: false,
      reason: `this ${where} build is connected to the live database, not its own branch`,
      sharedPreview: false,
      blocked: true,
    };
  return { run: true, reason: `${where} build on its own database branch`, ...no };
}

/** The database host, for the build log (never the password). */
export function databaseHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "an unreadable DATABASE_URL";
  }
}

/**
 * Neon gives one database two host names: the direct one and the pooled one ("-pooler" after
 * the endpoint id). They are the same database, so they compare equal; so do capitals and ports.
 */
export function sameDatabaseHost(a, b) {
  const tidy = (h) =>
    String(h ?? "")
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/[/:?].*$/, "")
      .replace(/^([^.]+?)-pooler\./, "$1.");
  return tidy(a) !== "" && tidy(a) === tidy(b);
}
