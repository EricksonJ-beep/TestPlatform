/**
 * "Build my practice" (Jon, Oct 13 2026: "students should be able to pick what
 * Unit and learning target they want to focus on… a custom individual practice
 * set… If they want Unit 2 learning target 2 questions only… If they want all
 * Unit 2 learning target questions they should have that option as well").
 * Pure rules: how many questions a student may ask for, and how a hand is
 * dealt across the targets they picked.
 */
import {
  dealByDifficulty,
  difficultyBand,
  drawFromPool,
  type PoolQuestion,
} from "@/lib/assessments/serve";

export type CustomDealQuestion = PoolQuestion & { difficulty: number };

/** The lengths a student can pick; the deal stops early when the targets run out. */
export const CUSTOM_PRACTICE_SIZES = [5, 10, 20, 30] as const;
export const DEFAULT_CUSTOM_PRACTICE_SIZE = 10;

export function clampPracticeSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CUSTOM_PRACTICE_SIZE;
  return Math.min(Math.max(Math.round(n), 1), Math.max(...CUSTOM_PRACTICE_SIZES));
}

/**
 * Deal `count` questions across the picked targets. Rule: every target gets an
 * even share (the remainder goes to targets chosen at random), a target that
 * runs short hands its leftover share to the others, within a target the draw
 * balances easy, medium, and hard like a practice set (dealByDifficulty) and
 * prefers questions the student hasn't seen (`avoid`), a question tagged to two
 * picked targets is dealt once, and the hand is served easy → medium → hard,
 * shuffled within each band so targets interleave.
 */
export function dealCustomPractice(
  byTarget: Map<string, CustomDealQuestion[]>,
  count: number,
  opts: { rng: () => number; avoid?: Set<string> }
): CustomDealQuestion[] {
  const targets = [...byTarget.keys()];
  if (count <= 0 || targets.length === 0) return [];
  const taken = new Set<string>();
  const out: CustomDealQuestion[] = [];
  const left = (t: string) => (byTarget.get(t) ?? []).filter((q) => !taken.has(q.questionId));

  // Even shares, remainder to random targets.
  const shares = new Map(targets.map((t) => [t, Math.floor(count / targets.length)]));
  for (const t of shuffle(targets, opts.rng).slice(0, count % targets.length))
    shares.set(t, shares.get(t)! + 1);

  // Deal shares; whatever a short target could not fill goes round again.
  let owed = 0;
  for (const t of targets) {
    const hand = dealByDifficulty(left(t), shares.get(t)!, {
      drawStimulusGroups: false,
      rng: opts.rng,
      avoid: opts.avoid,
    }) as CustomDealQuestion[];
    for (const q of hand) taken.add(q.questionId);
    out.push(...hand);
    owed += shares.get(t)! - hand.length;
  }
  while (owed > 0) {
    const open = shuffle(
      targets.filter((t) => left(t).length > 0),
      opts.rng
    );
    if (open.length === 0) break;
    for (const t of open) {
      if (owed === 0) break;
      const [q] = drawFromPool(left(t), 1, {
        drawStimulusGroups: false,
        rng: opts.rng,
        avoid: opts.avoid,
      }) as CustomDealQuestion[];
      if (!q) continue;
      taken.add(q.questionId);
      out.push(q);
      owed--;
    }
  }
  return (["easy", "medium", "hard"] as const).flatMap((band) =>
    shuffle(
      out.filter((q) => difficultyBand(q.difficulty) === band),
      opts.rng
    )
  );
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
