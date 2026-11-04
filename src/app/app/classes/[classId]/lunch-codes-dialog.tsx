"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hash } from "lucide-react";
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
import { setLunchCodes } from "../actions";

/**
 * Lunch codes for the Skyward export (Jon, Nov 5 2026): paste the school roster (name, grade,
 * email), and each student's code is saved by name match.
 */
export function LunchCodesDialog({ classId }: { classId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    saved: number;
    unmatched: string[];
    withoutCode: number;
  } | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setResult(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Hash data-icon="inline-start" aria-hidden />
        Lunch codes
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lunch codes for Skyward</DialogTitle>
          <DialogDescription>
            Paste the class roster from Skyward or the school list: one student per line, with their
            name and lunch code (an email like 1234@cadott.k12.wi.us works). Bloom matches each line
            to a student by name, and the Skyward export uses the code as the ID.
          </DialogDescription>
        </DialogHeader>
        <textarea
          className="min-h-48 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          placeholder={"DOE, JANE A.   09   1234@cadott.k12.wi.us"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Roster with lunch codes"
        />
        {result ? (
          <div className="flex flex-col gap-1 text-sm" data-lunch-result>
            <p className="font-medium text-success-foreground">
              Saved {result.saved} {result.saved === 1 ? "code" : "codes"}.
            </p>
            {result.unmatched.length ? (
              <p className="text-warning-foreground">
                No student in this class matched: {result.unmatched.join(", ")}.
              </p>
            ) : null}
            {result.withoutCode > 0 ? (
              <p className="text-muted-foreground">
                {result.withoutCode} {result.withoutCode === 1 ? "student" : "students"} in the
                class still have no code from this paste.
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
        <DialogFooter>
          <Button
            disabled={pending || !text.trim()}
            onClick={() =>
              start(async () => {
                const r = await setLunchCodes(classId, text);
                if (r.ok) {
                  setError(null);
                  setResult(r.data);
                  router.refresh();
                } else setError(r.error);
              })
            }
          >
            {pending ? "Saving…" : "Save codes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
