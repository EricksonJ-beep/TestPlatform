/**
 * The teacher's Read · Watch · Do editor (Jon, Nov 5 2026: "Edit relearning in app"; relearning
 * revamp "Activity builder", R4's "Left for later"). Pure, so the editor page, its preview and the
 * server action share it: a YouTube link → its 11-character id, m:ss ↔ seconds, the editor's form
 * ↔ a pack's `PackRelearning`, and the checks the server repeats on whatever the browser sends
 * before anything is written (with `relearningIssues`, the pack applier's own checks).
 */
import type { QuickCheck, RelearningSectionBody } from "@/db/schema";
import { relearningIssues, type PackRelearning } from "@/lib/relearning-pack";
import type { RelearningMode } from "@/lib/relearning";

// ---------------------------------------------------------------------------
// YouTube links and m:ss
// ---------------------------------------------------------------------------

const YOUTUBE_ID = /^[\w-]{11}$/;

/**
 * The 11-character video id in what the teacher pasted: a bare id, or a youtube.com / youtu.be
 * link (watch?v=, youtu.be/, /embed/, /shorts/, /live/, /v/, youtube-nocookie.com). Null when
 * there isn't one.
 */
export function youtubeIdFrom(input: string): string | null {
  const s = input.trim();
  if (YOUTUBE_ID.test(s)) return s;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = parts[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** A link's own start time (`t=90`, `t=1m30s`, `start=90`), in seconds, if it has one. */
export function youtubeStartFrom(input: string): number | null {
  const m = /[?&#](?:t|start)=([0-9hms]+)/i.exec(input.trim());
  if (!m) return null;
  const v = m[1].toLowerCase();
  if (/^\d+$/.test(v)) return Number(v);
  const hms = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (!hms || !(hms[1] || hms[2] || hms[3])) return null;
  return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
}

/**
 * A time as typed: "1:30" (m:ss), "1:02:03" (h:mm:ss) or plain seconds ("90"). Null when it
 * isn't a time; the caller treats a blank field as "none" before asking.
 */
export function parseClock(input: string): number | null {
  const s = input.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d+):(\d{1,2})$/.exec(s);
  if (!m) return null;
  const [h, min, sec] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
  if (sec > 59 || (m[1] !== undefined && min > 59)) return null;
  return h * 3600 + min * 60 + sec;
}

/** Seconds as m:ss (or h:mm:ss past an hour): 90 → "1:30". */
export function formatClock(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// The editor's form
// ---------------------------------------------------------------------------

export type BodyType = RelearningSectionBody["type"];

export const BODY_LABEL: Record<BodyType, string> = {
  text: "Reading",
  video: "Video",
  flashcards: "Flashcards",
  worked_steps: "Worked steps",
  interactive: "Hosted page",
};

/** The body types a mode starts a new section with (any type works in any mode). */
export const DEFAULT_BODY: Record<RelearningMode, BodyType> = {
  read: "text",
  watch: "video",
  do: "flashcards",
};

export type CheckForm = {
  id: string;
  kind: QuickCheck["kind"];
  prompt: string;
  /** Multiple choice: the options, and the right one's id in `answer`. */
  options: { id: string; text: string }[];
  answer: string;
  /** Fill-in: every accepted answer, one per row. */
  accepted: string[];
  explanation: string;
  /** Video: where it pauses, as typed (m:ss); blank = after the video. */
  at: string;
  /** Worked steps: the step it follows; blank = after the last step. */
  afterStepId: string;
};

export type SectionForm = {
  /** The browser's key for the section card (stable across reorders). */
  key: string;
  part: "core" | "extension";
  title: string;
  minutes: string;
  type: BodyType;
  /** Every body type's fields are kept, so switching type and back loses nothing. */
  text: string;
  video: string;
  start: string;
  end: string;
  page: string;
  cards: { id: string; front: string; back: string }[];
  problem: string;
  steps: { id: string; text: string }[];
  checks: CheckForm[];
  shortAnswer: string;
};

export type OptionForm = {
  title: string;
  description: string;
  published: boolean;
  sections: SectionForm[];
};

/** The smallest `prefix<n>` not in `used` (n from 1), for a new check, option, card or step. */
export function nextId(prefix: string, used: Iterable<string>): string {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Every check id in the form (check ids are unique across the whole option). */
export function checkIds(form: OptionForm): string[] {
  return form.sections.flatMap((s) => s.checks.map((c) => c.id));
}

export function blankCheck(id: string, kind: QuickCheck["kind"] = "multiple_choice"): CheckForm {
  return {
    id,
    kind,
    prompt: "",
    options: [
      { id: "a", text: "" },
      { id: "b", text: "" },
    ],
    answer: "a",
    accepted: [""],
    explanation: "",
    at: "",
    afterStepId: "",
  };
}

export function blankSection(key: string, part: "core" | "extension", type: BodyType): SectionForm {
  return {
    key,
    part,
    title: "",
    minutes: part === "core" ? "4" : "6",
    type,
    text: "",
    video: "",
    start: "",
    end: "",
    page: "",
    cards: [
      { id: "k1", front: "", back: "" },
      { id: "k2", front: "", back: "" },
    ],
    problem: "",
    steps: [
      { id: "s1", text: "" },
      { id: "s2", text: "" },
    ],
    checks: [],
    shortAnswer: "",
  };
}

/** A new option's form: a core and an extension of the mode's usual type. */
export function blankOption(mode: RelearningMode, targetCode: string): OptionForm {
  const label = { read: "Read", watch: "Watch", do: "Do" }[mode];
  return {
    title: `${label}: ${targetCode}`,
    description: "",
    published: false,
    sections: [
      blankSection("n1", "core", DEFAULT_BODY[mode]),
      blankSection("n2", "extension", DEFAULT_BODY[mode]),
    ],
  };
}

/** Cores first, then extensions, each in its own order (how students are served them). */
export function orderedSections<T extends { part: "core" | "extension" }>(sections: T[]): T[] {
  return [
    ...sections.filter((s) => s.part === "core"),
    ...sections.filter((s) => s.part === "extension"),
  ];
}

/** A saved option as the editor's form. Sections come in core-then-extension order. */
export function optionToForm(option: {
  title: string;
  description: string | null;
  isPublished: boolean;
  sections: {
    id: string;
    part: "core" | "extension";
    sortOrder: number;
    title: string | null;
    body: RelearningSectionBody;
    checks: QuickCheck[];
    shortAnswerPrompt: string | null;
    estMinutes: number;
  }[];
}): OptionForm {
  const sorted = orderedSections([...option.sections].sort((a, b) => a.sortOrder - b.sortOrder));
  return {
    title: option.title,
    description: option.description ?? "",
    published: option.isPublished,
    sections: sorted.map((s) => {
      const f = blankSection(s.id, s.part, s.body.type);
      f.title = s.title ?? "";
      f.minutes = String(s.estMinutes);
      f.shortAnswer = s.shortAnswerPrompt ?? "";
      const b = s.body;
      if (b.type === "text") f.text = b.text;
      if (b.type === "video") {
        f.video = b.youtubeId ?? "";
        f.start = b.startSeconds !== undefined ? formatClock(b.startSeconds) : "";
        f.end = b.endSeconds !== undefined ? formatClock(b.endSeconds) : "";
      }
      if (b.type === "interactive") f.page = b.page;
      if (b.type === "flashcards") f.cards = b.cards.map((c) => ({ ...c }));
      if (b.type === "worked_steps") {
        f.problem = b.problem;
        f.steps = b.steps.map((st) => ({ ...st }));
      }
      f.checks = s.checks.map((c) => ({
        ...blankCheck(c.id, c.kind),
        prompt: c.prompt,
        options: c.kind === "multiple_choice" ? (c.options ?? []).map((o) => ({ ...o })) : [],
        answer: c.kind === "multiple_choice" && typeof c.answer === "string" ? c.answer : "",
        accepted:
          c.kind === "fill_blank" ? (Array.isArray(c.answer) ? [...c.answer] : [c.answer]) : [""],
        explanation: c.explanation ?? "",
        at: c.atSeconds !== undefined ? formatClock(c.atSeconds) : "",
        afterStepId: c.afterStepId ?? "",
      }));
      return f;
    }),
  };
}

/** One section's body from its form, for the type it is set to. */
function bodyOf(s: SectionForm, issue: (m: string) => void): RelearningSectionBody {
  switch (s.type) {
    case "text":
      return { type: "text", text: s.text.trim() };
    case "video": {
      const youtubeId = youtubeIdFrom(s.video) ?? "";
      if (s.video.trim() && !youtubeId) issue("that isn't a YouTube link or 11-character id");
      if (!s.video.trim()) issue("paste a YouTube link or id");
      const body: Extract<RelearningSectionBody, { type: "video" }> = { type: "video", youtubeId };
      for (const [field, label] of [
        ["start", "start"],
        ["end", "end"],
      ] as const) {
        if (!s[field].trim()) continue;
        const sec = parseClock(s[field]);
        if (sec === null) issue(`the ${label} time must look like 1:30`);
        else body[field === "start" ? "startSeconds" : "endSeconds"] = sec;
      }
      if (
        body.startSeconds !== undefined &&
        body.endSeconds !== undefined &&
        body.endSeconds <= body.startSeconds
      )
        issue("the end time must come after the start");
      return body;
    }
    case "interactive":
      return { type: "interactive", page: s.page.trim() };
    case "flashcards":
      return {
        type: "flashcards",
        cards: s.cards
          .filter((c) => c.front.trim() || c.back.trim())
          .map((c) => ({ id: c.id, front: c.front.trim(), back: c.back.trim() })),
      };
    case "worked_steps":
      return {
        type: "worked_steps",
        problem: s.problem.trim(),
        steps: s.steps
          .filter((st) => st.text.trim())
          .map((st) => ({ id: st.id, text: st.text.trim() })),
      };
  }
}

function checkOf(c: CheckForm, s: SectionForm, issue: (m: string) => void): QuickCheck {
  const out: QuickCheck = { id: c.id, kind: c.kind, prompt: c.prompt.trim(), answer: "" };
  if (c.kind === "multiple_choice") {
    out.options = c.options
      .filter((o) => o.text.trim())
      .map((o) => ({ id: o.id, text: o.text.trim() }));
    out.answer = c.answer;
  } else {
    out.answer = c.accepted.map((a) => a.trim()).filter(Boolean);
  }
  if (c.explanation.trim()) out.explanation = c.explanation.trim();
  if (s.type === "video" && c.at.trim()) {
    const sec = parseClock(c.at);
    if (sec === null) issue(`check ${c.id}'s pause time must look like 1:30`);
    else out.atSeconds = sec;
  }
  if (s.type === "worked_steps" && c.afterStepId) out.afterStepId = c.afterStepId;
  return out;
}

/**
 * The form as a pack's `PackRelearning` (the shape the pack applier writes), plus everything
 * wrong with it: the form's own problems (a link that isn't YouTube, a time that isn't m:ss),
 * `relearningIssues`, and `editorIssues`. Sections go cores first, then extensions, so
 * "section N" in an issue is the editor's section N.
 */
export function formToPack(
  form: OptionForm,
  target: string,
  mode: RelearningMode
): { pack: PackRelearning; issues: string[] } {
  const issues: string[] = [];
  const sections = orderedSections(form.sections).map((s, i) => {
    const issue = (m: string) => issues.push(`section ${i + 1}: ${m}`);
    const minutes = Number(s.minutes);
    if (!/^\d+$/.test(s.minutes.trim())) issue("minutes must be a whole number");
    const sec: PackRelearning["sections"][number] = {
      part: s.part,
      minutes: Number.isFinite(minutes) ? minutes : 0,
      body: bodyOf(s, issue),
      checks: s.checks.map((c) => checkOf(c, s, issue)),
    };
    if (s.title.trim()) sec.title = s.title.trim();
    if (s.shortAnswer.trim()) sec.shortAnswer = s.shortAnswer.trim();
    return sec;
  });
  const pack: PackRelearning = {
    target,
    mode,
    title: form.title.trim(),
    published: form.published,
    sections,
  };
  if (form.description.trim()) pack.description = form.description.trim();
  // The form already said what's wrong with a section's link, so the pack's own word on it goes.
  const linkSaid = new Set(issues.filter((m) => /YouTube link/.test(m)).map(sectionOf));
  const more = [...relearningIssues(pack), ...editorIssues(pack)]
    .map((m) => inEditorWords(m, target, mode))
    .filter((m) => !(/youtubeId must be/.test(m) && linkSaid.has(sectionOf(m))));
  // Whole-option issues first, then section by section.
  const all = [...new Set([...issues, ...more])];
  return { pack, issues: all.sort((a, b) => sectionOf(a) - sectionOf(b)) };
}

/** The section an issue is about ("section 2: …" → 2), or 0 for the whole option. */
function sectionOf(issue: string): number {
  return Number(/^section (\d+):/.exec(issue)?.[1] ?? 0);
}

/** A pack issue without its "relearning U3.LT1 read" lead-in (the editor shows one option). */
function inEditorWords(issue: string, target: string, mode: RelearningMode): string {
  const lead = `relearning ${target} ${mode}`;
  if (issue.startsWith(`${lead}: `)) return issue.slice(lead.length + 2);
  if (issue.startsWith(`${lead} `)) return issue.slice(lead.length + 1);
  return issue;
}

/**
 * What the editor asks for beyond the pack checks (`relearningIssues`): every check has a
 * question, a multiple choice at least two options, every card a front and a back, worked steps
 * a problem, and a video's pause time inside its clip.
 */
export function editorIssues(r: PackRelearning): string[] {
  const out: string[] = [];
  const where = `relearning ${r.target} ${r.mode}`;
  for (const [i, sec] of (r.sections ?? []).entries()) {
    const at = `${where} section ${i + 1}`;
    const b = sec.body;
    if (b?.type === "flashcards" && b.cards.some((c) => !c.front || !c.back))
      out.push(`${at}: every card needs a front and a back`);
    if (b?.type === "worked_steps" && !b.problem) out.push(`${at}: needs the problem`);
    for (const c of sec.checks ?? []) {
      if (!c.prompt) out.push(`${at}: check ${c.id} needs a question`);
      if (c.kind === "multiple_choice" && (c.options ?? []).length < 2)
        out.push(`${at}: check ${c.id} needs at least two options`);
      if (b?.type === "video" && c.atSeconds !== undefined) {
        if (b.startSeconds !== undefined && c.atSeconds < b.startSeconds)
          out.push(`${at}: check ${c.id} pauses before the clip starts`);
        if (b.endSeconds !== undefined && c.atSeconds > b.endSeconds)
          out.push(`${at}: check ${c.id} pauses after the clip ends`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// What the server accepts from the browser
// ---------------------------------------------------------------------------

/** Caps on what one option may hold, so a pasted novel can't land in a JSONB column. */
const MAX = { short: 300, long: 20_000, sections: 20, items: 40 };

const str = (v: unknown, cap: number): string | null =>
  typeof v === "string" && v.length <= cap ? v : null;
const arr = (v: unknown): unknown[] | null =>
  Array.isArray(v) && v.length <= MAX.items ? v : null;
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const secs = (v: unknown): number | undefined | null =>
  v === undefined || v === null
    ? undefined
    : typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 86_400
      ? v
      : null;

/**
 * The editor's save, as the server reads it: whatever the browser sent, rebuilt into a clean
 * `PackRelearning` for this target and mode (unknown fields dropped, every field's type and size
 * checked), or the reasons it can't be. `relearningIssues` and `editorIssues` run on the result.
 */
export function readEditorInput(
  input: unknown,
  target: string,
  mode: RelearningMode
): { pack: PackRelearning | null; issues: string[] } {
  const bad = (m: string) => ({ pack: null, issues: [m] });
  const o = obj(input);
  if (!o) return bad("nothing to save");
  const title = str(o.title, MAX.short);
  const description = o.description === undefined ? "" : str(o.description, MAX.long);
  if (title === null || description === null) return bad("the title or description is too long");
  const rawSections = Array.isArray(o.sections) ? o.sections : null;
  if (!rawSections || rawSections.length > MAX.sections)
    return bad(`an option holds 1 to ${MAX.sections} sections`);
  const sections: PackRelearning["sections"] = [];
  for (const [i, raw] of rawSections.entries()) {
    const s = obj(raw);
    const b = obj(s?.body);
    const at = `section ${i + 1}`;
    if (!s || !b) return bad(`${at}: needs a body`);
    const part = s.part === "core" || s.part === "extension" ? s.part : null;
    if (!part) return bad(`${at}: part must be core or extension`);
    let body: RelearningSectionBody;
    if (b.type === "text") {
      const text = str(b.text, MAX.long);
      if (text === null) return bad(`${at}: the reading is too long`);
      body = { type: "text", text };
    } else if (b.type === "video") {
      const youtubeId = str(b.youtubeId, 11) ?? "";
      const start = secs(b.startSeconds);
      const end = secs(b.endSeconds);
      if (start === null || end === null) return bad(`${at}: start and end are seconds`);
      body = {
        type: "video",
        youtubeId,
        ...(start !== undefined ? { startSeconds: start } : {}),
        ...(end !== undefined ? { endSeconds: end } : {}),
      };
    } else if (b.type === "interactive") {
      body = { type: "interactive", page: str(b.page, MAX.short) ?? "" };
    } else if (b.type === "flashcards") {
      const cards = arr(b.cards);
      if (!cards) return bad(`${at}: up to ${MAX.items} cards`);
      const clean = cards.map((c) => {
        const x = obj(c);
        const id = str(x?.id, 40);
        const front = str(x?.front, MAX.long);
        const back = str(x?.back, MAX.long);
        return id && front !== null && back !== null ? { id, front, back } : null;
      });
      if (clean.some((c) => !c)) return bad(`${at}: a card is malformed`);
      body = { type: "flashcards", cards: clean as { id: string; front: string; back: string }[] };
    } else if (b.type === "worked_steps") {
      const steps = arr(b.steps);
      const problem = str(b.problem, MAX.long);
      if (!steps || problem === null) return bad(`${at}: the worked steps are malformed`);
      const clean = steps.map((st) => {
        const x = obj(st);
        const id = str(x?.id, 40);
        const text = str(x?.text, MAX.long);
        return id && text !== null ? { id, text } : null;
      });
      if (clean.some((st) => !st)) return bad(`${at}: a step is malformed`);
      body = { type: "worked_steps", problem, steps: clean as { id: string; text: string }[] };
    } else return bad(`${at}: unknown body type`);

    const rawChecks = s.checks === undefined ? [] : arr(s.checks);
    if (!rawChecks) return bad(`${at}: up to ${MAX.items} checks`);
    const checks: QuickCheck[] = [];
    for (const rc of rawChecks) {
      const c = obj(rc);
      const id = str(c?.id, 40);
      const kind = c?.kind === "multiple_choice" || c?.kind === "fill_blank" ? c.kind : null;
      const prompt = str(c?.prompt, MAX.long);
      if (!c || !id || !kind || prompt === null) return bad(`${at}: a check is malformed`);
      const check: QuickCheck = { id, kind, prompt, answer: "" };
      if (kind === "multiple_choice") {
        const options = arr(c.options);
        const answer = str(c.answer, 40);
        const clean = (options ?? []).map((op) => {
          const x = obj(op);
          const oid = str(x?.id, 40);
          const text = str(x?.text, MAX.long);
          return oid && text !== null ? { id: oid, text } : null;
        });
        if (!options || answer === null || clean.some((x) => !x))
          return bad(`${at}: check ${id}'s options are malformed`);
        check.options = clean as { id: string; text: string }[];
        check.answer = answer;
      } else {
        const accepted = Array.isArray(c.answer) ? arr(c.answer) : [c.answer];
        const clean = (accepted ?? []).map((a) => str(a, MAX.short));
        if (!accepted || clean.some((a) => a === null))
          return bad(`${at}: check ${id}'s answers are malformed`);
        check.answer = clean as string[];
      }
      if (c.explanation !== undefined) {
        const e = str(c.explanation, MAX.long);
        if (e === null) return bad(`${at}: check ${id}'s explanation is too long`);
        if (e) check.explanation = e;
      }
      const atSeconds = secs(c.atSeconds);
      if (atSeconds === null) return bad(`${at}: check ${id}'s pause time is malformed`);
      if (atSeconds !== undefined) check.atSeconds = atSeconds;
      if (c.afterStepId !== undefined && c.afterStepId !== "") {
        const after = str(c.afterStepId, 40);
        if (!after) return bad(`${at}: check ${id}'s step is malformed`);
        check.afterStepId = after;
      }
      checks.push(check);
    }
    const sec: PackRelearning["sections"][number] = { part, body, checks };
    if (s.minutes !== undefined) {
      if (typeof s.minutes !== "number" || !Number.isInteger(s.minutes))
        return bad(`${at}: minutes must be a whole number`);
      sec.minutes = s.minutes;
    }
    if (s.title !== undefined) {
      const t = str(s.title, MAX.short);
      if (t === null) return bad(`${at}: the title is too long`);
      if (t.trim()) sec.title = t.trim();
    }
    if (s.shortAnswer !== undefined) {
      const t = str(s.shortAnswer, MAX.long);
      if (t === null) return bad(`${at}: the short answer prompt is too long`);
      if (t.trim()) sec.shortAnswer = t.trim();
    }
    sections.push(sec);
  }
  const pack: PackRelearning = {
    target,
    mode,
    title: title.trim(),
    published: o.published === true,
    sections,
  };
  if (description.trim()) pack.description = description.trim();
  const issues = [...relearningIssues(pack), ...editorIssues(pack)].map((m) =>
    inEditorWords(m, target, mode)
  );
  return { pack: issues.length ? null : pack, issues };
}
