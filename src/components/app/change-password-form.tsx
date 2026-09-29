"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changePassword } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";

/** Current password, new password twice. Used by students (/student/password) and teachers (/app/settings/password). */
export function ChangePasswordForm({
  doneHref,
  minLength,
}: {
  doneHref: string;
  minLength: number;
}) {
  const router = useRouter();
  const { run, pending, error, fieldErrors } = useAction();
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6"
        role="status"
      >
        <p className="font-medium">Password changed.</p>
        <p className="text-sm text-muted-foreground">Use the new one next time you log in.</p>
        <Button className="self-start" onClick={() => router.push(doneHref)}>
          Done
        </Button>
      </div>
    );
  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(changePassword(new FormData(e.currentTarget)), () => setDone(true));
      }}
      data-change-password
    >
      <div className="grid gap-1.5">
        <Label htmlFor="cp-current">Current password</Label>
        <Input
          id="cp-current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
        <FieldError errors={fieldErrors} name="current" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cp-next">New password</Label>
        <Input
          id="cp-next"
          name="next"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          required
        />
        <p className="text-xs text-muted-foreground">
          At least {minLength} characters. A short phrase you can remember works well.
        </p>
        <FieldError errors={fieldErrors} name="next" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cp-confirm">New password again</Label>
        <Input
          id="cp-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError errors={fieldErrors} name="confirm" />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-error-foreground">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(doneHref)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
