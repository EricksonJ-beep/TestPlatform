/**
 * PDF rendering of a paper test with pdf-lib (no browser, no native deps).
 * Letter pages, Helvetica, simple word wrapping, page breaks between
 * questions when one would not fit, and the answer key on a new page.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { PaperBlock, PaperDoc } from "./model";
import type { ImageLookup } from "./render-docx";

const PAGE = { w: 612, h: 792, margin: 54 };
const SIZE = { title: 16, body: 11, small: 9 };
const LEAD = 15;

/** Helvetica covers WinAnsi only; swap the few symbols science tests use and drop the rest. */
export function pdfSafe(s: string): string {
  return s
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .replace(/✓/g, "v")
    .replace(/☐/g, "[ ]")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/Δ/g, "delta ")
    .replace(/[^\x20-\x7E\xA0-\xFF•]/g, "?");
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - PAGE.margin;
  }
  ensure(height: number) {
    if (this.y - height < PAGE.margin) this.newPage();
  }
  wrap(text: string, size: number, font: PDFFont, width: number): string[] {
    const lines: string[] = [];
    for (const para of text.split(/\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = "";
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) <= width) line = next;
        else {
          if (line) lines.push(line);
          line = w;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  text(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      indent?: number;
      color?: [number, number, number];
      gapAfter?: number;
      keepWith?: number;
    } = {}
  ) {
    const size = opts.size ?? SIZE.body;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    const width = PAGE.w - PAGE.margin * 2 - indent;
    const lines = this.wrap(pdfSafe(text), size, font, width);
    this.ensure(lines.length * LEAD + (opts.keepWith ?? 0));
    for (const line of lines) {
      this.page.drawText(line, {
        x: PAGE.margin + indent,
        y: this.y - size,
        size,
        font,
        color: rgb(...(opts.color ?? [0.1, 0.1, 0.1])),
      });
      this.y -= LEAD;
    }
    this.y -= opts.gapAfter ?? 0;
  }
  rule(indent = 0) {
    this.ensure(LEAD + 6);
    this.y -= 12;
    this.page.drawLine({
      start: { x: PAGE.margin + indent, y: this.y },
      end: { x: PAGE.w - PAGE.margin, y: this.y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    this.y -= 6;
  }
  async image(url: string | null, images: ImageLookup) {
    if (!url) return;
    const img = images(url);
    if (!img) {
      this.text("[image]", { size: SIZE.small, color: [0.4, 0.4, 0.4] });
      return;
    }
    try {
      const embedded =
        img.type === "png" ? await this.doc.embedPng(img.data) : await this.doc.embedJpg(img.data);
      const maxW = PAGE.w - PAGE.margin * 2;
      const scale = Math.min(1, maxW / embedded.width, 260 / embedded.height);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      this.ensure(h + 10);
      this.page.drawImage(embedded, { x: PAGE.margin, y: this.y - h, width: w, height: h });
      this.y -= h + 10;
    } catch {
      this.text("[image]", { size: SIZE.small, color: [0.4, 0.4, 0.4] });
    }
  }
}

async function block(w: Writer, b: PaperBlock, images: ImageLookup) {
  if (b.kind === "section") {
    w.y -= 8;
    w.text(b.title, { size: 13, bold: true, keepWith: LEAD * 2 });
    if (b.instructions) w.text(b.instructions, { size: SIZE.small, color: [0.35, 0.35, 0.35] });
    return;
  }
  if (b.kind === "stimulus") {
    w.y -= 6;
    if (b.title) w.text(b.title, { bold: true });
    if (b.text) w.text(b.text, { gapAfter: 4 });
    await w.image(b.imageUrl, images);
    return;
  }
  w.y -= 6;
  w.text(`${b.number}. ${b.stem}   (${b.points} ${b.points === 1 ? "pt" : "pts"})`, {
    keepWith: LEAD * Math.min(6, 1 + b.options.length + b.answerLines),
  });
  if (b.directions)
    w.text(b.directions, { size: SIZE.small, indent: 18, color: [0.35, 0.35, 0.35] });
  await w.image(b.imageUrl, images);
  if (b.type === "matching") {
    for (const o of b.options) w.text(`____  ${o.letter}. ${o.text}`, { indent: 18 });
    w.text("Choices:", { indent: 18, bold: true });
    b.choices.forEach((c, i) => w.text(`${i + 1}. ${c}`, { indent: 36 }));
  } else if (b.type === "ordering") {
    for (const o of b.options) w.text(`____  ${o.letter}. ${o.text}`, { indent: 18 });
  } else {
    for (const o of b.options) w.text(`[ ]  ${o.letter}. ${o.text}`, { indent: 18 });
  }
  if (b.type === "numeric") w.text(`Answer: ________________ ${b.unit ?? ""}`, { indent: 18 });
  else for (let i = 0; i < b.answerLines; i++) w.rule(18);
}

export async function renderPdf(
  doc: PaperDoc,
  images: ImageLookup = () => undefined
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setCreator("Bloom");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, font, bold);
  w.text(doc.title, { size: SIZE.title, bold: true });
  w.text(
    [
      doc.subtitle,
      `Version ${doc.version}`,
      `${doc.questionCount} questions`,
      `${doc.totalPoints} points`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    { size: SIZE.small, color: [0.4, 0.4, 0.4], gapAfter: 6 }
  );
  w.text("Name: ______________________________   Date: ____________   Period: ______", {
    gapAfter: 8,
  });
  if (doc.instructions)
    w.text(doc.instructions, { size: SIZE.small, color: [0.3, 0.3, 0.3], gapAfter: 6 });
  for (const b of doc.blocks) await block(w, b, images);
  if (doc.key) {
    w.newPage();
    w.text(`${doc.title} · Answer key · Version ${doc.version}`, {
      size: SIZE.title,
      bold: true,
      gapAfter: 6,
    });
    for (const k of doc.key) w.text(`${k.number}. ${k.answer}   (${k.points})`);
  }
  // Page numbers.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(pdfSafe(`${doc.title} · ${i + 1} of ${pages.length}`), {
      x: PAGE.margin,
      y: 28,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  });
  return pdf.save();
}
