// dist → local server → headless Chromium screenshots (desktop, mobile, reduced
// motion). Exits 1 on page errors, console errors, or if a Lottie failed to draw.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { launchContext } from "cloakbrowser";

const DIST = path.resolve("dist");
const OUT = path.resolve("shots");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(DIST, p === "/" ? "index.html" : p);
  if (!file.startsWith(DIST) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const HOOK = `window.__errors = [];
  { const ce = console.error.bind(console); console.error = (...a) => { window.__errors.push(a.map(String).join(" ").slice(0, 600)); ce(...a); }; }
  addEventListener("error", (e) => window.__errors.push(String(e.message || e)));
  addEventListener("unhandledrejection", (e) => window.__errors.push(String(e.reason)));`;

// [label, selector, fraction of the section's scrollable length]
const STOPS = [
  ["1-run-00", "#run", 0], ["2-run-13", "#run", 0.13], ["3-run-40", "#run", 0.4], ["4-run-65", "#run", 0.65], ["5-run-92", "#run", 0.92],
  ["6-story", "#story", 0.6], ["7-cast", "#cast", 0.5], ["8-stats", "#stats", 1], ["9-read", "#read", 1],
];

async function session(name, { viewport, reducedMotion = false, stops = STOPS }) {
  const context = await launchContext({ headless: true, viewport });
  const errors = [];
  try {
    await context.addInitScript(HOOK);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("#loader").classList.contains("done"), null, { timeout: 20000 });
    await page.waitForTimeout(2000);
    for (const [label, sel, f] of stops) {
      await page.evaluate(([s, frac]) => {
        const el = document.querySelector(s);
        const top = el.getBoundingClientRect().top + scrollY;
        window.scrollTo(0, top + Math.max(0, el.offsetHeight - innerHeight) * frac);
      }, [sel, f]);
      await page.waitForTimeout(2600);
      await page.screenshot({ path: path.join(OUT, `${name}-${label}.png`) });
    }
    const lottie = await page.evaluate(() => [...document.querySelectorAll(".card-icon, #scroll-hint")].map((el) => el.querySelectorAll("svg path").length));
    if (lottie.some((n) => n === 0)) errors.push(`a Lottie animation rendered no paths: ${JSON.stringify(lottie)}`);
    errors.push(...(await page.evaluate(() => window.__errors)));
  } finally {
    await context.close();
  }
  return errors;
}

const errors = [];
errors.push(...(await session("desktop", { viewport: { width: 1440, height: 900 } })));
errors.push(...(await session("mobile", { viewport: { width: 375, height: 812 } })));
errors.push(...(await session("reduced", { viewport: { width: 1440, height: 900 }, reducedMotion: true, stops: [STOPS[1], STOPS[6]] })));
server.close();
console.log(`shots → ${OUT} (${fs.readdirSync(OUT).length} files)`);
if (errors.length) { console.error("page errors:\n" + errors.join("\n")); process.exit(1); }
