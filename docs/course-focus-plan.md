# Course focus: one course at a time

_Plan only (Jon, Oct 6 2026). Nothing here is built yet. Decided so far: the unit of focus is a **course** (Biology, Anatomy and Physiology, Physical Science A), not a class period._

## The idea in one line

Like Google Classroom: the Dashboard is the front porch where you see every course at once, and the moment you step into a course, every other room (banks, assessments, practice, assign, results, classes) shows only that course's materials until you step out and pick another.

## What exists today

- Every piece of content already knows its course. Ten tables carry a `course_id`: banks, assessments, practice sets, activities, worksheets, units, learning targets, stimuli, pools, and classes (a class's course is optional, so some periods may have none).
- Bloom already remembers a "current course" in a cookie, validated against ownership on every read (`getCurrentCourse` / `setCurrentCourse`). It pre-selects the course in New dialogs.
- The Banks and Assessments pages already show **one course at a time** with tabs across the top, saved through that same cookie.
- The Practice page, Assign, Results (and its grading and corrections queues), and Classes still show **everything** for every course on one page.
- The Dashboard is global.
- A top-bar course switcher existed in September and was removed (Sept 28) because at the time it filtered nothing. With the plan below it would filter every section, so it earns its place back.

## The plan

### 1. One switcher, at the top of the sidebar (recommended)

The teal sidebar gets a course block under the Bloom wordmark: the current course's name with a dropdown of your courses. Picking one sets the current course and the page you are on re-renders for it. It is the same switcher on every page, so you never hunt for it.

Why the sidebar and not tabs on each page: tabs are already on two pages and would need adding to five more, each slightly different. One switcher in one place is what makes the focus feel like "I am in Anatomy now", not "this page happens to be filtered".

The Banks and Assessments course tabs come out once the switcher is in, because they would be the same control twice.

### 2. Which sections narrow to the course

| Section | Today | With course focus |
| --- | --- | --- |
| Dashboard | Global | Stays global: the control panel. Adds one card per course (counts, what needs attention) that doubles as a way in: click Anatomy's card and you are focused on Anatomy. |
| Question banks | One course via tabs | Current course only; tabs removed. |
| Assessments | One course via tabs | Current course only; tabs removed. |
| Practice sets | All courses | Current course only, with its unit rows. |
| Assign | All assignments and all classes | Current course's assessments and the class periods that belong to it. Periods still show side by side. |
| Results | All assignments | Current course's assignments. The grading and corrections queues narrow too, with a count of items waiting in other courses so nothing is forgotten. |
| Classes | All periods | Current course's periods. |
| Shared | Global | Stays global: it is other teachers' material. "Copy to mine" lands in the current course by default. |
| Settings, Courses | Global | Unchanged. |

### 3. Things that have no course

Some banks, assessments, and class periods were made before courses existed or were never given one. They must not vanish.

- Each narrowed page shows a small "Not in any course · n" strip at the bottom, listing those items with a one-click "Put in {current course}".
- The Classes page nudges the same way for periods without a course.
- The switcher never offers "No course" as a choice; the strip is the only place those items appear.

### 4. Following you around

- Opening an item that belongs to another course (from a link, the dashboard, or search) switches focus to that course so the sidebar and the Back link agree with what you are looking at.
- The student side is untouched. Students already see only what is assigned to them.
- New dialogs (new bank, assessment, set, activity, class) already default to the current course; they keep doing so and stop asking for a course when one is in focus.

### 5. Later, not now

- **Course in the address bar** (`/app/anatomy/banks`): lets two browser tabs sit on two courses and makes links shareable between your two teacher accounts. The cookie approach is simpler and already exists, so start there; moving to URLs is a mechanical change once the pages are course-scoped.
- **Per-course dashboard** inside a course, if the global one gets crowded.

## Tickets

Each is one sitting, with a "Done when", in build order.

1. **Sidebar switcher.** Course block in the sidebar, dropdown of your courses, sets the current course. Done when switching re-renders the page you are on and the choice survives a reload.
2. **Practice page narrows.** Done when Practice shows only the current course's unit rows and Needs-attention items, and the course heading goes away.
3. **Banks and Assessments drop their tabs.** Done when both pages use the sidebar switcher and the shelves, drag-and-drop, and empty-unit chips still work.
4. **Assign and Classes narrow.** Done when Assign lists the current course's assessments and periods and Classes lists its periods, with the "Not in any course" strip on both.
5. **Results narrows.** Done when Results, grading, and corrections show the current course with an "n waiting in other courses" line.
6. **Dashboard course cards.** Done when each course has a card with counts and attention items, and clicking one focuses that course and opens its practice page.
7. **Focus follows links.** Done when opening a bank, assessment, set, activity, assignment, or class from another course switches the sidebar to that course.
8. **Not-in-any-course strip.** Done when every narrowed list shows its orphaned items and "Put in {course}" moves them.

Order matters a little: 1 first, then 2 and 3 are quick wins you can feel the same day, then 4 through 8.

## Open questions for Jon

- Should the Dashboard open on the last course you were in, or always on the all-courses view? (Plan assumes all courses.)
- When you switch courses on a detail page (say, inside one bank), should Bloom stay on that bank or jump to the new course's banks list? (Plan assumes jump to the same section's list for the new course.)
