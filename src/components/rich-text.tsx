"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";
import { cn } from "cn";
import { parseRichText } from "@/lib/richtext";

function Math({ tex, display }: { tex: string; display: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        output: "html",
      });
    } catch {
      return null;
    }
  }, [tex, display]);
  if (html === null) return <code className="text-error-foreground">{tex}</code>;
  return (
    <span
      className={display ? "my-1 block" : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Renders Bloom's light markup (see src/lib/richtext.ts). Safe: only our own segments become HTML. */
export function RichText({
  text,
  className,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  as?: "span" | "p" | "div";
}) {
  const segments = useMemo(() => parseRichText(text), [text]);
  return (
    <Tag className={cn("whitespace-pre-wrap", className)}>
      {segments.map((s, i) => {
        switch (s.kind) {
          case "text":
            return <span key={i}>{s.text}</span>;
          case "sub":
            return <sub key={i}>{s.text}</sub>;
          case "sup":
            return <sup key={i}>{s.text}</sup>;
          case "bold":
            return <strong key={i}>{s.text}</strong>;
          case "italic":
            return <em key={i}>{s.text}</em>;
          case "math":
            return <Math key={i} tex={s.tex} display={s.display} />;
          case "br":
            return <br key={i} />;
        }
      })}
    </Tag>
  );
}
