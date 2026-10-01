"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Paper copies of the test: PDF or Word, with or without the answer key, versions A and B. */
export function DownloadMenu({ assessmentId }: { assessmentId: string }) {
  const href = (format: "pdf" | "docx", key: boolean, version: string) =>
    `/api/assessments/${assessmentId}/paper?format=${format}&version=${version}${key ? "&key=1" : ""}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Download data-icon="inline-start" aria-hidden />
        Download
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        {(["A", "B"] as const).map((v) => (
          <DropdownMenuGroup key={v}>
            <DropdownMenuLabel>Version {v}</DropdownMenuLabel>
            <DropdownMenuItem
              nativeButton={false}
              render={<a href={href("pdf", false, v)} download />}
            >
              PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              nativeButton={false}
              render={<a href={href("pdf", true, v)} download />}
            >
              PDF with answer key
            </DropdownMenuItem>
            <DropdownMenuItem
              nativeButton={false}
              render={<a href={href("docx", false, v)} download />}
            >
              Word (.docx)
            </DropdownMenuItem>
            <DropdownMenuItem
              nativeButton={false}
              render={<a href={href("docx", true, v)} download />}
            >
              Word with answer key
            </DropdownMenuItem>
            {v === "A" ? <DropdownMenuSeparator /> : null}
          </DropdownMenuGroup>
        ))}
        <DropdownMenuSeparator />
        {/* A plain note, not a menu label: Base UI requires labels to sit inside a group, and a
            label here crashed the menu the moment it opened (Jon, Oct 1 2026). */}
        <p className="px-2 py-1.5 text-xs font-normal text-muted-foreground">
          Versions draw different pool questions and shuffle matching choices. Name, date, and
          period lines are on the sheet.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
