/**
 * The practice check (Jon, Nov 2–4 2026; docs/relearning-revamp-plan.md, rules P1–P5, ticket R3):
 * 5 auto-graded questions from the target's Practice banks, the first answer counts, and the
 * check passes at the assignment's pass mark (default 4 of 5). Pure: the server module
 * (`src/lib/practice-check-server.ts`) reads the questions and writes the rounds; this deals and
 * scores. Nothing here is a grade on its own; a passed check unlocks the next step of the path.
 */
import type { QuestionType } from "@/db/types";
import { difficultyBand, type DifficultyBand } from "@/lib/assessments/serve";
import { CHECK_SIZE, splitCheck } from "@/lib/relearning-path";

/** Never in a check (decision 13): written answers, and Phase 2's image hotspot. */
const NOT_IN_CHECK: ReadonlySet<QuestionType> = new Set([
  "short_answer",
  "extended_response",
  "image_hotspot",
]);

/** P1: auto-graded types only, on questions graded automatically. */
export function checkable(q: { type: QuestionType; grading: "auto" | "manual" }): boolean {
  return q.grading === "auto" && !NOT_IN_CHECK.has(q.type);
}

/** At most one true/false per check (decision 35): a first-try true/false is a coin flip. */
export const MAX_TRUE_FALSE = 1;

/** The difficulty mix of a check (decision 11): 3 easy · 1 medium · 1 hard, served in that order. */
export const CHECK_MIX: Record<DifficultyBand, number> = { easy: 3, medium: 1, hard: 1 };
const BANDS: DifficultyBand[] = ["easy", "medium", "hard"];
/** Where a band borrows from when it runs short: the nearest band first. */
const BORROW: Record<DifficultyBand, DifficultyBand[]> = {
  easy: ["medium", "hard"],
  medium: ["easy", "hard"],
  hard: ["medium", "easy"],
};

export type CheckCandidate = {
  questionId: string;
  points: number;
  difficulty: number;
  type: QuestionType;
  /** The learning targets the question is tagged to. */
  targetIds: string[];
};

export type DealtQuestion = {
  questionId: string;
  learningTargetId: string;
  band: DifficultyBand;
  points: number;
  type: QuestionType;
};

export type CheckDeal = {
  questions: DealtQuestion[];
  /**
   * A band or a target couldn't fill its share from fresh-or-seen questions of its own, so the deal
   * borrowed or came up short: the teacher's bank health flags it (P1).
   */
  thin: boolean;
};

/**
 * Which band each of a target's slots asks for. Rule (decision 11, P1): the whole check holds
 * 3 easy · 1 medium · 1 hard; each target gets an easy question first (weakest first, while easy
 * ones last), then the rest go medium, hard, then easy, weakest target first. One target: E E E M H;
 * 3 + 2: weak E M H, strong E E; 2 + 2 + 1: an easy each, then medium and hard to the two weakest.
 */
export function checkBands(counts: { id: string; count: number }[]): Map<string, DifficultyBand[]> {
  const left = { ...CHECK_MIX };
  const out = new Map<string, DifficultyBand[]>(counts.map((c) => [c.id, []]));
  for (const c of counts)
    if (c.count > 0 && left.easy > 0) {
      out.get(c.id)!.push("easy");
      left.easy--;
    }
  const queue: DifficultyBand[] = [
    ...Array<DifficultyBand>(left.medium).fill("medium"),
    ...Array<DifficultyBand>(left.hard).fill("hard"),
    ...Array<DifficultyBand>(left.easy).fill("easy"),
  ];
  for (const c of counts) {
    const slots = out.get(c.id)!;
    while (slots.length < c.count) slots.push(queue.shift() ?? "medium");
  }
  return out;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Deal one round (P1). The 5 slots split across the targets (`splitCheck`: evenly, the extra to
 * the weakest) and across bands (`checkBands`). Each slot draws a question tagged to its target in
 * its band, questions the student hasn't been served in a check before first, with at most one
 * true/false in the whole round; a band that runs short borrows from the nearest band, and a target
 * with nothing left gives its slot to another target, so the round stays 5 when the banks allow.
 * Served easy → medium → hard.
 */
export function dealCheck(input: {
  targets: { id: string; percent: number; sortOrder?: number }[];
  candidates: CheckCandidate[];
  /** Questions this student has been served in earlier check rounds. */
  seen: ReadonlySet<string>;
  rng: () => number;
  size?: number;
}): CheckDeal {
  const size = input.size ?? CHECK_SIZE;
  const split = splitCheck(input.targets, size);
  const order = [...split.keys()];
  const bands = checkBands(order.map((id) => ({ id, count: split.get(id) ?? 0 })));
  const taken = new Set<string>();
  let trueFalse = 0;
  let thin = false;
  const picked: DealtQuestion[] = [];

  const draw = (target: string, band: DifficultyBand): CheckCandidate | null => {
    const pool = input.candidates.filter(
      (c) =>
        !taken.has(c.questionId) &&
        c.targetIds.includes(target) &&
        difficultyBand(c.difficulty) === band &&
        (c.type !== "true_false" || trueFalse < MAX_TRUE_FALSE)
    );
    if (pool.length === 0) return null;
    const fresh = pool.filter((c) => !input.seen.has(c.questionId));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(input.rng() * from.length)];
  };
  const take = (target: string, c: CheckCandidate) => {
    taken.add(c.questionId);
    if (c.type === "true_false") trueFalse++;
    picked.push({
      questionId: c.questionId,
      learningTargetId: target,
      band: difficultyBand(c.difficulty),
      points: c.points,
      type: c.type,
    });
  };

  const unfilled: DifficultyBand[] = [];
  for (const target of order) {
    for (const band of bands.get(target) ?? []) {
      let c = draw(target, band);
      if (!c) {
        thin = true;
        for (const other of BORROW[band]) {
          c = draw(target, other);
          if (c) break;
        }
      }
      if (c) take(target, c);
      else unfilled.push(band);
    }
  }
  // A target with nothing left: its slot goes to another target of the check, weakest first.
  for (const band of unfilled) {
    let placed = false;
    for (const target of order) {
      for (const b of [band, ...BORROW[band]]) {
        const c = draw(target, b);
        if (c) {
          take(target, c);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }
  if (picked.length < size) thin = true;
  const byBand = BANDS.flatMap((b) =>
    shuffle(
      picked.filter((p) => p.band === b),
      input.rng
    )
  );
  return { questions: byBand, thin };
}

/** A round's first answers, as far as scoring reads them. */
export type RoundAnswers = Record<string, { correct: boolean }>;

/**
 * Rule (P2–P3): a round is finished when every served question has its first answer; its score is
 * the number right; it passes at the pass mark. Unfinished rounds have no score.
 */
export function scoreRound(
  questionIds: string[],
  answers: RoundAnswers,
  passMark: number
): { finished: boolean; score: number | null; passed: boolean; answered: number } {
  const answered = questionIds.filter((id) => answers[id]).length;
  const finished = questionIds.length > 0 && answered === questionIds.length;
  const score = finished ? questionIds.filter((id) => answers[id].correct).length : null;
  return { finished, score, passed: score !== null && score >= passMark, answered };
}
