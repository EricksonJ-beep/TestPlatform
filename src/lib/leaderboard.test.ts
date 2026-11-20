import { describe, expect, it } from "vitest";
import { classmateName, rankLeaderboard, studentLeaderboard } from "@/lib/leaderboard";

const e = (studentId: string, lastName: string, questions: number) => ({
  studentId,
  firstName: studentId.toUpperCase(),
  lastName,
  questions,
});
const cls = [
  e("a", "Ash", 40),
  e("b", "Birch", 55),
  e("c", "Cedar", 40),
  e("d", "Dogwood", 12),
  e("f", "Fir", 9),
  e("g", "Gum", 3),
  e("h", "Holly", 0),
];

describe("practice leaderboard", () => {
  it("ranks by questions, ties share a place, zeros are last and unranked", () => {
    expect(rankLeaderboard(cls).map((r) => [r.studentId, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 2],
      ["d", 4],
      ["f", 5],
      ["g", 6],
      ["h", null],
    ]);
  });
  it("a student sees the top five by first name and last initial, and their own place", () => {
    const g = studentLeaderboard(cls, "g")!;
    expect(g.top.map((t) => t.name)).toEqual(["B B.", "A A.", "C C.", "D D.", "F F."]);
    expect(g.top.some((t) => t.isMe)).toBe(false);
    expect(g.me).toEqual({ rank: 6, questions: 3 });
    expect(g.toBoard).toBe(7); // 9 is fifth; 10 passes it
    const a = studentLeaderboard(cls, "a")!;
    expect(a.top.find((t) => t.isMe)).toMatchObject({ rank: 2, questions: 40 });
    expect(a.toBoard).toBe(0);
    expect(studentLeaderboard(cls, "h")!.me).toEqual({ rank: null, questions: 0 });
  });
  it("shows nothing until someone has a question, and never lists a zero", () => {
    expect(studentLeaderboard([e("a", "Ash", 0)], "a")).toBeNull();
    const small = studentLeaderboard([e("a", "Ash", 2), e("b", "Birch", 0)], "b")!;
    expect(small.top).toHaveLength(1);
    expect(small.toBoard).toBe(0); // the board has room: one question puts them on it
  });
  it("names a classmate without the full last name", () => {
    expect(classmateName({ firstName: "Maya", lastName: "Rivera" })).toBe("Maya R.");
    expect(classmateName({ firstName: "Maya", lastName: "" })).toBe("Maya");
  });
});
