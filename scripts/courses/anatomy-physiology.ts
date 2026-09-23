/**
 * Anatomy and Physiology (Sept 2026): six units, quizzes and tests identified by
 * unit number for now. Each unit gets one placeholder target (`U1` · "Unit 1") so
 * questions from the CVTC test banks can be tagged by unit and scored per unit;
 * Jon will add real descriptions and topics later.
 */
import type { CourseDefinition } from "../seed-courses";

export const courses: CourseDefinition[] = [
  {
    name: "Anatomy and Physiology",
    description: "Six units; test banks from CVTC (Chippewa Valley Technical College).",
    units: [1, 2, 3, 4, 5, 6].map((n) => ({
      name: `Unit ${n}`,
      targets: [
        { code: `U${n}`, title: `Unit ${n}`, description: `Unit ${n} (topics to be added).` },
      ],
    })),
  },
];
