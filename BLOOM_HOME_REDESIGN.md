# Bloom home pages redesign: implementation spec

You are restyling and restructuring two existing pages in Bloom: the teacher
home (the page titled "Dashboard" in the sidebar) and the student home
("Hi, <name>"). This is a presentation-layer change. Do not change the
database schema, queries' meaning, auth, grading rules, retake rules, or any
route URLs.

## 0. Before you write code

1. Find the teacher home page, the student home page, the shared layout/sidebar,
   and the Tailwind/theme setup. List the files you will touch and the data each
   page already loads.
2. Map every data field named in this spec to what the code already has. If a
   field does not exist (see "Data the UI needs"), say so and propose the
   smallest query or derived value that provides it. Do not invent data and do
   not hard-code sample values.
3. Post a short plan (files, new components, any new derived data) and then
   build on a branch `redesign/home-pages`. Open a PR with a Vercel preview.

Work in this order so each step is reviewable: tokens and fonts, shared shell,
teacher live mode, teacher quiet mode, gradebook, student home.

## 1. Design tokens

Add these as theme tokens in whatever form this repo's Tailwind version uses
(`theme.extend.colors` or `@theme`). Use the token names, not raw hexes, in
components. Remove the teal and coral from these two pages and the shared
shell. Other pages may keep working with old colors until they are migrated;
do not restyle them in this PR beyond what the shared shell forces.

| Token | Hex | Use |
| --- | --- | --- |
| `slide` | `#F5F4FA` | Page background |
| `surface` | `#FFFFFF` | Cards, sidebar, top bar |
| `line` | `#E4E1F2` | Card and sidebar borders |
| `line-soft` | `#EFEDF7` | Row dividers, bar tracks |
| `line-strong` | `#CFCAE6` | Outline buttons, inputs |
| `ink` | `#1A1538` | Body text, dark panel background, dark buttons |
| `ink-raised` | `#272050` | Tiles and rows inside the dark panel |
| `ink-muted` | `#5A547A` | Secondary text on light |
| `ink-soft` | `#4D4770` | Inactive segmented-control text |
| `on-ink-muted` | `#CFC9EE` | Secondary text on the dark panel |
| `stain` | `#4A35C8` | Primary violet: primary buttons, live cells, bars |
| `stain-deep` | `#3A28A8` | Violet text on violet tint |
| `stain-tint` | `#E6E1FF` | Violet tint: paused cells, chips, avatar |
| `stain-wash` | `#EFECFB` | Active course row in the sidebar |
| `stain-light` | `#B4A7FF` | Violet on dark: ring fill, answered dots, labels |
| `stain-pale` | `#A99BF2` | Bars under 70 |
| `eosin` | `#FF7AA8` | Pink on dark: live dot, primary action in the dark panel (text on it is `ink`) |
| `eosin-pale` | `#FFB3CD` | Pink label text on dark |
| `eosin-deep` | `#D6336C` | Focus ring, missing-cell dashed border |
| `eosin-text` | `#A61E4D` | "Missing" text, missing chip text |
| `eosin-tint` | `#FFE3EC` | Missing chip background |
| `owed` | `#FFECC7` | Student-owes cell and chip background |
| `owed-text` | `#6B4100` | Text on `owed` |
| `owed-bar` | `#C97A00` | Corrections progress bar |
| `done` | `#0F7B55` | "Nothing is waiting" check icon |
| `segment` | `#E9E6F5` | Segmented-control track, neutral chips |

Radii: 28px for the dark panel, 24px for large cards, 20px for student cards,
14 to 16px for tiles and inner rows, 10 to 12px for buttons, 9px for gradebook
cells, 999px for chips and segmented tracks.

No drop shadows. Depth comes from the dark panel against the pale page and
1px `line` borders on white cards.

### Type

Load with `next/font/google`:

- `Bricolage_Grotesque` (weights 500, 600, 700): headings, the wordmark, and
  large numerals. Tight tracking: `-0.02em` to `-0.03em` on sizes 34px and up.
- `Hanken_Grotesk` (400, 500, 600, 700): everything else.

Scale: page h1 34px (teacher) / 40px (student); dark-panel title 44px
(teacher) / 52px (student), line-height 1.02 to 1.05; card titles 24 to 26px;
body 15px (teacher) / 16px (student); table text 14px; captions 13px. Use
`tabular-nums` anywhere scores or counts line up.

