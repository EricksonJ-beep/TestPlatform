/**
 * Practice leaderboard (Jon, Nov 20 2026: "a leaderboard that shows who has completed the most
 * practice questions"; asked and answered "Students see top 5 + own rank"). Pure.
 *
 * - A question counts when the student got it right in practice without asking to see the
 *   answer: practice sets, Build my practice and practice checks on the class's course. Doing a
 *   set again counts again; practice is the point.
 * - The teacher sees the whole class, in order. A student sees the top five by first name and
 *   last initial, and their own place. Nobody at zero is ranked or shown to classmates.
 * - Ties share a place ("1, 2, 2, 4").
 */

export type LeaderboardEntry = {
  studentId: string;
  firstName: string;
  lastName: string;
  questions: number;
};

export type RankedEntry = LeaderboardEntry & {
  /** 1-based place, shared by ties; null when the student has no questions yet. */
  rank: number | null;
};

/** The whole class in order: most questions first, ties by name; zeros last and unranked. */
export function rankLeaderboard(entries: LeaderboardEntry[]): RankedEntry[] {
  const sorted = [...entries].sort(
    (a, b) =>
      b.questions - a.questions ||
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName)
  );
  let rank = 0;
  return sorted.map((e, i) => {
    if (e.questions <= 0) return { ...e, rank: null };
    if (i === 0 || sorted[i - 1].questions !== e.questions) rank = i + 1;
    return { ...e, rank };
  });
}

export const LEADERBOARD_TOP = 5;

export type StudentLeaderboard = {
  /** The first five ranked students, as classmates may see them. */
  top: { rank: number; name: string; questions: number; isMe: boolean }[];
  /** The viewer's own place and count; rank null until their first question. */
  me: { rank: number | null; questions: number };
  /** How many more questions put the viewer on the board (0 when on it or the board has room). */
  toBoard: number;
};

/** "Maya R." */
export function classmateName(e: { firstName: string; lastName: string }): string {
  const initial = e.lastName.trim().charAt(0).toUpperCase();
  return initial ? `${e.firstName} ${initial}.` : e.firstName;
}

/** What one student sees; null when nobody in the class has a question yet. */
export function studentLeaderboard(
  entries: LeaderboardEntry[],
  viewerId: string
): StudentLeaderboard | null {
  const ranked = rankLeaderboard(entries).filter((e) => e.rank !== null);
  if (ranked.length === 0) return null;
  const shown = ranked.slice(0, LEADERBOARD_TOP);
  const mine = ranked.find((e) => e.studentId === viewerId);
  const onBoard = shown.some((e) => e.studentId === viewerId);
  const last = shown[shown.length - 1];
  return {
    top: shown.map((e) => ({
      rank: e.rank!,
      name: classmateName(e),
      questions: e.questions,
      isMe: e.studentId === viewerId,
    })),
    me: { rank: mine?.rank ?? null, questions: mine?.questions ?? 0 },
    toBoard:
      onBoard || shown.length < LEADERBOARD_TOP ? 0 : last.questions - (mine?.questions ?? 0) + 1,
  };
}
