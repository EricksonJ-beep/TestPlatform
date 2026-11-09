import { describe, expect, it } from "vitest";
import { databaseHost, migrateDecision } from "../../scripts/migrate-decision.mjs";

const url = "postgresql://user:secret@ep-cool-1.us-east-2.aws.neon.tech/bloom";

describe("migrate on build (H2.1)", () => {
  it("does nothing without a database", () => {
    expect(migrateDecision({}).run).toBe(false);
    expect(migrateDecision({ DATABASE_URL: "  " }).run).toBe(false);
  });
  it("a production build migrates", () => {
    expect(migrateDecision({ DATABASE_URL: url, VERCEL_ENV: "production" })).toMatchObject({
      run: true,
      sharedPreview: false,
    });
  });
  it("a build outside Vercel (a manual deploy) migrates", () => {
    expect(migrateDecision({ DATABASE_URL: url })).toMatchObject({
      run: true,
      sharedPreview: false,
    });
  });
  it("a preview build migrates by default and says so", () => {
    expect(migrateDecision({ DATABASE_URL: url, VERCEL_ENV: "preview" })).toMatchObject({
      run: true,
      sharedPreview: true,
    });
  });
  it("a preview build leaves the database alone when told to", () => {
    for (const v of ["0", "false", "off", "No"]) {
      expect(
        migrateDecision({ DATABASE_URL: url, VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: v }).run
      ).toBe(false);
    }
    // The switch is for previews only: production still migrates.
    expect(
      migrateDecision({ DATABASE_URL: url, VERCEL_ENV: "production", MIGRATE_ON_PREVIEW: "0" }).run
    ).toBe(true);
  });
  it("logs the host, never the password", () => {
    expect(databaseHost(url)).toBe("ep-cool-1.us-east-2.aws.neon.tech");
    expect(databaseHost("not a url")).toMatch(/unreadable/);
  });
});
