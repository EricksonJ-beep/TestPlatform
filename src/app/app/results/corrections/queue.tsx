"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Sparkles, Undo2 } from "lucide-react";
import { cn } from "cn";
import type { QueueCard } from "@/lib/queries/corrections";
import { LocalTime } from "@/components/local-time";
import { RichText } from "@/components/rich-text";
import { TargetChip } from "@/components/targets/target-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveCorrections, returnCorrections } from "./actions";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);

/** The queue: keyboard-first (A/R on the current card, J/K to move, E to expand), cards leave as they're decided. */
export function CorrectionsQueue({ cards: initial }: { cards: QueueCard[] }) {
  const [cards, setCards] = useState(initial);
  const [current, setCurrent] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initial[0] ? [initial[0].attemptId] : [])
  );
  const [returning, setReturning] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const remove = (id: string) => {
    setCards((prev) => {
      const next = prev.filter((c) => c.attemptId !== id);
      setCurrent((i) => Math.min(i, Math.max(0, next.length - 1)));
      if (next[Math.min(current, next.length - 1)])
        setExpanded((e) => new Set([...e, next[Math.min(current, next.length - 1)].attemptId]));
      return next;
    });
  };

  const approve = async (card: QueueCard) => {
    if (pending) return;
    setPending(card.attemptId);
    setError(null);
    const r = await approveCorrections(card.attemptId);
    setPending(null);
    if (r.ok) remove(card.attemptId);
    else setError(r.error);
  };
  const sendBack = async (card: QueueCard) => {
    if (pending) return;
    setPending(card.attemptId);
    setError(null);
    const r = await returnCorrections(card.attemptId, note);
    setPending(null);
    if (r.ok) {
      setReturning(null);
      setNote("");
      remove(card.attemptId);
    } else setError(r.fieldErrors?.note?.[0] ?? r.error);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const card = cards[current];
      if (typing(e.target)) {
        if (e.key === "Escape") setReturning(null);
        return;
      }
      if (!card) return;
      const k = e.key.toLowerCase();
      if (k === "a") {
        e.preventDefault();
        void approve(card);
      } else if (k === "r") {
        e.preventDefault();
        setReturning(card.attemptId);
        setExpanded((s) => new Set([...s, card.attemptId]));
        setTimeout(() => noteRef.current?.focus(), 0);
      } else if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCurrent((i) => Math.min(cards.length - 1, i + 1));
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCurrent((i) => Math.max(0, i - 1));
      } else if (k === "e") {
        e.preventDefault();
        toggle(card.attemptId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, current, note, pending]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-queue-card="${cards[current]?.attemptId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current, cards]);

  if (cards.length === 0)
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        All caught up.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-error-soft px-4 py-2 text-sm text-error-foreground"
        >
          {error}
        </p>
      ) : null}
      <ol ref={listRef} className="flex flex-col gap-3">
        {cards.map((card, i) => {
          const open = expanded.has(card.attemptId);
          const active = i === current;
          return (
            <li
              key={card.attemptId}
              data-queue-card={card.attemptId}
              className={cn(
                "rounded-lg border bg-card transition-colors",
                active ? "border-brand ring-2 ring-brand/30" : "border-border"
              )}
              onClick={() => setCurrent(i)}
            >
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  className="mr-auto flex min-w-0 flex-wrap items-center gap-2 text-left"
                  onClick={() => toggle(card.attemptId)}
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
                  )}
                  <span className="font-medium">{card.studentName}</span>
                  <span className="text-sm text-muted-foreground">
                    · {card.assignmentTitle} · {card.className} · attempt {card.attemptNumber}
                  </span>
                  <span className="text-xs text-muted-foreground tabular">
                    · {card.corrections.length}{" "}
                    {card.corrections.length === 1 ? "correction" : "corrections"}
                    {card.submittedAt ? (
                      <>
                        {" · "}
                        <LocalTime date={card.submittedAt} />
                      </>
                    ) : null}
                  </span>
                </button>
                {card.targets.map((t) => (
                  <TargetChip key={t.code} code={t.code} title={t.title} />
                ))}
                {card.aiFlag ? (
                  <Badge className="bg-warning-soft text-warning-foreground" data-ai-flag>
                    <Sparkles data-icon="inline-start" aria-hidden /> AI flagged
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  disabled={pending === card.attemptId}
                  onClick={() => void approve(card)}
                  data-approve
                >
                  <Check data-icon="inline-start" aria-hidden /> Approve all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending === card.attemptId}
                  onClick={() => {
                    setReturning(card.attemptId);
                    setExpanded((s) => new Set([...s, card.attemptId]));
                    setTimeout(() => noteRef.current?.focus(), 0);
                  }}
                  data-return
                >
                  <Undo2 data-icon="inline-start" aria-hidden /> Return
                </Button>
              </div>

              {open ? (
                <ol className="divide-y divide-border border-t border-border">
                  {card.corrections.map((c) => (
                    <li
                      key={c.questionId}
                      className="flex flex-col gap-2 px-4 py-3"
                      data-correction
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                        <span className="tabular">Question {c.order}</span>
                        {c.target ? (
                          <TargetChip code={c.target.code} title={c.target.title} />
                        ) : null}
                        {c.aiFlag ? (
                          <span className="text-warning-foreground">
                            AI flag{c.aiNote ? `: ${c.aiNote}` : ""}
                          </span>
                        ) : null}
                      </div>
                      <RichText text={c.stem} as="p" className="text-[15px] leading-relaxed" />
                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        <div className="rounded-md bg-error-soft/60 px-3 py-2">
                          <dt className="text-xs font-medium text-muted-foreground">
                            Their answer on the test
                          </dt>
                          <dd className="mt-0.5 whitespace-pre-wrap">{c.studentAnswerText}</dd>
                        </div>
                        <div className="rounded-md bg-success-soft/50 px-3 py-2">
                          <dt className="text-xs font-medium text-muted-foreground">Answer key</dt>
                          <dd className="mt-0.5 whitespace-pre-wrap">
                            {c.keyText ?? "Graded by you"}
                          </dd>
                        </div>
                        <div className="rounded-md border border-border px-3 py-2">
                          <dt className="text-xs font-medium text-muted-foreground">
                            Their corrected answer
                          </dt>
                          <dd className="mt-0.5 whitespace-pre-wrap" data-corrected-answer>
                            {c.correctAnswer}
                          </dd>
                        </div>
                        <div className="rounded-md border border-border px-3 py-2">
                          <dt className="text-xs font-medium text-muted-foreground">
                            Why, in their words
                          </dt>
                          <dd className="mt-0.5 whitespace-pre-wrap" data-why>
                            {c.explanation}
                          </dd>
                        </div>
                      </dl>
                      {c.teacherExplanation ? (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Your explanation:</span>{" "}
                          <RichText text={c.teacherExplanation} />
                        </p>
                      ) : null}
                    </li>
                  ))}
                  <li className="px-4 py-2 text-xs">
                    <Link
                      href={`/app/results/attempts/${card.attemptId}`}
                      className="font-medium text-brand-deep hover:underline"
                    >
                      Whole attempt
                    </Link>
                  </li>
                </ol>
              ) : null}

              {returning === card.attemptId ? (
                <form
                  className="flex flex-col gap-2 border-t border-border px-4 py-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendBack(card);
                  }}
                >
                  <label htmlFor={`note-${card.attemptId}`} className="text-sm font-medium">
                    Note to {card.studentName.split(" ")[0]}
                  </label>
                  <Textarea
                    id={`note-${card.attemptId}`}
                    ref={noteRef}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What should they fix? (Esc to cancel)"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={pending === card.attemptId}>
                      Send back
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReturning(null);
                        setNote("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
