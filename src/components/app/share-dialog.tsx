"use client";

import { useState } from "react";
import { Share2, X } from "lucide-react";
import type { ShareRef, ShareRow } from "@/lib/queries/shares";
import { revokeShare, shareResource } from "@/app/app/shared/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const PERMISSION_LABEL = {
  view: "Can view",
  copy: "Can copy",
  co_edit: "Can co-edit",
} as const;
const PERMISSION_HELP = {
  view: "See the questions or the test; nothing else.",
  copy: "View plus make their own copy to edit.",
  co_edit: "Edit it with you; every change is visible to both of you.",
} as const;

/** Share a bank or assessment with a colleague by email (PLAN.md §3.12). Owner only. */
export function ShareDialog({
  resource,
  shares,
  label = "Share",
}: {
  resource: ShareRef;
  shares: ShareRow[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<keyof typeof PERMISSION_LABEL>("view");
  const { run, pending, error, fieldErrors, reset } = useAction();
  const noun = resource.type === "question_bank" ? "bank" : "assessment";
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Share2 data-icon="inline-start" aria-hidden />
        {label}
        {shares.length ? ` · ${shares.length}` : ""}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this {noun}</DialogTitle>
          <DialogDescription>
            Colleagues see it under Shared with me. Private {noun}s never show to anyone else.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            run(shareResource(resource, new FormData(form)), () => form.reset());
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="share-email">Colleague&apos;s email</Label>
            <Input
              id="share-email"
              name="email"
              type="email"
              placeholder="name@cadott.k12.wi.us"
              required
            />
            <FieldError errors={fieldErrors} name="email" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="share-permission">Permission</Label>
            <select
              id="share-permission"
              name="permission"
              value={permission}
              onChange={(e) => setPermission(e.target.value as keyof typeof PERMISSION_LABEL)}
              className={selectClass}
            >
              {(Object.keys(PERMISSION_LABEL) as (keyof typeof PERMISSION_LABEL)[]).map((p) => (
                <option key={p} value={p}>
                  {PERMISSION_LABEL[p]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{PERMISSION_HELP[permission]}</p>
          </div>
          {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
          <Button type="submit" disabled={pending} className="justify-self-start">
            Share
          </Button>
        </form>
        <section className="grid gap-2" aria-label="Shared with">
          <h3 className="text-sm font-medium">Shared with</h3>
          {shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {shares.map((s) => (
                <li
                  key={s.userId}
                  className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                  data-share={s.userId}
                >
                  <span className="mr-auto min-w-0">
                    <span className="font-medium">
                      {s.firstName} {s.lastName}
                    </span>
                    {s.email ? (
                      <span className="block text-xs text-muted-foreground">{s.email}</span>
                    ) : null}
                  </span>
                  <select
                    aria-label={`Permission for ${s.firstName} ${s.lastName}`}
                    className={selectClass}
                    value={s.permission}
                    disabled={pending}
                    onChange={(e) => {
                      const f = new FormData();
                      f.set("email", s.email ?? "");
                      f.set("permission", e.target.value);
                      run(shareResource(resource, f));
                    }}
                  >
                    {(Object.keys(PERMISSION_LABEL) as (keyof typeof PERMISSION_LABEL)[]).map(
                      (p) => (
                        <option key={p} value={p}>
                          {PERMISSION_LABEL[p]}
                        </option>
                      )
                    )}
                  </select>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Stop sharing with ${s.firstName} ${s.lastName}`}
                    disabled={pending}
                    onClick={() => run(revokeShare(resource, s.userId))}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
