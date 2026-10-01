// Build-time leak gate. Scans a built site and reports anything that would defeat
// Helmet's protection, so CI can fail the build before it ships.
//   - site copy appearing verbatim in a public text file
//   - readable (non-obfuscated) class/id names in index.html
//   - a public JSON allowlist that still lists protected paths
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep, extname } from "node:path";
import { DEFAULT_KEEP } from "@helmet/core";

const TEXT_EXT = new Set([".html", ".htm", ".js", ".mjs", ".css", ".json", ".txt", ".svg", ".xml"]);
const OBF_TOKEN = /^h[0-9a-f]{6}$/;

function walk(dir, base = dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p, base));
    else out.push(p);
  }
  return out;
}

/**
 * @param {string} distDir
 * @param {object} [opts]
 * @param {string[]} [opts.copy]       rendered copy strings that must NOT appear in public files
 * @param {string[]} [opts.keep]       class/id names allowed to stay readable
 * @param {string[]} [opts.excludeDirs] protected dirs not served as public files
 * @returns {{errors: string[], warnings: string[]}}
 */
export function auditDist(distDir, { copy = [], keep = DEFAULT_KEEP, excludeDirs = ["_p"] } = {}) {
  const errors = [];
  const warnings = [];
  const keepSet = new Set(keep);

  const files = walk(distDir).map((p) => ({ abs: p, rel: "/" + relative(distDir, p).split(sep).join("/") }));
  const publicText = files.filter(
    (f) => TEXT_EXT.has(extname(f.rel)) && f.rel !== "/_worker.js" && !excludeDirs.includes(f.rel.split("/")[1]),
  );

  // 1. Copy must not appear verbatim anywhere public (ignore very short strings).
  const needles = copy.map((s) => s.trim()).filter((s) => s.length >= 8);
  for (const f of publicText) {
    const text = readFileSync(f.abs, "utf8");
    for (const n of needles) if (text.includes(n)) errors.push(`copy leak: ${JSON.stringify(n.slice(0, 40) + "…")} found in ${f.rel}`);
  }

  // 2. index.html must carry only obfuscated class/id names (plus the keep-list).
  const index = files.find((f) => f.rel === "/index.html");
  if (index) {
    const html = readFileSync(index.abs, "utf8");
    const readable = new Set();
    for (const m of html.matchAll(/\bclass="([^"]*)"/g)) for (const t of m[1].split(/\s+/)) if (t && !OBF_TOKEN.test(t) && !keepSet.has(t)) readable.add("." + t);
    for (const m of html.matchAll(/\bid="([^"]+)"/g)) if (!OBF_TOKEN.test(m[1]) && !keepSet.has(m[1])) readable.add("#" + m[1]);
    if (readable.size) errors.push(`readable class/id in index.html: ${[...readable].join(", ")}`);
  } else {
    warnings.push("no index.html found in dist");
  }

  // 3. The public allowlist, if present, must not list protected paths.
  const allow = join(distDir, "..", ".helmet", "public.json");
  if (existsSync(allow)) {
    try {
      const list = JSON.parse(readFileSync(allow, "utf8"));
      for (const p of list) if (excludeDirs.includes(p.split("/")[1]) || p === "/_worker.js") errors.push(`allowlist exposes protected path: ${p}`);
    } catch { warnings.push("could not parse .helmet/public.json"); }
  }

  return { errors, warnings };
}
