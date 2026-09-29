import { describe, expect, it } from "vitest";
import type { PaperDoc } from "./model";
import { renderDocx } from "./render-docx";
import { pdfSafe, renderPdf } from "./render-pdf";

const doc: PaperDoc = {
  title: "Unit 1 Test",
  subtitle: "Physical Science",
  instructions: "Show your work. Units matter → write them.",
  version: "A",
  questionCount: 3,
  totalPoints: 5,
  blocks: [
    { kind: "section", title: "LT1 · Measurement", instructions: "Use the ruler." },
    {
      kind: "stimulus",
      title: "Figure 1",
      text: "A pencil on a ruler.",
      imageUrl: "/api/media/u/x/ruler.png",
    },
    {
      kind: "question",
      number: 1,
      points: 1,
      type: "multiple_choice",
      targetCode: "LT1",
      stem: "How long is the pencil?",
      imageUrl: null,
      options: [
        { letter: "A", text: "11 cm" },
        { letter: "B", text: "11 mm" },
      ],
      choices: [],
      unit: null,
      answerLines: 0,
      directions: null,
    },
    {
      kind: "question",
      number: 2,
      points: 2,
      type: "numeric",
      targetCode: "LT3",
      stem: "Convert 87 m to centimeters.",
      imageUrl: null,
      options: [],
      choices: [],
      unit: "cm",
      answerLines: 1,
      directions: "Write the number only; the unit is given.",
    },
    {
      kind: "question",
      number: 3,
      points: 2,
      type: "extended_response",
      targetCode: null,
      stem: "Explain why density is an intensive property. ".repeat(6),
      imageUrl: null,
      options: [],
      choices: [],
      unit: null,
      answerLines: 10,
      directions: null,
    },
  ],
  key: [
    { number: 1, answer: "A", points: 1 },
    { number: 2, answer: "8700 cm", points: 2 },
    { number: 3, answer: "Teacher scored.", points: 2 },
  ],
};

describe("paper renderers", () => {
  it("writes a Word file", async () => {
    const buf = await renderDocx(doc);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // a zip, as .docx is
  });
  it("writes a PDF with an answer-key page and safe text", async () => {
    const bytes = await renderPdf(doc);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(2000);
    expect(pdfSafe("A → B ≤ C ☐ “q” 8700 cm³ 25 °C")).toBe('A -> B <= C [ ] "q" 8700 cm³ 25 °C');
    expect(pdfSafe("Δx and λ")).toBe("delta x and ?");
  });
});
