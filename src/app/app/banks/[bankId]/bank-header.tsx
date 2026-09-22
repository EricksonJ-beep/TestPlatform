"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";
import type { BankDetail } from "@/lib/queries/banks";
import { setBankArchived, updateBank } from "../actions";

const ACCESS_LABEL = {
  owner: "You own this",
  view: "Can view",
  copy: "Can copy",
  co_edit: "Can co-edit",
} as const;

export function BankHeader({
  bank,
  access,
  courses,
  questionCount,
  action,
}: {
  bank: BankDetail;
  access: keyof typeof ACCESS_LABEL;
  courses: { id: string; name: string }[];
  questionCount: number;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { run, pending, error, fieldErrors, reset } = useAction();
  const canEdit = access === "owner" || access === "co_edit";

  if (editing) {
    return (
      <form
        className="mt-2 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(updateBank(bank.id, new FormData(e.currentTarget)), () => setEditing(false));
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="bh-name">Bank name</Label>
          <Input id="bh-name" name="name" defaultValue={bank.name} required autoFocus />
          <FieldError errors={fieldErrors} name="name" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bh-desc">Description</Label>
          <Input id="bh-desc" name="description" defaultValue={bank.description ?? ""} />
        </div>
        {access === "owner" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="bh-course">Course</Label>
            <select
              id="bh-course"
              name="courseId"
              defaultValue={bank.courseId ?? ""}
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none"
            >
              <option value="">No course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              reset();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </div>
        {error ? <p className="text-sm text-error-foreground sm:col-span-4">{error}</p> : null}
      </form>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-start gap-3">
      <div className="mr-auto">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl">{bank.name}</h1>
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
            {ACCESS_LABEL[access]}
          </span>
          {bank.isArchived ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Archived
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {bank.courseName ?? "No course"}
          {access !== "owner" ? ` · from ${bank.ownerFirstName} ${bank.ownerLastName}` : ""}
          {bank.description ? ` · ${bank.description}` : ""}
          {" · "}
          <span className="tabular">
            {questionCount} {questionCount === 1 ? "question" : "questions"}
          </span>
        </p>
        {error ? <p className="mt-1 text-sm text-error-foreground">{error}</p> : null}
      </div>
      {canEdit ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" aria-hidden />
            Rename
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(setBankArchived(bank.id, !bank.isArchived), () => {
                if (!bank.isArchived) router.push("/app/banks");
              })
            }
          >
            {bank.isArchived ? (
              <ArchiveRestore data-icon="inline-start" aria-hidden />
            ) : (
              <Archive data-icon="inline-start" aria-hidden />
            )}
            {bank.isArchived ? "Restore" : "Archive"}
          </Button>
        </>
      ) : null}
      {action}
    </div>
  );
}
