/**
 * Master code (Jon, Nov 20 2026: "a master code for the day so when I have people taking
 * multiple assessments I don't have to… look up the access code for each individual
 * assessment… it would allow me to override any of the other ones"; good "until 330 pm that
 * day"). Pure rule: when a master code issued at `now` stops working.
 *
 * One code per teacher. While it runs it stands in for the access code of any of that
 * teacher's assignments and for the resume code. It opens nothing else: the window, the
 * roster, attempt limits, waits and retake unlocks all still apply.
 */
import { schoolDate, schoolOffset } from "@/lib/reopen";

/** The school day's end on the school's clock (America/Chicago): 3:30 PM. */
export const MASTER_CODE_END = { hour: 15, minute: 30 };

/**
 * 3:30 PM school time on the day `now` falls on there; issued at or after 3:30 PM, 3:30 PM the
 * next calendar day (a code made the evening before is ready for the morning).
 */
export function masterCodeEnd(now: Date): Date {
  const today = schoolDate(now);
  const endOn = (addDays: number) => {
    const wall = Date.UTC(
      today.y,
      today.m - 1,
      today.d + addDays,
      MASTER_CODE_END.hour,
      MASTER_CODE_END.minute
    );
    // The offset at that wall time; read twice so a guess on the wrong side of a change settles.
    const guess = wall - schoolOffset(new Date(wall));
    return new Date(wall - schoolOffset(new Date(guess)));
  };
  const end = endOn(0);
  return end.getTime() > now.getTime() ? end : endOn(1);
}

/**
 * Words for a master code (Jon, Nov 20 2026: "something easy like coffee123 or tree365,
 * frog21"): short, common, one obvious spelling, fine on a classroom board.
 */
export const MASTER_CODE_WORDS = [
  "apple",
  "bacon",
  "banana",
  "beach",
  "bear",
  "bike",
  "bird",
  "boat",
  "book",
  "bread",
  "bridge",
  "bubble",
  "butter",
  "cabin",
  "cactus",
  "camp",
  "candle",
  "candy",
  "castle",
  "cheese",
  "cherry",
  "cloud",
  "coffee",
  "cookie",
  "corn",
  "cricket",
  "dragon",
  "drum",
  "duck",
  "eagle",
  "farm",
  "feather",
  "fish",
  "flag",
  "forest",
  "fox",
  "frog",
  "garden",
  "grape",
  "hammer",
  "honey",
  "horse",
  "island",
  "jacket",
  "kite",
  "ladder",
  "lake",
  "lemon",
  "lion",
  "maple",
  "moon",
  "mountain",
  "muffin",
  "ocean",
  "orange",
  "otter",
  "panda",
  "pencil",
  "pepper",
  "piano",
  "pickle",
  "pizza",
  "planet",
  "pond",
  "pumpkin",
  "rabbit",
  "rain",
  "river",
  "robot",
  "rocket",
  "sandwich",
  "shark",
  "snow",
  "spider",
  "star",
  "storm",
  "sunset",
  "taco",
  "tiger",
  "toast",
  "tractor",
  "train",
  "tree",
  "turtle",
  "waffle",
  "whale",
  "window",
  "winter",
  "wolf",
  "zebra",
] as const;

/**
 * A word and a number from 10 to 999, such as `frog21` or `coffee123`. Students may type it in
 * any case (`codesMatch`). Easier to guess than a test's six random characters, which the
 * ten-misses-then-wait throttle on both code boxes covers.
 */
export function generateMasterCode(random: () => number = Math.random): string {
  const word = MASTER_CODE_WORDS[Math.floor(random() * MASTER_CODE_WORDS.length)];
  return `${word}${10 + Math.floor(random() * 990)}`;
}
