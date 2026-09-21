import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords, toCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, doubled quotes, CRLF and a BOM", () => {
    const text =
      '﻿first_name,last_name,email\r\n"Rivera, Jr.",Maya,"m@x.org"\r\nA,"He said ""hi""",b@x.org\n';
    expect(parseCsv(text)).toEqual([
      ["first_name", "last_name", "email"],
      ["Rivera, Jr.", "Maya", "m@x.org"],
      ["A", 'He said "hi"', "b@x.org"],
    ]);
  });

  it("drops blank lines and keeps a quoted newline inside a cell", () => {
    expect(parseCsv('a,b\n\n"x\ny",z\n')).toEqual([
      ["a", "b"],
      ["x\ny", "z"],
    ]);
  });
});

describe("parseCsvRecords", () => {
  it("normalizes headers and trims values", () => {
    const { headers, records } = parseCsvRecords(
      "First Name , Last Name,Email\n Maya , Rivera ,m@x.org"
    );
    expect(headers).toEqual(["first_name", "last_name", "email"]);
    expect(records).toEqual([{ first_name: "Maya", last_name: "Rivera", email: "m@x.org" }]);
  });
});

describe("toCsv", () => {
  it("escapes cells that need it and round-trips", () => {
    const out = toCsv(
      ["name", "note"],
      [
        ["Rivera, Maya", 'said "hi"'],
        ["Plain", null],
      ]
    );
    expect(out).toBe('name,note\r\n"Rivera, Maya","said ""hi"""\r\nPlain,\r\n');
    expect(parseCsv(out)).toEqual([
      ["name", "note"],
      ["Rivera, Maya", 'said "hi"'],
      ["Plain", ""],
    ]);
  });
});
