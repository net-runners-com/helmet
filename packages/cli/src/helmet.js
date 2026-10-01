#!/usr/bin/env node
// Helmet CLI — drives the Python asset/forensic tools and the build helpers.
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writePublicAllowlist, collectNames, auditDist, writeLegal } from "@helmet/build";
import { extractTextCanary, stripCanary } from "@helmet/core";

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
    if (!args.length) fail('usage: helmet monitor <baseline.png> <suspect.png> [...]  |  helmet monitor --hash <img>');
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
  timestamp stamp <dir>             proof-of-existence of a build via OpenTimestamps (Bitcoin)
  c2pa sign|verify <image>          embed / read signed Content Credentials (provenance)
  init                              write starter helmet.config.js / helmet.assets.json
`);
    process.exit(cmd ? 1 : 0);
}

function fail(msg) { console.error(msg); process.exit(1); }

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
