"use client";

import { useState, useTransition } from "react";
import { KeyRound, UserMinus, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RosterRow } from "@/lib/queries/classes";
import { removeStudent, resetStudentPassword } from "../actions";
import { AccommodationsDialog } from "./accommodations-dialog";
import { PasswordReveal } from "./password-reveal";

function formatDate(d: Date | null): string {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Roster({ classId, roster }: { classId: string; roster: RosterRow[] }) {
  const [pending, start] = useTransition();
  const [reset, setReset] = useState<{ name: string; email: string; password: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  function onReset(row: RosterRow) {
    if (
      !confirm(
        `Reset the password for ${row.firstName} ${row.lastName}? Their current password stops working.`
      )
    )
      return;
    start(async () => {
      const r = await resetStudentPassword(classId, row.studentId);
      if (r.ok) {
        setError(null);
        setReset({
          name: `${row.firstName} ${row.lastName}`,
          email: row.email,
          password: r.data.tempPassword,
        });
      } else setError(r.error);
    });
  }

  function onRemove(row: RosterRow) {
    if (
      !confirm(
        `Remove ${row.firstName} ${row.lastName} from this class? Their account and work are kept.`
      )
    )
      return;
    start(async () => {
      const r = await removeStudent(classId, row.studentId);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {error ? (
        <p
          role="alert"
          className="m-4 rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {error}
        </p>
      ) : null}
      {roster.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Add students one at a time or upload a CSV with first_name, last_name, email. Each new account gets a temporary password you hand to the student."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="hidden sm:table-cell">Last login</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Accommodations</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.map((row) => (
              <TableRow key={row.enrollmentId}>
                <TableCell className="font-medium">
                  {row.lastName}, {row.firstName}
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {row.email}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {formatDate(row.lastLoginAt)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {row.mustChangePassword ? (
                    <Badge className="bg-warning-soft text-warning-foreground">Temp password</Badge>
                  ) : (
                    <Badge className="bg-success-soft text-success-foreground">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <AccommodationsDialog classId={classId} row={row} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => onReset(row)}
                    >
                      <KeyRound data-icon="inline-start" aria-hidden />
                      Reset password
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Remove ${row.firstName} ${row.lastName} from class`}
                      onClick={() => onRemove(row)}
                    >
                      <UserMinus aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={reset !== null} onOpenChange={(o) => !o && setReset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New temporary password</DialogTitle>
            <DialogDescription>
              Give this to {reset?.name}. It is shown once and never stored in plain text.
            </DialogDescription>
          </DialogHeader>
          {reset ? <PasswordReveal email={reset.email} password={reset.password} /> : null}
          <DialogFooter>
            <Button onClick={() => setReset(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
