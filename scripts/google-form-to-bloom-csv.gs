/**
 * Export a Google Form quiz to Bloom's question-import CSV (PLAN.md Appendix A).
 *
 * Why: the Drive API cannot export a Form and Bloom cannot read docs.google.com, so the
 * answer key has to leave Google from inside Google. Apps Script runs there.
 *
 * How to run (about two minutes, no coding):
 *   1. Open the Form in the editor → ⋮ (top right) → "Script editor" (or Extensions → Apps Script).
 *   2. Replace the contents of Code.gs with this file and fill in CONFIG below.
 *   3. Pick `exportFormToBloomCsv` in the function dropdown → Run → allow the permissions.
 *   4. The CSV lands in the same Drive folder as the Form, named "<form title> — Bloom import.csv".
 *      The Execution log shows a per-question summary and anything that needs a hand edit.
 *   5. Bloom → Question banks → the bank → Import → upload the CSV → preview → confirm.
 *      Or from a terminal: npx tsx --env-file=.env.local scripts/import-csv.ts <file.csv>
 *        --course "Anatomy and Physiology" --bank "<bank>" --commit
 *
 * What maps to what:
 *   Multiple choice        → multiple_choice (or true_false when the choices are exactly True/False)
 *   Checkboxes             → multiple_select
 *   Dropdown               → multiple_choice
 *   Short answer           → short_answer, grading = manual (Apps Script cannot read a text item's
 *                            answer key; Bloom's import sets grading=manual, you can add keywords after)
 *   Paragraph              → extended_response, grading = manual
 *   Section title          → the `topic` column for the questions under it
 *   Image / video items    → skipped and listed in the log; attach media in Bloom after import
 *   Name/email/period items (0 points, text) → skipped
 *   Points, correct answers, and "feedback for correct answers" (→ explanation) carry over.
 */

// ---------------------------------------------------------------- CONFIG ----
const CONFIG = {
  /** Leave blank when the script is attached to the Form; paste a Form id to export any other Form. */
  FORM_ID: "",
  /** Must match the Bloom course name exactly (case-insensitive). */
  COURSE: "Anatomy and Physiology",
  /** Unit name as it appears in Bloom (created if missing). */
  UNIT: "Unit 1",
  /** Learning target code or title as it appears in Bloom (created if missing). */
  LEARNING_TARGET: "U1",
  /** Optional pool name; blank = no pool. Pools are what retakes draw from. */
  POOL: "",
  /** Prefix for external_id so re-running the export updates the same questions instead of duplicating. */
  EXTERNAL_ID_PREFIX: "AP-U1-EXAM",
  /** Default difficulty 1–5 and Bloom's level for every question (edit per row in the CSV if you like). */
  DIFFICULTY: 3,
  BLOOM: "remember",
};
// ----------------------------------------------------------------------------

const BLOOM_COLUMNS = [
  "external_id", "course", "unit", "topic", "learning_target", "standard", "pool", "type", "stem",
  "stimulus_ref", "stimulus_text", "stimulus_image_url", "stimulus_video_url",
  "option_a", "option_b", "option_c", "option_d", "option_e", "option_f",
  "correct", "tolerance", "tolerance_mode", "unit", "points", "difficulty", "bloom", "grading",
  "explanation", "image_url", "video_url", "tags",
];
const LETTERS = ["a", "b", "c", "d", "e", "f"];
const SKIP_TEXT_TITLES = /\b(name|email|e-mail|period|hour|class)\b/i;

function exportFormToBloomCsv() {
  const form = CONFIG.FORM_ID ? FormApp.openById(CONFIG.FORM_ID) : FormApp.getActiveForm();
  if (!form.isQuiz()) {
    Logger.log("Warning: this Form is not in quiz mode, so it has no answer key. Fill in `correct` by hand.");
  }

  const rows = [];
  const notes = [];
  let topic = "";
  let n = 0;

  form.getItems().forEach((item) => {
    const type = item.getType();
    const title = clean(item.getTitle());

    if (type === FormApp.ItemType.SECTION_HEADER || type === FormApp.ItemType.PAGE_BREAK) {
      topic = title;
      return;
    }
    if (type === FormApp.ItemType.IMAGE || type === FormApp.ItemType.VIDEO) {
      notes.push(`Skipped ${type} item "${title}" — attach the media to a question or stimulus in Bloom.`);
      return;
    }

    let row = null;
    switch (type) {
      case FormApp.ItemType.MULTIPLE_CHOICE:
        row = choiceRow(item.asMultipleChoiceItem(), "multiple_choice", notes);
        break;
      case FormApp.ItemType.CHECKBOX:
        row = choiceRow(item.asCheckboxItem(), "multiple_select", notes);
        break;
      case FormApp.ItemType.LIST:
        row = choiceRow(item.asListItem(), "multiple_choice", notes);
        break;
      case FormApp.ItemType.TEXT: {
        const t = item.asTextItem();
        if (t.getPoints() === 0 && SKIP_TEXT_TITLES.test(title)) {
          notes.push(`Skipped "${title}" (looks like a name/period field).`);
          return;
        }
        row = baseRow("short_answer", title, t.getPoints());
        row.grading = "manual";
        row.explanation = feedbackText(t);
        // Bloom requires `correct` on short_answer rows, but Apps Script cannot read a text item's
        // answer key. A placeholder keeps the row importable; grading is manual so it never grades.
        row.correct = row.explanation || "TODO expected answer";
        notes.push(`"${title}" is short answer — Apps Script can't read its answer key; its \`correct\` cell is a placeholder, so type the expected answer there (or grade it by hand in Bloom).`);
        break;
      }
      case FormApp.ItemType.PARAGRAPH_TEXT: {
        const p = item.asParagraphTextItem();
        row = baseRow("extended_response", title, p.getPoints());
        row.grading = "manual";
        row.explanation = feedbackText(p);
        break;
      }
      default:
        notes.push(`Skipped unsupported item type ${type}: "${title}".`);
        return;
    }
    if (!row) return;

    n++;
    row.external_id = `${CONFIG.EXTERNAL_ID_PREFIX}-${pad(n)}`;
    row.topic = topic;
    rows.push(row);
  });

  const csv = toCsv(rows);
  const name = `${form.getTitle()} — Bloom import.csv`;
  const file = saveNextToForm(form, name, csv);

  Logger.log(`${rows.length} questions exported → ${file.getUrl()}`);
  rows.forEach((r) =>
    Logger.log(`${r.external_id} · ${r.type} · ${r.points} pt · correct=${r.correct || "(none)"} · ${r.stem.slice(0, 60)}`)
  );
  if (notes.length) {
    Logger.log("\nNeeds a look:");
    notes.forEach((m) => Logger.log(" - " + m));
  }
  return file.getUrl();
}

