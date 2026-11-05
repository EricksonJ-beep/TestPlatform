import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PackRelearning } from "@/lib/relearning-pack";
import {
  blankCheck,
  blankOption,
  formatClock,
  formToPack,
  nextId,
  optionToForm,
  parseClock,
  readEditorInput,
  youtubeIdFrom,
  youtubeStartFrom,
} from "./relearning-editor";

const pack = JSON.parse(readFileSync("content/packs/ps-u3-lt1-relearning/pack.json", "utf8")) as {
  relearning: PackRelearning[];
};

/** A pack option as the database holds it (sections numbered by part), for `optionToForm`. */
function saved(r: PackRelearning) {
  const order = { core: 0, extension: 0 };
  return {
    title: r.title,
    description: r.description ?? null,
    isPublished: r.published ?? true,
    sections: r.sections.map((s, i) => ({
      id: `sec-${i}`,
      part: s.part,
      sortOrder: order[s.part]++,
      title: s.title ?? null,
      body: s.body,
      checks: s.checks ?? [],
      shortAnswerPrompt: s.shortAnswer ?? null,
      estMinutes: s.minutes ?? 3,
    })),
  };
}

describe("youtubeIdFrom", () => {
  it.each([
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["  dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ?start=10", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["a_b-c_d-e_f", "a_b-c_d-e_f"],
  ])("%s → %s", (input, id) => {
    expect(youtubeIdFrom(input)).toBe(id);
  });

  it.each([
    "",
    "nope",
    "dQw4w9WgXc",
    "https://vimeo.com/123456789",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UCabcdefghijk",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
  ])("%j has no id", (input) => {
    expect(youtubeIdFrom(input)).toBeNull();
  });

  it("reads a link's own start time", () => {
    expect(youtubeStartFrom("https://youtu.be/dQw4w9WgXcQ?t=90")).toBe(90);
    expect(youtubeStartFrom("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")).toBe(90);
    expect(youtubeStartFrom("https://www.youtube.com/embed/dQw4w9WgXcQ?start=42")).toBe(42);
    expect(youtubeStartFrom("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("m:ss", () => {
  it.each([
    ["0:00", 0],
    ["1:30", 90],
    ["01:05", 65],
    ["12:00", 720],
    ["1:02:03", 3723],
    ["90", 90],
    [" 2:05 ", 125],
  ])("%j → %d seconds", (input, seconds) => {
    expect(parseClock(input)).toBe(seconds);
  });

  it.each(["", "1:60", "1:2:3:4", "1:70:00", "a:bc", "-1:00", "1.5", "1:"])(
    "%j isn't a time",
    (input) => {
      expect(parseClock(input)).toBeNull();
    }
  );

  it("formats seconds back", () => {
    expect([0, 5, 90, 600, 3723].map(formatClock)).toEqual([
      "0:00",
      "0:05",
      "1:30",
      "10:00",
      "1:02:03",
    ]);
    expect(parseClock(formatClock(3723))).toBe(3723);
  });
});

describe("form ↔ PackRelearning", () => {
  it("round-trips the shipped pack's Read and Do options exactly", () => {
    for (const r of pack.relearning) {
      const { pack: back, issues } = formToPack(optionToForm(saved(r)), r.target, r.mode);
      expect(issues).toEqual([]);
      expect(back).toEqual({ ...r, published: r.published ?? true });
    }
  });

  it("turns a pasted link into the id and m:ss into seconds, for the video and its checks", () => {
    const form = blankOption("watch", "U3.LT2");
    form.title = "Watch: ionic bonds";
    const core = form.sections[0];
    core.video = "https://youtu.be/dQw4w9WgXcQ?t=30";
    core.start = "0:30";
    core.end = "3:30";
    core.checks = [
      {
        ...blankCheck("q1"),
        prompt: "What does sodium give away?",
        options: [
          { id: "a", text: "An electron" },
          { id: "b", text: "A proton" },
          { id: "c", text: "" },
        ],
        answer: "a",
        at: "1:35",
        afterStepId: "s1",
      },
    ];
    form.sections = [core];
    const { pack: out, issues } = formToPack(form, "U3.LT2", "watch");
    expect(issues).toEqual([]);
    expect(out.sections).toEqual([
      {
        part: "core",
        minutes: 4,
        body: { type: "video", youtubeId: "dQw4w9WgXcQ", startSeconds: 30, endSeconds: 210 },
        // A blank option row is dropped; a step only means something on worked steps.
        checks: [
          {
            id: "q1",
            kind: "multiple_choice",
            prompt: "What does sodium give away?",
            options: [
              { id: "a", text: "An electron" },
              { id: "b", text: "A proton" },
            ],
            answer: "a",
            atSeconds: 95,
          },
        ],
      },
    ]);
  });

  it("keeps fill-in answers, drops blank rows, and ties a check to its step", () => {
    const form = blankOption("do", "U3.LT1");
    const ext = form.sections[1];
    ext.type = "worked_steps";
    ext.problem = "Count the atoms in Mg(OH)₂.";
    ext.steps = [
      { id: "s1", text: "Mg = 1." },
      { id: "s2", text: "" },
      { id: "s3", text: "O = 2 and H = 2." },
    ];
    ext.checks = [
      {
        ...blankCheck("q1", "fill_blank"),
        prompt: "How many atoms in all?",
        accepted: ["5", " five ", ""],
        afterStepId: "s3",
        at: "0:10",
      },
    ];
    ext.shortAnswer = "  Why multiply and not add?  ";
    form.sections[0].cards = [
      { id: "k1", front: "Subscript", back: "Counts the symbol before it." },
      { id: "k2", front: "", back: "" },
    ];
    const { pack: out, issues } = formToPack(form, "U3.LT1", "do");
    expect(issues).toEqual([]);
    expect(out.sections[0].body).toEqual({
      type: "flashcards",
      cards: [{ id: "k1", front: "Subscript", back: "Counts the symbol before it." }],
    });
    expect(out.sections[1]).toMatchObject({
      part: "extension",
      shortAnswer: "Why multiply and not add?",
      body: {
        type: "worked_steps",
        steps: [
          { id: "s1", text: "Mg = 1." },
          { id: "s3", text: "O = 2 and H = 2." },
        ],
      },
      checks: [{ id: "q1", kind: "fill_blank", answer: ["5", "five"], afterStepId: "s3" }],
    });
    expect(out.sections[1].checks![0]).not.toHaveProperty("atSeconds");
  });

  it("puts cores before extensions, so issue numbers match the editor's", () => {
    const form = blankOption("read", "U3.LT1");
    form.sections.reverse();
    form.sections[0].text = "Extension text";
    form.sections[1].text = "";
    const { pack: out, issues } = formToPack(form, "U3.LT1", "read");
    expect(out.sections.map((s) => s.part)).toEqual(["core", "extension"]);
    expect(issues).toEqual(["section 1: text is empty"]);
  });

  it("lists what's wrong in the editor's words", () => {
    const form = blankOption("watch", "U3.LT1");
    form.title = " ";
    form.sections[0].video = "https://vimeo.com/1";
    form.sections[0].start = "1:75";
    form.sections[0].minutes = "40";
    form.sections[1].video = "dQw4w9WgXcQ";
    form.sections[1].start = "2:00";
    form.sections[1].end = "1:00";
    form.sections[1].checks = [{ ...blankCheck("q1"), at: "soon" }];
    const { issues } = formToPack(form, "U3.LT1", "watch");
    // In order, whole option first; the pack's "youtubeId must be…" is left out where the form
    // already said the link is wrong.
    expect(issues).toEqual([
      "needs a title",
      "section 1: that isn't a YouTube link or 11-character id",
      "section 1: the start time must look like 1:30",
      "section 1: minutes must be 1–30",
      "section 2: the end time must come after the start",
      "section 2: check q1's pause time must look like 1:30",
      "section 2: check q1's answer isn't one of its options",
      "section 2: check q1 needs a question",
      "section 2: check q1 needs at least two options",
    ]);
  });

  it("numbers new ids past the ones in use", () => {
    expect(nextId("q", ["q1", "q2", "c1"])).toBe("q3");
    expect(nextId("k", [])).toBe("k1");
    expect(nextId("s", ["s2"])).toBe("s1");
  });
});

describe("readEditorInput (what the server accepts)", () => {
  it("accepts the shipped pack's options as the editor sends them", () => {
    for (const r of pack.relearning) {
      const sent = formToPack(optionToForm(saved(r)), r.target, r.mode).pack;
      expect(readEditorInput(sent, r.target, r.mode)).toEqual({
        pack: { ...r, published: r.published ?? true },
        issues: [],
      });
    }
  });

  it("drops fields it doesn't know and uses the target and mode it was given", () => {
    const { pack: out } = readEditorInput(
      {
        target: "OTHER",
        mode: "watch",
        title: "Read: x",
        published: "yes",
        ownerId: "someone",
        sections: [
          {
            part: "core",
            body: { type: "text", text: "Hi.", script: "<x>" },
            checks: [],
            evil: true,
          },
        ],
      },
      "U3.LT1",
      "read"
    );
    expect(out).toEqual({
      target: "U3.LT1",
      mode: "read",
      title: "Read: x",
      published: false,
      sections: [{ part: "core", body: { type: "text", text: "Hi." }, checks: [] }],
    });
  });

  it.each([
    [null, "nothing to save"],
    [{ title: "x", sections: "no" }, "an option holds 1 to 20 sections"],
    [
      { title: "x", sections: [{ part: "middle", body: {} }] },
      "section 1: part must be core or extension",
    ],
    [
      { title: "x", sections: [{ part: "core", body: { type: "html" } }] },
      "section 1: unknown body type",
    ],
    [
      { title: "x", sections: [{ part: "core", body: { type: "text", text: "a" }, minutes: "4" }] },
      "section 1: minutes must be a whole number",
    ],
    [
      {
        title: "x",
        sections: [
          { part: "core", body: { type: "video", youtubeId: "dQw4w9WgXcQ", startSeconds: -5 } },
        ],
      },
      "section 1: start and end are seconds",
    ],
    [
      {
        title: "x",
        sections: [
          {
            part: "core",
            body: { type: "text", text: "a" },
            checks: [{ id: "q1", kind: "essay", prompt: "?" }],
          },
        ],
      },
      "section 1: a check is malformed",
    ],
    [
      {
        title: "x",
        sections: [{ part: "core", body: { type: "text", text: "a".repeat(20_001) } }],
      },
      "section 1: the reading is too long",
    ],
  ])("refuses %j", (input, issue) => {
    expect(readEditorInput(input, "U3.LT1", "read")).toEqual({ pack: null, issues: [issue] });
  });

  it("runs the pack checks on what it rebuilt", () => {
    expect(
      readEditorInput(
        {
          title: "Do: x",
          sections: [{ part: "extension", body: { type: "flashcards", cards: [] } }],
        },
        "U3.LT1",
        "do"
      )
    ).toEqual({ pack: null, issues: ["needs a core section", "section 1: needs cards"] });
  });
});
