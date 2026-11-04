/**
 * The Skyward export's rules (docs/relearning-revamp-plan.md, K1–K2, ticket R8): the lunch-code ID
 * from the email, whole-number percents, Jon's file names, and the import header.
 */
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import {
  missingIds,
  parseTargetCode,
  skywardCsv,
  skywardFileName,
  skywardId,
  skywardScore,
} from "./skyward";

describe("skywardId (K2, decision 24)", () => {
  it("is the digits before the @ in the student's email", () => {
    expect(skywardId("2977@cadott.k12.wi.us")).toBe("2977");
    expect(skywardId(" 0209@cadott.k12.wi.us ")).toBe("0209");
  });
  it("is null without an email or when its name part isn't all digits", () => {
    expect(skywardId(null)).toBeNull();
    expect(skywardId("jane.doe@gmail.com")).toBeNull();
    expect(skywardId("2977a@cadott.k12.wi.us")).toBeNull();
  });
});

describe("skywardScore (K1)", () => {
  it("is a whole-number percent, halves rounded up, blank with no score", () => {
    expect(skywardScore(79.5)).toBe(80);
    expect(skywardScore(79.49)).toBe(79);
    expect(skywardScore(100)).toBe(100);
    expect(skywardScore(0)).toBe(0);
    expect(skywardScore(null)).toBeNull();
  });
});

describe("file names (K1)", () => {
  it("reads unit and target from a code", () => {
    expect(parseTargetCode("U2.LT3")).toEqual({ unit: 2, lt: 3 });
    expect(parseTargetCode("U10 LT12")).toEqual({ unit: 10, lt: 12 });
    expect(parseTargetCode("LT3")).toBeNull();
  });
  it("names a quiz target's file like Jon's F_LT columns", () => {
    expect(skywardFileName({ kind: "target", code: "U2.LT3" })).toBe("F_LT3U2");
    expect(skywardFileName({ kind: "target", code: "AP.LT1" })).toBe("F_AP.LT1");
  });
  it("names a test's file like Jon's S_LT columns", () => {
    expect(skywardFileName({ kind: "test", codes: ["U2.LT4", "U2.LT1", "U2.LT3", "U2.LT2"] })).toBe(
      "S_LT1,2,3,4U2"
    );
    expect(skywardFileName({ kind: "test", codes: ["U1.LT4", "U2.LT1"] })).toBe("S_U1.LT4,U2.LT1");
  });
});

describe("skywardCsv (K1)", () => {
  it("writes the import header, then one row per student, last name first", () => {
    const csv = skywardCsv([
      { lastName: "Wood", firstName: "Damien", email: "8631@cadott.k12.wi.us", percent: 79.5 },
      { lastName: "Anderson", firstName: "Isaac", email: "2977@cadott.k12.wi.us", percent: 40 },
      { lastName: "Bauer", firstName: "Tim", email: "tim@gmail.com", percent: 88.2 },
      { lastName: "Cook", firstName: "Temp", email: "4868@cadott.k12.wi.us", percent: null },
    ]);
    expect(parseCsv(csv)).toEqual([
      ["Last Name", "First Name", "ID", "Score"],
      ["Anderson", "Isaac", "2977", "40"],
      ["Bauer", "Tim", "", "88"],
      ["Cook", "Temp", "4868", ""],
      ["Wood", "Damien", "8631", "80"],
    ]);
  });
  it("lists the students without an ID", () => {
    expect(
      missingIds([
        { lastName: "Bauer", firstName: "Tim", email: "tim@gmail.com" },
        { lastName: "Anderson", firstName: "Isaac", email: "2977@cadott.k12.wi.us" },
        { lastName: "Moore", firstName: "Rylan", email: null },
      ])
    ).toEqual([
      { name: "Rylan Moore", email: null },
      { name: "Tim Bauer", email: "tim@gmail.com" },
    ]);
  });
});
