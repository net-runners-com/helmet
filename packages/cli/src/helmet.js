#!/usr/bin/env node
// Helmet CLI — drives the Python asset/forensic tools and the build helpers.
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writePublicAllowlist, collectNames, auditDist, writeLegal } from "@helmet/build";
import { extractTextCanary, stripCanary } from "@helmet/core";
import { hunt, huntKeywords } from "./hunt.js";

const PY_DIR = fileURLToPath(new URL("../../../py/", import.meta.url));
const UV_WITH = ["fonttools", "brotli", "numpy", "opencv-python-headless", "invisible-watermark"];

function uv(script, args, withPkgs = UV_WITH) {
  const uvArgs = ["run", ...withPkgs.flatMap((p) => ["--with", p]), "python", PY_DIR + script, ...args];
  const r = spawnSync("uv", uvArgs, { stdio: "inherit" });
  if (r.error) { console.error("helmet: 'uv' not found. Install uv, or run the script under your own venv:", PY_DIR + script); process.exit(1); }
  process.exit(r.status ?? 0);
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "assets":
    uv("helmet_assets.py", [args[0] ?? "helmet.assets.json"], ["fonttools", "brotli", "numpy", "opencv-python-headless", "invisible-watermark"]);
    break;
  case "decode-screenshot":
    if (!args.length) fail("usage: helmet decode-screenshot <image> [more...]");
    uv("helmet_decode.py", args, ["numpy", "opencv-python-headless"]);
    break;
  case "monitor":
    if (args[0] === "scan") { monitorScan(args.slice(1)); break; }
    if (!args.length) fail('usage: helmet monitor <baseline.png> <suspect.png> [...]  |  monitor scan --searx <url> ...  |  monitor --hash <img>');
    uv("helmet_monitor.py", args, ["numpy", "opencv-python-headless"]);
    break;
  case "timestamp":
    if (!args.length) fail("usage: helmet timestamp stamp <dir> [--out dir] | upgrade <f.ots> | verify <manifest> <f.ots>");
    uv("helmet_timestamp.py", args, ["opentimestamps-client"]);
    break;
  case "c2pa":
    if (!args.length) fail('usage: helmet c2pa sign <image> [--author N --copyright T] | verify <image>');
    uv("helmet_c2pa.py", args, ["c2pa-python"]);
    break;
  case "verify-watermark":
    if (args.length < 2) fail("usage: helmet verify-watermark <text> <image> [more...]");
    uv("helmet_verify.py", args, ["numpy", "opencv-python-headless", "invisible-watermark"]);
    break;
  case "extract": {
    const globs = args.length ? args : ["index.html", "src/**/*.js", "src/**/*.css"];
    const { classes, ids } = collectNames(globs);
    console.log(JSON.stringify({ classes: classes.sort(), ids: ids.sort() }, null, 2));
    break;
  }
  case "allowlist": {
    if (!args[0]) fail("usage: helmet allowlist <distDir> [--out file]");
    const outIdx = args.indexOf("--out");
    const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
    const list = writePublicAllowlist(args[0], { out });
    if (!out) console.log(JSON.stringify(list, null, 2));
    else console.log(`helmet: ${list.length} public files -> ${out}`);
    break;
  }
  case "audit": {
    if (!args[0]) fail("usage: helmet audit <distDir> [--copy rendered.json] [--ignore \"Brand,Other\"]");
    const ci = args.indexOf("--copy");
    let copy = [];
    if (ci >= 0 && existsSync(args[ci + 1])) copy = Object.values(JSON.parse(readFileSync(args[ci + 1], "utf8")));
    const ii = args.indexOf("--ignore");
    const ignore = ii >= 0 ? (args[ii + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean) : [];
    const { errors, warnings } = auditDist(args[0], { copy, ignore });
    for (const w of warnings) console.warn("⚠ " + w);
    if (errors.length) { for (const e of errors) console.error("✘ " + e); console.error(`\nhelmet audit: ${errors.length} problem(s)`); process.exit(1); }
    console.log(`helmet audit: clean${warnings.length ? ` (${warnings.length} warning(s))` : ""}`);
    break;
  }
  case "decode-canary": {
    if (!args[0]) fail('usage: helmet decode-canary "<leaked text>"');
    const sid = extractTextCanary(args.join(" "));
    if (sid === null) { console.log("no canary found"); process.exit(1); }
    console.log(`sid=${sid.toString(16).padStart(8, "0")}`);
    console.log(`clean text: ${stripCanary(args.join(" "))}`);
    break;
  }
  case "legal": {
    const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
    const out = opt("out", "public");
    const name = opt("name");
    if (!name) fail('usage: helmet legal --name "Site Name" [--out public] [--url https://…] [--email you@…]');
    const files = writeLegal(out, { name, url: opt("url", ""), email: opt("email", "") });
    console.log(`helmet legal: wrote ${files.length} files to ${out}/:\n  ${files.join("\n  ")}`);
    break;
  }
  case "hunt": {
    const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
    if (args[0] === "keywords") {
      const target = opt("--target");
      if (!target) fail('usage: helmet hunt keywords --target <url> [--out keywords.txt]');
      huntKeywords({ target, out: opt("--out", "keywords.txt") })
        .then((r) => { console.log(`hunt: ${r.keywords.length} keywords from ${target} -> ${opt("--out", "keywords.txt")}`); console.log(r.keywords.map((k) => "  " + k).join("\n")); })
        .catch((e) => fail("hunt: " + e.message));
      break;
    }
    const keywordsFile = opt("--keywords");
    if (!keywordsFile) fail('usage: helmet hunt --keywords <file> [--target <url>] [--verify] [--phrases f] [--exclude a,b] [--out results.json] [--limit N]');
    hunt({
      keywordsFile,
      target: opt("--target"),
      phrasesFile: opt("--phrases"),
      exclude: (opt("--exclude", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
      out: opt("--out", "hunt-results.json"),
      verify: args.includes("--verify"),
      limit: Number(opt("--limit", "40")),
    }).then((r) => {
      console.log(`hunt: ${r.web.length} web candidates (excluding big players${r.target ? " + " + new URL(r.target).hostname : ""})`);
      for (const c of r.web.slice(0, 25)) {
        const tags = [];
        if (c.fingerprint) tags.push("FINGERPRINT");
        if (c.verbatim?.length) tags.push(`${c.verbatim.length} verbatim`);
        console.log(`  [${c.score}] ${c.domain}${tags.length ? "  <<< " + tags.join(", ") : ""}  (${c.keywords.slice(0, 2).join(" / ")})`);
      }
      console.log(`\nnote.com hits: ${r.note.length}`);
      for (const n of r.note.slice(0, 12)) console.log(`  @${n.user}: ${n.title}  ${n.url}`);
      console.log(`\nfull results -> ${opt("--out", "hunt-results.json")}`);
    }).catch((e) => fail("hunt: " + e.message));
    break;
  }
  case "init":
    scaffold();
    break;
  default:
    console.log(`helmet <command>

  assets [config.json]              build decoy fonts + watermarked frames (default helmet.assets.json)
  extract [globs...]                print the class/id names Helmet would obfuscate
  allowlist <distDir> [--out f]     compute the worker's public-file allowlist
  audit <distDir> [--copy f.json]   CI leak gate: fail if copy/class/id/allowlist leak
  legal --name "X" [--out public]   write terms / ai-policy / robots / ai.txt / tdmrep
  decode-screenshot <img> [...]     recover a session id from a leaked screenshot
  decode-canary "<text>"            recover a session id from leaked (invisible-marked) text
  verify-watermark <text> <img>...  check the invisible image watermark
  monitor <base.png> <suspect>...   perceptual-hash similarity (clone / look-alike detection)
  monitor scan --searx <url> ...    find clone candidates via SearXNG, flag canary/phrase hits
  hunt keywords --target <url>      auto-build a clone-hunt keyword list from your site
  hunt --keywords <f> [--verify]    search (DuckDuckGo + note) for copies, verify verbatim/fingerprint
  timestamp stamp <dir>             proof-of-existence of a build via OpenTimestamps (Bitcoin)
  c2pa sign|verify <image>          embed / read signed Content Credentials (provenance)
  init                              write starter helmet.config.js / helmet.assets.json
`);
    process.exit(cmd ? 1 : 0);
}

function fail(msg) { console.error(msg); process.exit(1); }

// monitor scan: find candidate clone sites via a SearXNG instance, then flag the
// ones that carry our canary (zero-width text id or the DOM canary prefix) or quote
// our distinctive phrases. Needs only a SearXNG URL (public instance or self-hosted).
async function monitorScan(a) {
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const searx = opt("--searx");
  if (!searx) fail('usage: helmet monitor scan --searx <url> (--phrases file.txt | --phrase "...") [--exclude yourdomain.com] [--canary hlm] [--limit 20]');
  const canaryPrefix = opt("--canary", "hlm");
  const exclude = opt("--exclude", "");
  const limit = Number(opt("--limit", "20"));
  let phrases = a.filter((_, i) => a[i - 1] === "--phrase");
  const pf = opt("--phrases");
  if (pf && existsSync(pf)) phrases = phrases.concat(readFileSync(pf, "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
  if (!phrases.length) fail("provide --phrase \"...\" (repeatable) or --phrases file.txt");

  const base = searx.replace(/\/+$/, "");
  const seen = new Map(); // url -> matched phrases
  for (const q of phrases) {
    let json;
    try {
      const r = await fetch(`${base}/search?q=${encodeURIComponent(q)}&format=json&safesearch=0`, { headers: { Accept: "application/json" } });
      if (!r.ok) { console.warn(`⚠ searx "${q.slice(0, 30)}…" -> ${r.status} (is JSON output enabled on this instance?)`); continue; }
      json = await r.json();
    } catch (e) { console.warn(`⚠ searx query failed: ${e.message}`); continue; }
    for (const res of json.results ?? []) {
      const url = res.url;
      if (!url || (exclude && url.includes(exclude))) continue;
      if (!seen.has(url)) seen.set(url, new Set());
      seen.get(url).add(q);
    }
  }
  const candidates = [...seen.keys()].slice(0, limit);
  console.log(`scan: ${phrases.length} phrases -> ${seen.size} candidate URLs${seen.size > limit ? ` (checking first ${limit})` : ""}`);

  const findings = [];
  for (const url of candidates) {
    let html = "";
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
      html = await r.text();
    } catch { continue; }
    const domCanary = html.includes("data-" + canaryPrefix) || html.includes(canaryPrefix + ":");
    const textSid = extractTextCanary(html);
    const phraseHits = [...seen.get(url)].filter((p) => html.includes(p));
    const score = (textSid !== null ? 100 : 0) + (domCanary ? 50 : 0) + phraseHits.length;
    if (score > 0) findings.push({ url, textSid, domCanary, phraseHits, score });
  }
  findings.sort((x, y) => y.score - x.score);
  if (!findings.length) { console.log("scan: no candidates carried a canary or quoted a phrase."); process.exit(0); }
  console.log(`\nscan: ${findings.length} flagged (strongest first):`);
  for (const f of findings) {
    const tags = [];
    if (f.textSid !== null) tags.push(`TEXT-CANARY sid=${f.textSid.toString(16).padStart(8, "0")}`);
    if (f.domCanary) tags.push("DOM-CANARY");
    if (f.phraseHits.length) tags.push(`${f.phraseHits.length} phrase match`);
    console.log(`  [${f.score}] ${f.url}\n        ${tags.join(", ")}`);
  }
  console.log("\nCanary hits are strong evidence the copy came from your site; verify images with `helmet verify-watermark` and compare screens with `helmet monitor <base> <suspect>`.");
  process.exit(0);
}

function scaffold() {
  const cfg = `import { defineConfig } from "@helmet/core";

export default defineConfig({
  // Rotate per deploy to break scrapers that cached the old names:
  // obfuscate: { salt: process.env.HELMET_SALT ?? "" },
  watermark: { text: "SITE0001", quality: 82 },
});
`;
  const assets = `{
  "fontsSrc": "fonts-src",
  "faces": { "body": { "file": "YourFont.ttf", "family": "Your Font", "weight": "500", "style": "normal" } },
  "variants": 8,
  "homophones": 10,
  "loader": { "face": "body", "text": "Loading 0123456789%" },
  "renderedPath": ".helmet/rendered.json",
  "out": { "protected": "dist/_p", "public": "dist", "work": ".helmet" }
}
`;
  writeFileSync("helmet.config.js", cfg, { flag: "wx" });
  writeFileSync("helmet.assets.json", assets, { flag: "wx" });
  console.log("helmet: wrote helmet.config.js and helmet.assets.json");
}
