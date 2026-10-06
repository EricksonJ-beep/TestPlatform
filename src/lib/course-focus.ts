/**
 * Course focus (Jon, Oct 6 2026, docs/course-focus-plan.md): one course at a
 * time. When the teacher switches courses from inside an item, Bloom lands on
 * the same section's list for the new course so the sidebar and the page agree.
 * Pure.
 */

/** Sections whose pages narrow to the current course and have a list page to land on. */
const SCOPED_SECTIONS = new Set([
  "banks",
  "assessments",
  "practice",
  "assign",
  "results",
  "classes",
]);

/**
 * Where to go after switching courses from `pathname`. Inside a scoped section
 * (a bank, an assessment, a student's results) → that section's list; the
 * worksheets list keeps its own page. Dashboard, Shared, Settings, Courses and
 * anything else stay put.
 */
export function sectionListPath(pathname: string): string {
  const [, app, section, sub] = pathname.split("/");
  if (app !== "app" || !section || !SCOPED_SECTIONS.has(section)) return pathname;
  if (section === "practice" && sub === "worksheets") return "/app/practice/worksheets";
  return `/app/${section}`;
}

/** Two-letter chip for the collapsed sidebar: "Anatomy and Physiology" → "AP", "Biology" → "Bi". */
export function courseInitials(name: string): string {
  const words = name.split(/[\s·,-]+/).filter((w) => w && !/^(and|the|of|a|an|&)$/i.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}
