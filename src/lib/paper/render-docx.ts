/**
 * Word rendering of a paper test (docx). Plain, printer-friendly: Lexend-free
 * (Calibri), 11 pt, name/date line, sections, numbered questions, lettered
 * choices with a box to mark, ruled lines for written answers, and the answer
 * key on its own page when asked for.
 */
import { Document, HeadingLevel, ImageRun, Packer, PageBreak, Paragraph, TextRun } from "docx";
import type { PaperBlock, PaperDoc } from "./model";

export type ImageBytes = { data: Uint8Array; type: "png" | "jpg"; width: number; height: number };
export type ImageLookup = (url: string) => ImageBytes | undefined;

const RULE = "_".repeat(78);

function fit(w: number, h: number, maxW = 420, maxH = 300): { width: number; height: number } {
  const scale = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function image(url: string | null, images: ImageLookup): Paragraph[] {
  if (!url) return [];
  const img = images(url);
  if (!img) return [new Paragraph({ children: [new TextRun({ text: "[image]", italics: true })] })];
  return [
    new Paragraph({
      children: [
        new ImageRun({
          data: img.data,
          type: img.type,
          transformation: fit(img.width, img.height),
        }),
      ],
      spacing: { after: 120 },
    }),
  ];
}

function block(b: PaperBlock, images: ImageLookup): Paragraph[] {
  if (b.kind === "section") {
    const out = [
      new Paragraph({
        text: b.title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 80 },
      }),
    ];
    if (b.instructions)
      out.push(
        new Paragraph({
          children: [new TextRun({ text: b.instructions, italics: true })],
          spacing: { after: 120 },
        })
      );
    return out;
  }
  if (b.kind === "stimulus") {
    const out: Paragraph[] = [];
    if (b.title)
      out.push(
        new Paragraph({
          children: [new TextRun({ text: b.title, bold: true })],
          spacing: { before: 160 },
        })
      );
    if (b.text)
      for (const line of b.text.split(/\n+/))
        out.push(new Paragraph({ text: line, spacing: { after: 60 } }));
    out.push(...image(b.imageUrl, images));
    return out;
  }
  const out: Paragraph[] = [];
  const head = `${b.number}. `;
  out.push(
    new Paragraph({
      children: [
        new TextRun({ text: head, bold: true }),
        new TextRun({ text: b.stem }),
        new TextRun({
          text: `  (${b.points} ${b.points === 1 ? "pt" : "pts"})`,
          color: "666666",
          size: 18,
        }),
      ],
      spacing: { before: 200, after: 60 },
      keepNext: true,
    })
  );
  if (b.directions)
    out.push(
      new Paragraph({
        children: [new TextRun({ text: b.directions, italics: true, size: 20 })],
        indent: { left: 360 },
        spacing: { after: 40 },
      })
    );
  out.push(...image(b.imageUrl, images));
  if (b.type === "matching") {
    for (const o of b.options)
      out.push(
        new Paragraph({
          children: [new TextRun({ text: `____  ${o.letter}. ${o.text}` })],
          indent: { left: 360 },
          spacing: { after: 40 },
        })
      );
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Choices:", bold: true })],
        indent: { left: 360 },
        spacing: { before: 80 },
      })
    );
    b.choices.forEach((c, i) =>
      out.push(
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${c}` })],
          indent: { left: 720 },
          spacing: { after: 20 },
        })
      )
    );
  } else if (b.type === "ordering") {
    for (const o of b.options)
      out.push(
        new Paragraph({
          children: [new TextRun({ text: `____  ${o.letter}. ${o.text}` })],
          indent: { left: 360 },
          spacing: { after: 40 },
        })
      );
  } else if (b.options.length) {
    for (const o of b.options)
      out.push(
        new Paragraph({
          children: [new TextRun({ text: `☐  ${o.letter}. ${o.text}` })],
          indent: { left: 360 },
          spacing: { after: 40 },
        })
      );
  }
  if (b.type === "numeric") {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: `Answer: ________________ ${b.unit ?? ""}` })],
        indent: { left: 360 },
        spacing: { before: 80 },
      })
    );
  } else {
    for (let i = 0; i < b.answerLines; i++)
      out.push(
        new Paragraph({
          children: [new TextRun({ text: RULE, color: "999999" })],
          indent: { left: 360 },
          spacing: { before: 120 },
        })
      );
  }
  return out;
}

export async function renderDocx(
  doc: PaperDoc,
  images: ImageLookup = () => undefined
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({
          text: [
            doc.subtitle,
            `Version ${doc.version}`,
            `${doc.questionCount} questions`,
            `${doc.totalPoints} points`,
          ]
            .filter(Boolean)
            .join(" · "),
          color: "666666",
        }),
      ],
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Name: ______________________________________   Date: ______________   Period: ______",
        }),
      ],
      spacing: { after: 200 },
    }),
  ];
  if (doc.instructions)
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.instructions, italics: true })],
        spacing: { after: 160 },
      })
    );
  for (const b of doc.blocks) children.push(...block(b, images));
  if (doc.key) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        text: `${doc.title} · Answer key · Version ${doc.version}`,
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const k of doc.key)
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${k.number}. `, bold: true }),
            new TextRun({ text: k.answer }),
            new TextRun({ text: `  (${k.points})`, color: "666666", size: 18 }),
          ],
          spacing: { after: 60 },
        })
      );
  }
  const d = new Document({
    creator: "Bloom",
    title: doc.title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        children,
      },
    ],
  });
  return Packer.toBuffer(d);
}
