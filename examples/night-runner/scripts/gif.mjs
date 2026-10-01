// Records a scroll-through of the site as PNG frames (then ffmpeg makes the GIF).
// usage: node scripts/gif.mjs <url> <outDir>
import fs from "node:fs";
import path from "node:path";
import { launchContext } from "cloakbrowser";

const [url = "https://night-runner.pages.dev/", outDir = "shots/gif"] = process.argv.slice(2);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const context = await launchContext({ headless: true, viewport: { width: 1200, height: 750 } });
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#loader").classList.contains("done"), null, { timeout: 30000 });
await page.waitForTimeout(1800);

const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const runEnd = await page.evaluate(() => { const r = document.querySelector("#run"); return r.offsetTop + r.offsetHeight - innerHeight; });
// hold on the opening, scrub the comic page slowly, then glide through the rest
const stops = [];
for (let i = 0; i < 8; i++) stops.push(0);
for (let i = 1; i <= 78; i++) stops.push((runEnd * i) / 78);
for (let i = 1; i <= 40; i++) stops.push(runEnd + ((total - runEnd) * i) / 40);
for (let i = 0; i < 8; i++) stops.push(total);

let n = 0;
for (const y of stops) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(140);
  await page.screenshot({ path: path.join(outDir, `g_${String(n++).padStart(4, "0")}.png`) });
}
await context.close();
console.log(`${n} frames → ${outDir}`);
