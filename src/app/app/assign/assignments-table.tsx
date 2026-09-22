"use client";

import { useState } from "react";
import { Clock, Lock, Trash2 } from "lucide-react";
import type { AssignmentRow } from "@/lib/queries/assignments";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAction } from "@/components/use-action";
import { closeAssignmentNow, deleteAssignment, extendAssignment } from "./actions";
import { AssignmentDialog, type AssignableAssessment, type ClassOption } from "./assignment-dialog";

const STATUS: Record<AssignmentRow["status"], { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-warning-soft text-warning-foreground" },
  open: { label: "Open", className: "bg-success-soft text-success-foreground" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

const EXTENSIONS = [
  { label: "15 minutes", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "Until tomorrow (+1 day)", minutes: 60 * 24 },
  { label: "1 week", minutes: 60 * 24 * 7 },
];

export function AssignmentsTable({
  assignments,
  assessments,
  classes,
}: {
  assignments: AssignmentRow[];
  assessments: AssignableAssessment[];
  classes: ClassOption[];
}) {
  const { run, pending, error } = useAction();
  const [confirmId, setConfirmId] = useState<string | null>(null);

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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Assessment</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Window</TableHead>
            <TableHead className="hidden lg:table-cell">Rules</TableHead>
            <TableHead className="hidden sm:table-cell">Progress</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.map((a) => {
            const st = STATUS[a.status];
            return (
              <TableRow key={a.id} data-assignment={a.id}>
                <TableCell className="font-medium">
                  {a.assessmentTitle}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {a.assessmentType}
                  </span>
                </TableCell>
                <TableCell>{a.className}</TableCell>
                <TableCell>
                  <Badge className={st.className}>{st.label}</Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {!a.opensAt && !a.closesAt ? (
                    "Always open"
                  ) : (
                    <span className="tabular">
                      {a.opensAt ? <LocalTime date={a.opensAt} /> : "Now"}
                      {" → "}
                      {a.closesAt ? <LocalTime date={a.closesAt} /> : "no close"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  <span className="flex flex-wrap gap-x-2">
                    {a.accessCode ? (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Lock className="size-3" aria-hidden />
                        {a.accessCode}
                      </span>
                    ) : null}
                    {a.timeLimitMinutes ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" aria-hidden />
                        {a.timeLimitMinutes} min
                      </span>
                    ) : null}
                    <span>
                      {a.attemptsAllowed === null
                        ? "Unlimited attempts"
                        : `${a.attemptsAllowed} ${a.attemptsAllowed === 1 ? "attempt" : "attempts"}`}
                    </span>
                    <span>{a.retakeThreshold}% threshold</span>
                  </span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular sm:table-cell">
                  {a.started}/{a.enrolled} started · {a.submitted} done
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-0.5">
                    <AssignmentDialog assessments={assessments} classes={classes} existing={a} />
                    {a.status !== "closed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(closeAssignmentNow(a.id))}
                      >
                        Close now
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button size="sm" variant="outline" disabled={pending} />}
                      >
                        Extend
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>Push the close later by</DropdownMenuLabel>
                          {EXTENSIONS.map((e) => (
                            <DropdownMenuItem
                              key={e.minutes}
                              onClick={() => run(extendAssignment(a.id, e.minutes))}
                            >
                              {e.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {a.started === 0 ? (
                      confirmId === a.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={pending}
                            onClick={() => run(deleteAssignment(a.id), () => setConfirmId(null))}
                          >
                            Delete
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                            Keep
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Delete assignment"
                          onClick={() => setConfirmId(a.id)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      )
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
