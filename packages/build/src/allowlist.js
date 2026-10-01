// Compute and write the set of files the worker may serve as plain static files.
// Everything else (protected assets, the worker bundle, anything from an older
// cached deploy) is refused with 404 by @helmet/worker.
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

function walk(dir, base = dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p, base));
    else out.push("/" + relative(base, p).split(sep).join("/"));
  }
  return out;
}

/**
 * @param {string} distDir   built site directory
 * @param {object} [opts]
 * @param {string[]} [opts.excludeDirs]  top-level dirs to exclude (protected assets)
 * @param {string[]} [opts.excludeFiles] exact paths to exclude (e.g. /_worker.js)
 * @param {string}   [opts.out]          where to write the JSON list
 * @returns {string[]} the allowlist
 */
export function writePublicAllowlist(distDir, { excludeDirs = ["_p"], excludeFiles = ["/_worker.js"], out } = {}) {
  const skip = new Set(excludeFiles);
  const list = walk(distDir).filter((p) => {
    if (skip.has(p)) return false;
    const top = p.split("/")[1];
    return !excludeDirs.includes(top);
  }).sort();
  if (out) {
    mkdirSync(join(out, ".."), { recursive: true });
    writeFileSync(out, JSON.stringify(list));
  }
  return list;
}
