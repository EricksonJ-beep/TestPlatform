/**
 * Browser smoke test: logs in as the seed teacher and exercises the parts curl
 * can't (dropdown menus, client transitions, logout).
 *
 *   npm run smoke                       → http://localhost:3000
 *   npm run smoke -- https://bloom-iota-six.vercel.app
 *
 * Needs `npx playwright install chromium` once, and SEED_TEACHER_* in .env.local.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const email = env.SEED_TEACHER_EMAIL;
const password = env.SEED_TEACHER_PASSWORD;
if (!email || !password)
  throw new Error("SEED_TEACHER_EMAIL / SEED_TEACHER_PASSWORD missing in .env.local");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
});
const broken = async () => (await page.content()).includes("couldn’t load");
let failed = 0;
const check = (label, ok) => {
  console.log(`${ok ? "ok " : "FAIL"} ${label}`);
  if (!ok) failed++;
};

await page.goto(`${base}/login`);
await page.fill("#email", email);
await page.fill("#password", password);
await Promise.all([page.waitForURL("**/app"), page.click("button[type=submit]")]);
check("teacher login lands on /app", page.url().endsWith("/app"));

await page.click('button[aria-label="Account menu"]');
await page.waitForTimeout(600);
check(
  "account menu opens",
  (await page.locator("[role=menuitem]").count()) >= 1 && !(await broken())
);
await page.keyboard.press("Escape");

await page.click('button[aria-label="Switch course"]');
await page.waitForTimeout(600);
const items = await page.locator("[role=menuitem]").allInnerTexts();
check(`course switcher opens (${items.length} items)`, items.length >= 1 && !(await broken()));
const course = items.find((t) => t !== "Manage courses");
if (course) {
  await page.locator("[role=menuitem]", { hasText: course }).first().click();
  await page.waitForTimeout(2000);
  check(
    `choosing "${course}" updates the switcher`,
    (await page.locator('button[aria-label="Switch course"]').innerText()).includes(course) &&
      !(await broken())
  );
}

for (const path of ["/app/courses", "/app/classes", "/app/banks", "/app/shared", "/app/settings"]) {
  await page.goto(`${base}${path}`);
  check(`${path} renders`, !(await broken()) && (await page.locator("h1").count()) >= 1);
}

await page.goto(`${base}/app`);
await page.click('button[aria-label="Account menu"]');
await page.locator("[role=menuitem]", { hasText: "Log out" }).click();
await page.waitForURL("**/login", { timeout: 15000 }).catch(() => {});
check("logout returns to /login", page.url().includes("/login"));

await browser.close();
if (errors.length) {
  console.log("--- browser errors ---");
  console.log(errors.join("\n"));
  failed++;
}
console.log(failed ? `${failed} problem(s)` : "all good");
process.exit(failed ? 1 : 0);
