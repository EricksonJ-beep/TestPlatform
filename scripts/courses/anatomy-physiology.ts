/**
 * Anatomy and Physiology (Sept 2026): six units. Each unit keeps its placeholder
 * target (`U1` · "Unit 1") that the CVTC test-bank quizzes are tagged to, plus
 * one target per CVTC learning objective (Jon, Oct 13 2026), numbered per unit
 * (`U2.LT7` = objective 6.b). The objectives' practice packs
 * (content/packs/anatomy-u*-practice-bank) carry the same list, so the targets
 * exist after a deploy even if this seed is never re-run.
 */
import { readFileSync } from "node:fs";
import type { CourseDefinition } from "../seed-courses";

type PackTarget = { unit: string; code: string; title: string; description?: string };

const objectives = (n: number): PackTarget[] =>
  (
    JSON.parse(
      readFileSync(
        new URL(`../../content/packs/anatomy-u${n}-practice-bank/pack.json`, import.meta.url),
        "utf8"
      )
    ) as { targets: PackTarget[] }
  ).targets;

export const courses: CourseDefinition[] = [
  {
    name: "Anatomy and Physiology",
    description: "Six units; test banks from CVTC (Chippewa Valley Technical College).",
    units: [1, 2, 3, 4, 5, 6].map((n) => ({
      name: `Unit ${n}`,
      targets: [
        { code: `U${n}`, title: `Unit ${n}`, description: `Unit ${n} (topics to be added).` },
        ...objectives(n).map(({ code, title, description }) => ({ code, title, description })),
      ],
    })),
  },
];
