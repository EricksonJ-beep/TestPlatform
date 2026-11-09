/**
 * One student, end to end, in a real browser (hardening plan H7.5, Nov 9 2026).
 *
 *   npm run e2e                      → http://localhost:3000
 *   npm run e2e -- http://localhost:3100
 *
 * Seeds its own class and quiz (scripts/e2e-seed.ts), then: logs in, starts the quiz, answers
 * with the connection cut partway (the answer must be retried and saved, never lost), leaves an
 * ordering question as shown (it must count as answered), submits, sees the score, and opens
 * corrections on the question it missed. Exits non-zero on the first thing that isn't right.
 *
 * Needs the app running against the local database (`npm run db:local`, `npm run db:migrate`).
 */
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const seeded = JSON.parse(
  execSync("npx tsx --env-file-if-exists=.env.local scripts/e2e-seed.ts", { encoding: "utf8" })
    .trim()
    .split("\n")
    .at(-1)
);

let failed = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `  (${detail})`}`);
  if (!ok) failed++;
};
const saveState = (page, want, timeout = 20000) =>
  page.waitForFunction(
    (w) => document.querySelector("[data-save-state]")?.dataset.saveState === w,
    want,
    { timeout }
  );

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 200)));

try {
  // Log in.
  await page.goto(`${base}/login`);
  await page.fill("#email", seeded.username);
  await page.fill("#password", seeded.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/student/, { timeout: 60000 });
  check("student logs in", true);

  // Start the quiz.
  await page.goto(`${base}/student/assignments/${seeded.assignmentId}`);
  await page
    .getByRole("button", { name: /^start/i })
    .first()
    .click();
  await page.waitForURL(/\/student\/attempt\//, { timeout: 60000 });
  await page.waitForSelector("[data-attempt]");
  const next = () => page.getByRole("button", { name: "Next", exact: true }).click();

  // Q1 right, saved.
  await page.getByRole("radio", { name: /Right/ }).click();
  await saveState(page, "saved");
  check("an answer saves", true);
  await next();
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
  check("focus moves to the new question", /Question 2 of 5/.test(focused), focused);

  // Q2 wrong, with the connection cut: it must be retried, and saved once the connection is back.
  let offline = true;
  await page.route("**/*", (route) =>
    offline && route.request().method() === "POST"
      ? route.abort("internetdisconnected")
      : route.continue()
  );
  await page.getByRole("radio", { name: /Wrong/ }).click();
  await saveState(page, "error");
  check(
    "a dropped save is shown, not hidden",
    (await page.locator("[data-unsaved]").count()) === 1
  );
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await saveState(page, "saved");
  check("the dropped answer is saved once the connection returns", true);
  await next();

  // Q3 right; Q4 typed with a curly apostrophe-free answer and a trailing full stop.
  await page.getByRole("radio", { name: /Right/ }).click();
  await next();
  await page.locator("article input, article textarea").first().fill("Mitochondria.");
  await next();

  // Q5: the ordering question is left exactly as shown.
  await page.waitForSelector("ol li");
  await saveState(page, "saved");
  await page
    .getByRole("button", { name: /review/i })
    .last()
    .click();
  await page.waitForSelector('[data-count="unanswered"]');
  const unanswered = await page.locator('[data-count="unanswered"]').innerText();
  check("an untouched ordering question counts as answered", unanswered.trim() === "0", unanswered);

  // Submit with the connection cut: the button must come back; then submit for real.
  offline = true;
  await page.getByRole("button", { name: "Submit test" }).click();
  await page.getByRole("button", { name: /yes, submit/i }).click();
  await page.waitForSelector("text=/Couldn't reach Bloom/", { timeout: 20000 });
  check(
    "a failed submit gives the button back",
    await page
      .getByRole("button", { name: /submit/i })
      .last()
      .isEnabled()
  );
  offline = false;
  await page
    .getByRole("button", { name: /submit/i })
    .last()
    .click();
  const yes = page.getByRole("button", { name: /yes, submit/i });
  if (await yes.count()) await yes.click();
  await page.waitForURL(/\/student\/assignments\//, { timeout: 30000 });
  await page.waitForSelector("text=/Attempt 1/", { timeout: 20000 });
  const result = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // Q1, Q3, Q4 right; Q2 wrong; the ordering question depends on the shuffle (3 or 4 of 5).
  check(
    "the score is shown and the typed answer counted",
    /[34] \/ 5/.test(result),
    result.slice(0, 200)
  );

  // Corrections open on the missed question(s).
  await page.locator('a[href*="/student/corrections/"]').first().click();
  await page.waitForURL(/\/student\/corrections\//, { timeout: 30000 });
  await page.waitForSelector("[data-corrections]");
  check("corrections open on what was missed", (await page.locator("textarea").count()) >= 1);
  await page.locator("textarea, input[type=text]").first().fill("Right");
  await saveState(page, "saved");
  check("a correction draft saves", true);
} catch (err) {
  check("the run finished", false, String(err).slice(0, 300));
  // What the student was looking at when it stopped.
  const seen = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  console.log(`  at ${page.url()}\n  page: ${seen.replace(/\s+/g, " ").slice(0, 500)}`);
}
check("no errors in the page", pageErrors.length === 0, pageErrors.join(" | "));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
