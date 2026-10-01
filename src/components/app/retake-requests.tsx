"use client";

import Link from "next/link";
import { Hand } from "lucide-react";
import type { RetakeRequest } from "@/lib/queries/dashboard";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAction } from "@/components/use-action";
import { revokeAttemptUnlock, unlockNextAttempt } from "@/app/app/results/actions";

/** Dashboard queue (Jon, Oct 1 2026): students asking for their next attempt; approve or decline in one click. */
export function RetakeRequests({ rows }: { rows: RetakeRequest[] }) {
  if (rows.length === 0) return null;
  return (
    <Card data-retake-requests>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <Hand className="size-4 text-warning-foreground" aria-hidden />
          Retake requests
          <span className="rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-foreground tabular">
            {rows.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RequestRow({ r }: { r: RetakeRequest }) {
  const { run, pending, error } = useAction();
  return (
    <li className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm" data-request={r.id}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {r.lastName}, {r.firstName}
          <span className="font-normal text-muted-foreground"> · attempt {r.attemptNumber}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <Link href={`/app/results/${r.assignmentId}`} className="hover:underline">
            {r.title}
          </Link>{" "}
          · {r.className}
          {r.bestPercent !== null ? ` · best ${Math.round(r.bestPercent)}%` : ""}
          {r.requestedAt ? (
            <>
              {" "}
              · asked <LocalTime date={r.requestedAt} />
            </>
          ) : null}
        </p>
        {error ? <p className="text-xs text-error-foreground">{error}</p> : null}
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(unlockNextAttempt(r.assignmentId, r.studentId))}
      >
        {pending ? "Approving…" : "Approve"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(revokeAttemptUnlock(r.assignmentId, r.studentId))}
      >
        Decline
      </Button>
    </li>
  );
}
