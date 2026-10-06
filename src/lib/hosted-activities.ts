/**
 * Interactive pages Bloom hosts itself under public/activities/ (Jon, Oct 2 2026).
 * Add a line here when a new page is dropped into that folder so it shows up in
 * the activity editor's dropdown; the file is served as-is at that path. To
 * create and publish the activity itself on deploy, add a content pack with an
 * `activity` block (see src/lib/content-packs.ts).
 *
 * `height` is the iframe height on the student page, in CSS pixels, so a page
 * is shown whole without a scrollbar inside the frame. A landscape diagram fits
 * the default; a square one (the osteon) runs taller.
 */
export const DEFAULT_ACTIVITY_FRAME_HEIGHT = 1300;

export const HOSTED_ACTIVITY_PAGES: { path: string; title: string; height?: number }[] = [
  { path: "/activities/skin-model-labeling.html", title: "Skin model: label the structures" },
  {
    path: "/activities/osteon-labeling.html",
    title: "Osteon (Haversian system): label the structures",
    height: 1750,
  },
];

/** Iframe height for an activity url: the hosted page's own, else the default. */
export function activityFrameHeight(url: string): number {
  return HOSTED_ACTIVITY_PAGES.find((p) => p.path === url)?.height ?? DEFAULT_ACTIVITY_FRAME_HEIGHT;
}
