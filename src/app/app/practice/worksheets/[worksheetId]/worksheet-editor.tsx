"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import type { LinkableStudent, WorksheetDetail } from "@/lib/queries/worksheets";
import { COUNTS_AS_LABEL, webhookBlock } from "@/lib/worksheet-rules";
import { LocalTime } from "@/components/local-time";
import { TargetPicker } from "@/components/targets/target-picker";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction, FieldError } from "@/components/use-action";
import { deleteWorksheet, linkEmailToStudent, rerunMatching, updateWorksheet } from "../actions";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Target = { id: string; code: string; title: string };

/** One registered worksheet: settings, section → target map, the Code.gs block, submissions, unmatched emails. */
export function WorksheetEditor({
  detail,
  targets,
  students,
  webhookUrl,
  secret,
}: {
  detail: WorksheetDetail;
  targets: Target[];
  students: LinkableStudent[];
  webhookUrl: string;
  secret: string;
}) {
  const router = useRouter();
  const save = useAction();
  const misc = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl">{detail.title ?? "Untitled worksheet"}</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {COUNTS_AS_LABEL[detail.countsAs]} · {detail.courseName ?? "No course"} ·{" "}
            {detail.submits} {detail.submits === 1 ? "submit" : "submits"} · {detail.students}{" "}
            {detail.students === 1 ? "student" : "students"}
            {detail.scriptId.startsWith("pending:")
              ? " · waiting for its first submit to learn the script id"
              : ` · script ${detail.scriptId.slice(0, 12)}…`}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={misc.pending}
          onClick={() =>
            misc.run(rerunMatching(detail.id), (r) =>
              setNotice(`Matched ${r.matched}, applied ${r.applied}.`)
            )
          }
        >
          <RefreshCw data-icon="inline-start" aria-hidden />
          Re-run matching
        </Button>
        {confirmDelete ? (
          <>
            <Button
              variant="destructive"
              disabled={misc.pending}
              onClick={() =>
                misc.run(deleteWorksheet(detail.id), () => router.push("/app/practice/worksheets"))
              }
            >
              Delete for good
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete worksheet"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      {misc.error ? (
        <p
          role="alert"
          className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {misc.error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <form
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.run(updateWorksheet(detail.id, new FormData(e.currentTarget)), (r) =>
            setNotice(`Saved. Matched ${r.matched}, applied ${r.applied}.`)
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ws-title">Title</Label>
            <Input id="ws-title" name="title" defaultValue={detail.title ?? ""} required />
            <FieldError errors={save.fieldErrors} name="title" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ws-counts">Counts as</Label>
            <select
              id="ws-counts"
              name="countsAs"
              defaultValue={detail.countsAs}
              className={selectClass}
            >
              {(Object.keys(COUNTS_AS_LABEL) as (keyof typeof COUNTS_AS_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {COUNTS_AS_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ws-url">Student link (what students open)</Label>
          <Input
            id="ws-url"
            name="studentUrl"
            defaultValue={detail.studentUrl ?? ""}
            placeholder="https://script.google.com/a/macros/cadott.k12.wi.us/s/…/exec"
          />
          <FieldError errors={save.fieldErrors} name="studentUrl" />
        </div>
        <TargetPicker targets={targets} defaultSelected={detail.targets.map((t) => t.id)} />
        <FieldError errors={save.fieldErrors} name="targetIds" />

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Section → target map (optional)</legend>
          {detail.sectionTitles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Section titles appear here after the first submit. Map a section like “Part D: LT4” to
              its target so a student who finishes only that part gets credit for it.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                A mapped target is credited when its section scores above zero. Targets no section
                maps to are credited by any submit. Save targets first; the choices below use the
                saved ones.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {detail.sectionTitles.map((section) => (
                  <li key={section} className="grid gap-1">
                    <Label htmlFor={`map-${section}`} className="truncate">
                      {section}
                    </Label>
                    <select
                      id={`map-${section}`}
                      name={`map:${section}`}
                      defaultValue={detail.sectionTargetMap[section] ?? ""}
                      className={selectClass}
                    >
                      <option value="">Not mapped</option>
                      {detail.targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} · {t.title}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>
        {save.error ? <p className="text-sm text-error-foreground">{save.error}</p> : null}
        <Button type="submit" disabled={save.pending} className="self-start">
          Save
        </Button>
      </form>

      <WebhookBlock webhookUrl={webhookUrl} secret={secret} />

      {detail.unmatchedEmails.length > 0 ? (
        <section
          className="rounded-lg border border-warning/40 bg-card"
          aria-label="Unmatched submissions"
        >
          <h2 className="border-b border-border px-4 py-2 text-sm font-medium">
            Unmatched submissions · {detail.unmatchedEmails.length}{" "}
            {detail.unmatchedEmails.length === 1 ? "email" : "emails"}
          </h2>
          <p className="px-4 pt-2 text-xs text-muted-foreground">
            These emails don&apos;t belong to a student account yet. Link each one to the student it
            belongs to; their past and future submits then count.
          </p>
          <ul className="divide-y divide-border">
            {detail.unmatchedEmails.map((u) => (
              <UnmatchedRow
                key={u.email}
                email={u.email}
                submits={u.submits}
                lastAt={u.lastAt}
                students={students}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card">
        <h2 className="border-b border-border px-4 py-2 text-sm font-medium">Submissions</h2>
        {detail.events.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            Nothing yet. Once the block below is in the worksheet&apos;s Code.gs and it is
            redeployed, every final submit lands here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {detail.events.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm"
                data-event={e.id}
              >
                <span className={e.studentName ? "font-medium" : "text-warning-foreground"}>
                  {e.studentName ?? e.email}
                </span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{e.event}</span>
                <span className="text-muted-foreground tabular">
                  {e.score !== null ? `${Math.round(e.score)}%` : ""}
                  {e.cardsCorrect !== null && e.totalCards !== null
                    ? ` · ${e.cardsCorrect}/${e.totalCards} cards`
                    : ""}
                  {e.totalChecks !== null ? ` · ${e.totalChecks} checks` : ""}
                </span>
                {e.sectionScores ? (
                  <span className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {Object.entries(e.sectionScores).map(([k, v]) => (
                      <span key={k} className="rounded bg-muted px-1">
                        {k} {Math.round(v)}%
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  <LocalTime date={e.occurredAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.targets.length ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Tagged:
          {detail.targets.map((t) => (
            <TargetChip key={t.id} code={t.code} title={t.title} className="h-5" />
          ))}
        </p>
      ) : null}
    </div>
  );
}

function UnmatchedRow({
  email,
  submits,
  lastAt,
  students,
}: {
  email: string;
  submits: number;
  lastAt: Date;
  students: LinkableStudent[];
}) {
  const { run, pending, error } = useAction();
  const [studentId, setStudentId] = useState("");
  const local = email.split("@")[0].toLowerCase();
  const sorted = [...students].sort((a, b) => {
    const score = (s: LinkableStudent) =>
      (s.email ? 2 : 0) + (s.username && local.includes(s.username.toLowerCase()) ? -1 : 0);
    return score(a) - score(b) || a.lastName.localeCompare(b.lastName);
  });
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm" data-unmatched={email}>
      <span className="font-mono text-xs">{email}</span>
      <span className="text-xs text-muted-foreground tabular">
        {submits} {submits === 1 ? "submit" : "submits"} · last <LocalTime date={lastAt} />
      </span>
      <span className="ml-auto inline-flex items-center gap-2">
        <select
          aria-label={`Student for ${email}`}
          className={selectClass}
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        >
          <option value="">Link to student…</option>
          {sorted.map((s) => (
            <option key={s.id} value={s.id}>
              {s.lastName}, {s.firstName}
              {s.email ? ` (${s.email})` : s.username ? ` (${s.username})` : ""}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!studentId || pending}
          onClick={() => run(linkEmailToStudent(email, studentId))}
        >
          Link
        </Button>
      </span>
      {error ? <p className="basis-full text-xs text-error-foreground">{error}</p> : null}
    </li>
  );
}

function WebhookBlock({ webhookUrl, secret }: { webhookUrl: string; secret: string }) {
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const block = webhookBlock(webhookUrl, secret);
  const shown = reveal ? block : block.replace(secret || "\u0000", "••••••••");
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <h2 className="mr-auto text-sm font-medium">Code.gs block (Appendix B)</h2>
        <Button size="sm" variant="ghost" onClick={() => setReveal((r) => !r)}>
          {reveal ? (
            <EyeOff data-icon="inline-start" aria-hidden />
          ) : (
            <Eye data-icon="inline-start" aria-hidden />
          )}
          {reveal ? "Hide secret" : "Show secret"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!secret}
          onClick={() => {
            void navigator.clipboard.writeText(block).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <Copy data-icon="inline-start" aria-hidden />
          {copied ? "Copied" : "Copy block"}
        </Button>
      </div>
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        Paste this into the CONFIG area of the worksheet&apos;s Code.gs, add the two calls where the
        comments say, then Deploy → Manage deployments → New version. The student link stays the
        same.
        {!secret ? " BLOOM_WORKSHEET_SECRET is not set on this server yet." : ""}
      </p>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed">{shown}</pre>
    </section>
  );
}
