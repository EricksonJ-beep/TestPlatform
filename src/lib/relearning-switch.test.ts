/** The course switch (L1): a picked date's moment, no reaching back, and the course's state. */
import { describe, expect, it } from "vitest";
import { pathSwitchAt, pathSwitchState } from "./relearning-switch";

// Wednesday Nov 4 2026, 9:30 PM Central (03:30 UTC Thursday).
const now = new Date("2026-11-05T03:30:00Z");

describe("pathSwitchAt", () => {
  it("today means now, so attempts already in today keep the old rules", () => {
    expect(pathSwitchAt("2026-11-04", now)).toEqual({ at: now });
  });
  it("a later day starts at midnight on the school's clock", () => {
    expect(pathSwitchAt("2026-11-18", now)).toEqual({ at: new Date("2026-11-18T06:00:00Z") });
    // Before the clocks change back (CDT, UTC−5).
    const october = new Date("2026-10-20T15:00:00Z");
    expect(pathSwitchAt("2026-10-26", october)).toEqual({ at: new Date("2026-10-26T05:00:00Z") });
  });
  it("refuses a past day and nonsense", () => {
    expect(pathSwitchAt("2026-11-03", now)).toMatchObject({
      error: expect.stringMatching(/today or a later date/),
    });
    expect(pathSwitchAt("2026-02-30", now)).toEqual({ error: "Pick a date." });
    expect(pathSwitchAt("next week", now)).toEqual({ error: "Pick a date." });
  });
});

describe("pathSwitchState", () => {
  it("is off, scheduled, or on", () => {
    expect(pathSwitchState(null, now)).toBe("off");
    expect(pathSwitchState(new Date("2026-11-18T06:00:00Z"), now)).toBe("scheduled");
    expect(pathSwitchState(new Date("2026-11-01T05:00:00Z"), now)).toBe("on");
  });
});