Sentence case everywhere. No all-caps labels (the current "COURSES",
"DUE TODAY", "1 · NOW", "FORMATIVE" become "Courses", "Due today", etc.).

### Dark panel (the one signature element)

Exactly one per page. Background `ink` with a dot grid over it:

```css
background-color: #1A1538;
background-image: radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px);
background-size: 22px 22px;
```

Padding 32px (teacher) / 36px (student), radius 28px, white text.

### Motion

One animation only: a pulsing ring on the "live" dot (teacher) and on the
current-question dot (student).

```css
@keyframes bloomPulse {
  0%   { box-shadow: 0 0 0 0 rgba(255,122,168,.7); }
  100% { box-shadow: 0 0 0 12px rgba(255,122,168,0); }
}
/* animation: bloomPulse 1.6s ease-out infinite; */
```

Disable it under `prefers-reduced-motion: reduce`. No entrance animations, no
hover lifts.

### Accessibility floor

- Every control is a real `<button>`, `<a href>`, or labelled `<input>`.
- Buttons and nav links are at least 44px tall (segmented-control segments 36px
  inside a 44px track).
- Visible focus: `outline: 3px solid #D6336C; outline-offset: 2px`.
- Segmented controls use `aria-pressed`; the current nav link uses
  `aria-current="page"`.
- State is never carried by color alone: live cells show `n/total`, paused
  cells say "Paused", missing cells say "Missing".

## 2. Shared shell

### Teacher sidebar

White (`surface`) with a right border, about 220px wide, replacing the teal
sidebar. It stacks above the content on narrow screens (flex-wrap; it is not
sticky and not `100vh`).

- Wordmark: a 28px mark (violet disc, white ring, pink center dot) followed by
  "Bloom" in Bricolage 700, 24px.
  ```html
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="13" fill="#4A35C8"/>
    <circle cx="14" cy="14" r="7.5" fill="none" stroke="#fff" stroke-width="2"/>
    <circle cx="14" cy="14" r="2.8" fill="#FF7AA8"/>
  </svg>
  ```
