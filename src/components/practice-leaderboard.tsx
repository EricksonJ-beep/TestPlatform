import { Trophy } from "lucide-react";
import { cn } from "cn";
import type { RankedEntry, StudentLeaderboard } from "@/lib/leaderboard";

const count = (n: number) => `${n} ${n === 1 ? "question" : "questions"}`;

const PLACE = [
  "bg-[#F4C542] text-[#5A4500]",
  "bg-[#D5D9DE] text-[#3B4250]",
  "bg-[#E2A977] text-[#5A3210]",
];

function Place({ rank }: { rank: number | null }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular",
        rank && rank <= 3 ? PLACE[rank - 1] : "bg-muted text-muted-foreground"
      )}
    >
      {rank ?? "–"}
    </span>
  );
}

/**
 * The teacher's practice leaderboard for one class (Jon, Nov 20 2026): everyone, in order, with
 * the practice questions they got right. Students see only the top five and their own place.
 */
export function TeacherLeaderboard({ entries }: { entries: RankedEntry[] }) {
  const ranked = entries.filter((e) => e.rank !== null);
  const none = entries.length - ranked.length;
  return (
    <section
      className="rounded-lg border border-border bg-card"
      aria-label="Practice leaderboard"
      data-leaderboard
    >
      <h2 className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-medium">
        <Trophy className="size-4 text-brand-deep" aria-hidden />
        Practice leaderboard
        <span className="font-normal text-muted-foreground">
          · practice questions answered right, no peeking. Students see the top 5 and their own
          place.
        </span>
      </h2>
      {ranked.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Nobody in this class has practiced yet.
        </p>
      ) : (
        <ol className="grid gap-x-6 px-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map((e) => (
            <li
              key={e.studentId}
              className="flex items-center gap-2 py-1 text-sm"
              data-leaderboard-row={e.rank}
            >
              <Place rank={e.rank} />
              <span className="truncate">
                {e.firstName} {e.lastName}
              </span>
              <span className="ml-auto text-muted-foreground tabular">{e.questions}</span>
            </li>
          ))}
        </ol>
      )}
      {ranked.length > 0 && none > 0 ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {none} {none === 1 ? "student hasn't" : "students haven't"} practiced yet.
        </p>
      ) : null}
    </section>
  );
}

/** What a student sees for one of their classes: the top five and their own place. */
export function StudentLeaderboardCard({
  className,
  board,
}: {
  className: string;
  board: StudentLeaderboard;
}) {
  const onBoard = board.top.some((t) => t.isMe);
  return (
    <section
      className="rounded-lg border border-border bg-card"
      aria-label={`Practice leaderboard · ${className}`}
      data-leaderboard
    >
      <h2 className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm font-medium">
        <Trophy className="size-4 text-brand-deep" aria-hidden />
        Practice leaderboard
        <span className="font-normal text-muted-foreground">· {className}</span>
      </h2>
      <ol className="px-4 py-2">
        {board.top.map((t, i) => (
          <li
            key={i}
            className={cn(
              "flex items-center gap-2 rounded-md px-1 py-1 text-sm",
              t.isMe && "bg-brand-soft font-medium text-brand-deep"
            )}
            data-leaderboard-row={t.rank}
          >
            <Place rank={t.rank} />
            <span className="truncate">{t.isMe ? "You" : t.name}</span>
            <span className="ml-auto tabular">{count(t.questions)}</span>
          </li>
        ))}
      </ol>
      {onBoard ? null : (
        <p className="border-t border-border px-4 py-2 text-sm" data-leaderboard-me>
          {board.me.rank ? (
            <>
              You&apos;re in place <strong className="tabular">{board.me.rank}</strong> with{" "}
              {count(board.me.questions)}.
            </>
          ) : (
            <>You haven&apos;t answered a practice question yet.</>
          )}{" "}
          {board.toBoard > 0 ? (
            <span className="text-muted-foreground">{board.toBoard} more to make the top 5.</span>
          ) : (
            <span className="text-muted-foreground">One right answer puts you on the board.</span>
          )}
        </p>
      )}
    </section>
  );
}
