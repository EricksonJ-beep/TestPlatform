"use client";

import { useState, useTransition } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCsv } from "@/lib/csv";
import { importStudentsCsv, type ImportRowResult } from "../actions";

export function ImportCsvDialog({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setResults(null);
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await importStudentsCsv(classId, fd);
      if (r.ok) {
        setError(null);
        setResults(r.data.results);
      } else setError(r.error);
    });
  }

  function downloadPasswords() {
    if (!results) return;
    const rows = results
      .filter((r) => r.ok && r.student.tempPassword)
      .map((r) =>
        r.ok
          ? [r.student.firstName, r.student.lastName, r.student.email, r.student.tempPassword]
          : []
      );
    const blob = new Blob([toCsv(["first_name", "last_name", "email", "temp_password"], rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bloom-temp-passwords.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const created = results?.filter((r) => r.ok && r.student.status === "created").length ?? 0;
  const enrolled = results?.filter((r) => r.ok && r.student.status !== "created").length ?? 0;
  const failed = results?.filter((r) => !r.ok).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload data-icon="inline-start" aria-hidden />
        Import CSV
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        {results ? (
          <>
            <DialogHeader>
              <DialogTitle>Import finished</DialogTitle>
              <DialogDescription>
                {created} new {created === 1 ? "account" : "accounts"}, {enrolled} existing{" "}
                {enrolled === 1 ? "student" : "students"} added, {failed}{" "}
                {failed === 1 ? "row" : "rows"} skipped. Temporary passwords are shown once;
                download them now.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 font-medium">Temp password</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r) => (
                    <tr key={r.line}>
                      <td className="px-3 py-1.5 text-muted-foreground tabular">{r.line}</td>
                      <td className="px-3 py-1.5">
                        {r.ok ? (
                          <>
                            <span className="font-medium">
                              {r.student.lastName}, {r.student.firstName}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {r.student.email}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{r.email || "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono">
                        {r.ok ? (r.student.tempPassword ?? "—") : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.ok ? (
                          <span className="text-success-foreground">
                            {r.student.status === "created"
                              ? "Created"
                              : r.student.status === "enrolled_existing"
                                ? "Added (existing account)"
                                : "Already in class"}
                          </span>
                        ) : (
                          <span className="text-error-foreground">{r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              {created > 0 ? (
                <Button variant="secondary" onClick={downloadPasswords}>
                  <Download data-icon="inline-start" aria-hidden />
                  Download passwords (CSV)
                </Button>
              ) : null}
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Import a roster</DialogTitle>
              <DialogDescription>
                A CSV with the columns <code className="font-mono">first_name</code>,{" "}
                <code className="font-mono">last_name</code>,{" "}
                <code className="font-mono">email</code>. Optional:{" "}
                <code className="font-mono">temp_password</code>. Up to 200 rows.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="csv-file">CSV file</Label>
              <Input id="csv-file" name="file" type="file" accept=".csv,text/csv" required />
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
              >
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Importing…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