- "Courses" list: each course is a 40px row with a 10px colored dot (keep each
  course's existing color) and its name, truncated with an ellipsis. The
  active course is weight 700 on `stain-wash`. Keep "Manage courses".
- Nav: same destinations as today, in the same order. "Dashboard" is renamed
  "Home". The current item is white text on `ink`; others are plain `ink` text.
  Rows are 40px, radius 10px.
- Keep the school name and the collapse control that exist today.

### Student top bar

White bar with a bottom border; content max-width 1120px. Wordmark at left,
then Home / Assessments / Practice / My results as 44px links (current one is
white on `ink`, radius 10px). Account button at right: pill with a 32px
initials circle (`stain-tint` background, `stain-deep` text) and the name.

Keep the existing "Viewing as <student>" read-only banner above it unchanged
in behavior; restyle to `owed` background with `owed-text`.

## 3. Teacher home

Content area: padding 32px 40px 56px, vertical gap 24px between blocks.

### 3.1 Header row (both modes)

Left: `h1` greeting ("Good morning/afternoon/evening, <first name>"). Compute
the greeting from the teacher's local time: before 12:00 morning, 12:00 to
16:59 afternoon, after that evening. The current page shows "Good afternoon"
at 10:49 AM; fix that.

Under it: the course name in weight 600, then a segmented control for the
class periods (labels like "1st hour", "3rd hour", "4th hour" instead of
P1/P3/P4). Track is `segment`, selected segment is white.

Right: the resume code card (white, 1px `line`, radius 16px): caption
"Resume code, good until <time>", the code in Bricolage 700 24px with
`letter-spacing: 0.12em`, then "Show big" (violet primary) and "New code"
(outline). Same behavior as today.

### 3.2 Choosing the mode

For the selected course and period:

- **Live mode** when at least one student currently has an attempt in
  progress or paused.
- **Quiet mode** otherwise.

Derive this from the same data that drives today's "Testing N" / "Paused N"
block. Switch modes without a full reload using whatever refresh mechanism the
current "Live" indicator already uses (polling or revalidation); do not add a
new realtime dependency.

### 3.3 Live mode

**Dark panel, "Live test":**

- Top row, wraps: on the left a pink label with the pulsing dot ("Live now in
  3rd hour"), the assessment title as the 44px heading, and one line:
  "Closes at <time>. <time left> left for most of the room." On the right,
  three figures in Bricolage 600 34px with a 14px label under each:
  `<n> testing`, `<n> paused` (number in `eosin-pale`), `<n> of <n> turned in`.
- If students are testing on more than one assessment, the heading is the
  assessment with the most students in progress; students on a different
  assessment are still shown in the grid with that assessment's short name in
  their tile's second line.

**Student ring grid** (replaces the "Braeden A 4/25 · 1 h 43 min left" text
wall):

- `display: grid; grid-template-columns: repeat(auto-fit, minmax(min(156px, 100%), 1fr)); gap: 10px`.
- One tile per student with an attempt in progress, sorted by fraction
  answered, highest first.
- Tile: `ink-raised`, radius 14px, padding 10px 12px, a 46px ring then two
  lines of text (name as "First L" in weight 600; second line 13px
  `on-ink-muted`).
- Ring: a conic gradient with a 36px inner disc showing the answered count.
  ```
  background: conic-gradient(#B4A7FF <answered/total*360>deg, rgba(255,255,255,0.16) 0deg);
  ```
  The inner disc is `ink-raised` with the number in Bricolage 600 15px.
- Second line: "of <total> answered". Only when a student's time left differs
  from the room's (or they are on a different assessment), replace it with
  that detail, e.g. "of 25, 2 h 34 min left" or "Unit 3 Test, 21 h left".
- The ring is decorative (`aria-hidden`); the tile's text carries the meaning.

**Paused row**, under the grid with a top border `rgba(255,255,255,0.16)`:
label "Paused, waiting on you" in `eosin-pale`, then one chip per paused
attempt: student name, "<assessment>, <answered> of <total>", and a 44px
`eosin` button with `ink` text labelled "Let them continue" wired to the
existing action. Hide the whole row when nothing is paused.

**Status strip** (white card under the panel): on the left the existing
"Needs you" content. When empty: green check icon and "Nothing is waiting on
you. Retake requests, corrections and grading land here." When not empty,
show the count and a "Review" link that scrolls to or opens the queue. On the
right, three chips from the existing counts: "<n> testing now" (`stain-tint`),
"<n> corrections owed" (`owed`), "<n> missing" (`eosin-tint`). These chips
filter the gradebook the same way today's "Testing now / Corrections /
Missing" counters do, if those are clickable today.

**Gradebook card:** see section 4.

### 3.4 Quiet mode

A wrapping two-column row, then one full-width card.

**Left (wide): dark panel, "Needs you".** Pink label "Nobody is testing right
now". Heading is the count in words for 1 to 9 ("Three things need you"),
digits above that. Under it, one row per queue item (`ink-raised`, radius
16px): a 13px `stain-light` kind label ("Retake request", "Corrections turned
in", "To grade"), the student name at 17px weight 600, and a detail line
(assessment title, plus score where relevant). Actions at right: primary
`eosin` button ("Approve", "Review", "Grade") and, for retake requests, an
outline button "Not yet". Wire to the existing approve/decline/review actions;
keep each action's name consistent in any toast ("Approved", "Declined").

Empty queue: heading "You're all caught up" and one line, "Retake requests,
corrections and grading land here." No illustration.

**Right (narrow, min 300px), stacked:**

1. "Up next" card, solid `stain` with white text: label "Up next, <period>",
   the next assessment that is open or scheduled for this class, one line
   "Closes today at <time>. <n> of <n> turned in.", and a white button "Open
   live view". If nothing is open or scheduled, omit this card.
2. "Most to do" card (white): the three students with the highest owes count,
   each with an `owed` count pill, then one summary line for the next tier
   ("Five more students owe 4 each."). Each name links to that student's row
   or detail view. Omit the card if nobody owes anything.

**Full width: "Where <period> stands" card.** Header has the title, the
"corrections owed" and "missing" chips, and a dark "Open gradebook" button
that expands the full gradebook (section 4) in place. Body is a grid of unit
groups (`repeat(auto-fit, minmax(min(300px, 100%), 1fr))`, gap 28px). Each
group has the unit name in weight 700 and one row per assessment: a 64px
label ("Test", "Quiz 2"), a 12px bar on a `line-soft` track, and the class
average in Bricolage 600 16px. Bars are `stain`; under 70 they are
`stain-pale`. Caption under the grid: "Class averages. Lighter bars are below
70." Use the same averages the gradebook's class row shows today.

## 4. Gradebook

Same data, columns and click targets as today's grid (hovering or clicking a
cell still opens the details it opens now). What changes is how it is drawn.

**Toolbar:** title "Gradebook" (Bricolage 600 24px); a "Find" input; a
two-segment "Sort" control (Name / Most to do); "Hide scores" as an outline
button. Keep "Owes something" and "Detailed" if they do something today:
add them as a toggle chip and a third control in the same style.

**Layout:** a CSS grid inside an `overflow-x: auto` wrapper with
`min-width: 800px`:
`grid-template-columns: minmax(200px, 1.7fr) repeat(<assessment count>, minmax(64px, 1fr)); column-gap: 6px`.
If you keep a real `<table>` for semantics, match these proportions.

- **Unit header row:** each unit name spans its assessments with a 3px
  bottom border. The newest unit's border is `stain`, the next `#8B7BEA`,
  older ones `#C9C1F5`.
- **Column labels:** "Quiz", "Quiz 2", "Test" (13px, `ink-muted`; tests in
  weight 700 `ink`). Keep the existing full title on hover.
- **Rows:** 1px `line-soft` top border, 3px vertical padding. The name cell
  shows "Last, First" in weight 500 and, right-aligned, the owes count as a
  24px `owed` pill (hidden when zero).
- **Cells:** 34px tall, radius 9px, centered, one of:

| State | Shows | Style |
| --- | --- | --- |
| Done | score | plain `ink`, weight 400, no fill |
| Student owes | score | `owed` fill, `owed-text`, weight 700 |
| Testing now | `answered/total` | `stain` fill, white, weight 700 |
| Paused | "Paused" | `stain-tint` fill, `stain-deep`, 12px weight 600 |
| Missing | "Missing" | no fill, `1.5px dashed` `eosin-deep` border, `eosin-text`, 12px weight 600 |
| Your move | score | `eosin` fill, `ink` text, weight 700 |
| Your OK (optional) | score | no fill, `1.5px solid` `eosin` border, `ink` text |
| Not started | en dash | `ink-muted`, no fill |

  "Quiet" and "Done" in today's legend both render as the plain Done style.
  "Open now" keeps a small 6px `stain` dot under the column label, as today.
  The flag marker some cells carry today stays, as a 6px `ink-muted` dot in
  the cell's top-left corner with the same tooltip.

- **Class average row:** 2px `ink` top border; label "Class average"; each
  column shows the average in Bricolage 600 18px with "<n> of <n>" turned in
  beneath at 12px. Keep the "Tiers" indicators where they exist, as 12px text
  on a third line.
- **Legend** under the grid, 13px: swatches for Testing now, Paused, Student
  owes corrections, Missing, Your move, Your OK (optional), then the sentence
  "Plain numbers are done."

"Hide scores" keeps cell fills and replaces numbers with a dot, as it does
today.

## 5. Student home

Page background `slide`. Content max-width 1120px, padding 36px 32px 64px,
vertical gap 28px.

The current three equal columns (Now / Fix it / Level up) become one large
"do this now" panel and two sections under it. The three-step order is
unchanged.

### 5.1 Header row

`h1` in Bricolage 600 40px:

- Something to start or continue: "Hi, <first name>. One thing first."
- Nothing to start but corrections or retakes exist: "Hi, <first name>.
  Nothing due right now."
- Nothing at all: "Hi, <first name>. You're all caught up."

Right: a neutral chip with the class ("Biology, 3rd hour, Erickson"; one chip
per class if several) and an outline pill button "Join a class".

Drop the "1 to start / 2 to fix / 4 to level up" chips; the sections below
carry those counts.

### 5.2 Dark panel, "Do this now"

Shows the single most urgent assignment: in-progress attempts first, then by
soonest close time. If there are more assignments to start, list the rest as
compact rows (`ink-raised`, same style as the teacher queue rows) under the
main content of the panel, each with a "Start" or "Continue" button.

- Meta row: an `eosin` pill with `ink` text for urgency ("Due today", "Due
  tomorrow", or the date), then "Closes at <time>" in `on-ink-muted`, then an
  outlined pill with "Formative" or "Summative".
- Title: Bricolage 600 52px, line-height 1.02 (clamp down to about 34px on
  phones).
- One line of status. In progress: "You started this. Pick up at question
  <n>." where `<n>` is the first unanswered question's position, not
  answered-count + 1. If that position is not available, use "You started
  this. Pick up where you left off." Not started: "<total> questions."
- **Question dots:** one 15px circle per question in a wrapping flex row
  (gap 7px, max-width 560px). Answered `stain-light`; the next unanswered one
  `eosin` with the pulse; the rest `rgba(255,255,255,0.18)`. Color each dot by
  that question's real answered state, so skipped questions show as gaps.
  Wrap the row in an element with `role="img"` and
  `aria-label="<answered> of <total> questions answered"`. For assessments
  over 60 questions, use a single 12px progress bar instead.
- Right side: the answered count in Bricolage 600 64px with "of <total>
  answered" beside it, and a 60px-tall `eosin` button with `ink` text, 19px
  weight 700: "Continue the quiz" / "Continue the test" / "Start the quiz" /
  "Start the test".

When nothing is assigned, the panel shrinks to a single line: "Nothing to
start. Your next quiz will show up here."

### 5.3 "Then fix these" (corrections)

Section heading in Bricolage 600 26px with a count at right ("2 sets of
corrections"). One white card per assessment (radius 20px, padding 20px):
title in weight 700 18px with a Formative/Summative chip; the existing
sentence ("Correct 8 missed questions before you can ask to retake."); a 10px
progress bar in `owed-bar` on `line-soft` with the existing status text beside
it ("2 of 8 started, not turned in yet"); and a full-width 48px `ink` button,
"Do corrections" or "Continue corrections".

If there is nothing in the dark panel, the heading reads "Fix these".
Hide the section when empty.

### 5.4 "Want a higher score?" (retakes)

Heading with a count ("4 you can retake"). One white card holding a list; each
row has the assessment title in weight 700, a 14px `ink-muted` note, and a
44px button:

- Closed and eligible: note "Summative, closed" or "Formative, closed";
  outline button "Ask to retake".
- Practice required first: note is the existing requirement in one sentence
  ("You scored 50%. Get 80% on at least 5 practice questions to unlock a
  retake."); violet primary button "Practice".
- Already asked: note "Asked <when>. Waiting on your teacher."; no button.

One caption under the card instead of repeating it on every row: "If your
teacher says yes, the test opens just for you until the end of the next
school day."

Sections 5.3 and 5.4 sit side by side
(`repeat(auto-fit, minmax(min(420px, 100%), 1fr))`, gap 28px) and stack on
narrow screens. Hide 5.4 when empty.

## 6. Data the UI needs

Confirm each exists before building; report any that do not.

| Needed | For |
| --- | --- |
| Per in-progress attempt: student, assessment, answered count, total, time left | Ring grid |
| Per paused attempt: student, assessment, answered, total | Paused row |
| Turned-in count and roster size for the live assessment | "n of n turned in" |
| Queue items with kind, student, assessment, score | Quiet-mode panel |
| Next open or scheduled assessment for the class | "Up next" |
| Owes count per student | Pills, "Most to do" |
| Class average and turned-in count per assessment | Average row, quiet-mode bars |
| Per-question answered state for the student's active attempt | Question dots, "Pick up at question n" |

## 7. Out of scope

- No schema changes and no changes to grading, retake, or correction rules.
- No dark mode.
- No changes to the test-taking screen, question banks, or other pages beyond
  what the shared shell changes.
- No new dependencies other than the two fonts.

## 8. Done when

- Teacher home shows live mode whenever a student in the selected class is
  testing or paused, and quiet mode otherwise, without a manual refresh.
- Every action available on the old teacher home is still reachable: Show
  big, New code, period switch, Let them continue, find, sort, hide scores,
  owes-something filter, detailed view, cell hover details.
- Every state in the old gradebook legend has a distinct rendering.
- Every action on the old student home is still reachable: continue or start,
  do or continue corrections, ask to retake, practice, join a class.
- "Viewing as <student>" still renders the student home read-only.
- Both pages work at 390px wide: the sidebar stacks, panels wrap, the
  gradebook scrolls sideways inside its card, nothing overflows the page.
- Keyboard: every control is reachable by Tab with a visible focus ring.
- Text contrast is at least 4.5:1 (3:1 at 24px and up).
- The pulse animation stops under reduced motion.
- No teal or coral remains on the two pages or the shared shell.
- `lint`, type-check and existing tests pass.
