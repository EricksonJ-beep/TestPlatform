import { describe, expect, it } from "vitest";
import {
  databaseHost,
  migrateDecision,
  sameDatabaseHost,
} from "../../scripts/migrate-decision.mjs";

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

  describe("a Neon branch per preview (Jon, Nov 11 2026)", () => {
    const liveHost = "ep-live-1234.c-6.us-east-2.aws.neon.tech";
    const livePooled = `postgresql://u:p@ep-live-1234-pooler.c-6.us-east-2.aws.neon.tech/neondb`;
    const branch = `postgresql://u:p@ep-preview-9876-pooler.c-6.us-east-2.aws.neon.tech/neondb`;
    const preview = { VERCEL_ENV: "preview", LIVE_DATABASE_HOST: liveHost };

    it("a preview on its own branch migrates it, with no warning", () => {
      expect(migrateDecision({ ...preview, DATABASE_URL: branch })).toMatchObject({
        run: true,
        sharedPreview: false,
        blocked: false,
      });
    });
    it("a preview connected to the live database leaves it alone", () => {
      // The pooled and direct names are the same database.
      expect(migrateDecision({ ...preview, DATABASE_URL: livePooled })).toMatchObject({
        run: false,
        blocked: true,
      });
      expect(
        migrateDecision({ ...preview, DATABASE_URL: livePooled.replace("-pooler", "") })
      ).toMatchObject({ run: false, blocked: true });
    });
    it("production migrates the live database, as it must", () => {
      expect(
        migrateDecision({
          VERCEL_ENV: "production",
          LIVE_DATABASE_HOST: liveHost,
          DATABASE_URL: livePooled,
        })
      ).toMatchObject({ run: true, blocked: false });
    });
    it("compares hosts through pooled names, capitals and ports", () => {
      expect(sameDatabaseHost("ep-a-1-pooler.x.neon.tech", "ep-a-1.x.neon.tech")).toBe(true);
      expect(sameDatabaseHost("EP-A-1.x.neon.tech:5432", "ep-a-1.x.neon.tech")).toBe(true);
      expect(sameDatabaseHost("ep-a-1.x.neon.tech", "ep-b-2.x.neon.tech")).toBe(false);
      expect(sameDatabaseHost("", "")).toBe(false);
    });
  });
});