/** Multiple choice / checkbox / dropdown → one CSV row with lettered options and the correct letters. */
function choiceRow(item, bloomType, notes) {
  const title = clean(item.getTitle());
  const choices = item.getChoices();
  const texts = choices.map((c) => clean(c.getValue()));

  const isTrueFalse =
    bloomType === "multiple_choice" &&
    texts.length === 2 &&
    texts.map((t) => t.toLowerCase()).sort().join("|") === "false|true";

  const row = baseRow(isTrueFalse ? "true_false" : bloomType, title, item.getPoints());
  row.explanation = feedbackText(item);

  if (choices.length > LETTERS.length) {
    notes.push(`"${title}" has ${choices.length} choices; Bloom allows ${LETTERS.length}. Extra choices dropped — check it.`);
  }

  const correctLetters = [];
  choices.slice(0, LETTERS.length).forEach((c, i) => {
    if (!isTrueFalse) row[`option_${LETTERS[i]}`] = texts[i];
    if (c.isCorrectAnswer()) correctLetters.push(isTrueFalse ? texts[i].toLowerCase() : LETTERS[i]);
  });

  if (correctLetters.length === 0) {
    notes.push(`"${title}" has no correct answer marked in the Form — fill in \`correct\` before importing.`);
  } else if (bloomType === "multiple_choice" && correctLetters.length > 1) {
    notes.push(`"${title}" marks ${correctLetters.length} answers correct on a single-answer item; exported as multiple_select.`);
    row.type = "multiple_select";
  }
  row.correct = correctLetters.join(",");
  return row;
}

function baseRow(type, stem, points) {
  const row = {};
  BLOOM_COLUMNS.forEach((c) => (row[c] = ""));
  row.course = CONFIG.COURSE;
  row.unit = CONFIG.UNIT;
  row.learning_target = CONFIG.LEARNING_TARGET;
  row.pool = CONFIG.POOL;
  row.type = type;
  row.stem = stem;
  row.points = String(points > 0 ? points : 1);
  row.difficulty = String(CONFIG.DIFFICULTY);
  row.bloom = CONFIG.BLOOM;
  row.grading = "auto";
  return row;
}

/** "Feedback for correct answers" is the closest thing a Form has to Bloom's explanation. */
function feedbackText(item) {
  try {
    const fb = item.getFeedbackForCorrect ? item.getFeedbackForCorrect() : item.getGeneralFeedback();
    return fb ? clean(fb.getText()) : "";
  } catch (e) {
    return "";
  }
}

/** Appendix A has two `unit` columns: the course unit (first) and a measurement unit (second, numeric only). */
function toCsv(rows) {
  const lines = [BLOOM_COLUMNS.join(",")];
  rows.forEach((r) => {
    let unitSeen = false;
    const cells = BLOOM_COLUMNS.map((c) => {
      if (c === "unit") {
        if (unitSeen) return "";
        unitSeen = true;
      }
      return csvCell(r[c]);
    });
    lines.push(cells.join(","));
  });
  return lines.join("\r\n") + "\r\n";
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function pad(n) {
  return String(n).padStart(3, "0");
}

/** Write the CSV beside the Form in Drive, replacing an earlier export of the same name. */
function saveNextToForm(form, name, csv) {
  const formFile = DriveApp.getFileById(form.getId());
  const parents = formFile.getParents();
  const folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const existing = folder.getFilesByName(name);
  while (existing.hasNext()) existing.next().setTrashed(true);
  return folder.createFile(name, csv, MimeType.CSV);
}
