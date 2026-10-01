// Deterministic class/id obfuscation shared by the build plugin and the CLI.
// Renames every CSS class and id a site defines to an opaque token, consistently
// across built CSS, HTML, and the site's own JS (selectors, classList calls,
// class="" / id="" attributes, and href="#id" fragments). Runtime/third-party
// names (Lenis, Turnstile, …) and CSS hex colours are never touched.
import { createHash } from "node:crypto";

const escapeName = (c) => c.replace(/[-]/g, "\\$&");
const alternation = (names) => [...names].sort((a, b) => b.length - a.length).map(escapeName).join("|");

/**
 * @param {object} opts
 * @param {string[]} opts.classes  class names the site defines
 * @param {string[]} [opts.ids]    id names the site uses
 * @param {string[]} [opts.keep]   names to leave verbatim (library/runtime-owned)
 * @param {string}   [opts.salt]   rotates every token; set per deploy to break cached scrapers
 * @param {string}   [opts.prefix] token prefix letter (valid CSS ident start); default "h"
 */
export function createObfuscator({ classes, ids = [], keep = [], salt = "", prefix = "h" }) {
  const KEEP = new Set(keep);
  const net = (list) => list.filter((n) => !KEEP.has(n));
  const CLASSES = net(classes);
  const IDS = net(ids);

  const token = (ns, name) =>
    prefix + createHash("sha1").update(`helmet:${salt}:${ns}:${name}`).digest("hex").slice(0, 6);
  const MAP = Object.fromEntries(CLASSES.map((c) => [c, token("class", c)]));
  const ID_MAP = Object.fromEntries(IDS.map((i) => [i, token("id", i)]));
  if (new Set([...Object.values(MAP), ...Object.values(ID_MAP)]).size !== CLASSES.length + IDS.length) {
    throw new Error("helmet: obfuscation token collision (try a different salt or prefix)");
  }

  const ALT = alternation(CLASSES);
  const ALT_ID = alternation(IDS);
  // CSS: a dot always starts a class selector, so match ".class" anywhere; ALT holds
  // only site class names, so decimals/units (.5vw, 0.98) never collide.
  const SELECTOR_CSS = ALT && new RegExp(`\\.(${ALT})(?![\\w-])`, "g");
  // JS: a dot is usually property access (obj.row), so only rewrite ".class" when the
  // dot follows a string quote, whitespace, or a CSS combinator — i.e. inside a selector.
  const SELECTOR_JS = ALT && new RegExp(`(["'\\\`\\s(,>~+])\\.(${ALT})(?![\\w-])`, "g");
  const ID_CSS = ALT_ID && new RegExp(`#(${ALT_ID})(?![\\w-])`, "g");
  const ID_JS = ALT_ID && new RegExp(`(["'\\\`\\s(,>~+:])#(${ALT_ID})(?![\\w-])`, "g");
  const ID_ATTR = ALT_ID && new RegExp(`(\\sid=")(${ALT_ID})(")`, "g");
  const HREF_HASH = ALT_ID && new RegExp(`(href="#)(${ALT_ID})(")`, "g");
  const GET_BY_ID = ALT_ID && new RegExp(`(getElementById\\(\\s*")(${ALT_ID})(")`, "g");
  const CLASS_ATTR = /class="([^"]*)"/g;
  const CLASSLIST = /(classList\.(?:add|remove|toggle|contains|replace)\(\s*")([^"]+)(")/g;
  const GET_BY_CLASS = ALT && new RegExp(`(getElementsByClassName\\(\\s*")(${ALT})(")`, "g");

  const renameTokens = (list) =>
    list.split(/\s+/).map((t) => (t && !KEEP.has(t) ? MAP[t] ?? t : t)).join(" ");

  const rewriteCss = (code) => {
    let out = code;
    if (SELECTOR_CSS) out = out.replace(SELECTOR_CSS, (_m, n) => `.${MAP[n]}`);
    if (ID_CSS) out = out.replace(ID_CSS, (_m, n) => `#${ID_MAP[n]}`);
    return out;
  };

  const rewriteHtml = (html) => {
    let out = html.replace(CLASS_ATTR, (_m, v) => `class="${renameTokens(v)}"`);
    if (ID_ATTR) out = out.replace(ID_ATTR, (_m, a, n, z) => a + ID_MAP[n] + z);
    if (HREF_HASH) out = out.replace(HREF_HASH, (_m, a, n, z) => a + ID_MAP[n] + z);
    return out;
  };

  const rewriteJs = (code) => {
    let out = code;
    if (SELECTOR_JS) out = out.replace(SELECTOR_JS, (_m, pre, n) => `${pre}.${MAP[n]}`);
    if (ID_JS) out = out.replace(ID_JS, (_m, pre, n) => `${pre}#${ID_MAP[n]}`);
    out = out.replace(CLASS_ATTR, (_m, v) => `class="${renameTokens(v)}"`).replace(CLASSLIST, (_m, a, v, z) => a + renameTokens(v) + z);
    if (GET_BY_CLASS) out = out.replace(GET_BY_CLASS, (_m, a, n, z) => a + (MAP[n] ?? n) + z);
    if (ID_ATTR) out = out.replace(ID_ATTR, (_m, a, n, z) => a + ID_MAP[n] + z);
    if (HREF_HASH) out = out.replace(HREF_HASH, (_m, a, n, z) => a + ID_MAP[n] + z);
    if (GET_BY_ID) out = out.replace(GET_BY_ID, (_m, a, n, z) => a + ID_MAP[n] + z);
    return out;
  };

  return { MAP, ID_MAP, rewriteCss, rewriteJs, rewriteHtml };
}

const HEX_COLOR = /^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// Class/id names from CSS: `.class` and `#id` selectors (not inside url()/strings,
// and never hex colours). Keep separate from markup/JS so `obj.add` in JS is never
// mistaken for a class.
export function extractCssNames(css) {
  const classes = new Set();
  const ids = new Set();
  // Strip url(...) and quoted strings so their contents aren't scanned as selectors.
  const bare = css.replace(/url\([^)]*\)/g, " ").replace(/"[^"]*"|'[^']*'/g, " ");
  for (const m of bare.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) classes.add(m[1]);
  for (const m of bare.matchAll(/#([A-Za-z_][\w-]*)/g)) if (!HEX_COLOR.test(m[1])) ids.add(m[1]);
  return { classes: [...classes], ids: [...ids] };
}

// Class/id names a site defines, from markup and JS: class="" / id="" / href="#" /
// classList.*() / getElementById / getElementsByClassName / "#id" selector strings.
// Does NOT scan bare `.name` (that is JS property access); use extractCssNames for CSS.
export function extractNames(sources) {
  const classes = new Set();
  const ids = new Set();
  const text = sources.join("\n");
  for (const m of text.matchAll(/class="([^"]*)"/g)) for (const t of m[1].split(/\s+/)) if (t) classes.add(t);
  for (const m of text.matchAll(/classList\.(?:add|remove|toggle|contains|replace)\(\s*"([^"]+)"/g)) classes.add(m[1]);
  for (const m of text.matchAll(/getElementsByClassName\(\s*"([^"]+)"/g)) classes.add(m[1]);
  // ".class" selector strings in JS (quote/space/combinator before the dot).
  for (const m of text.matchAll(/["'`\s(,>~+]\.(-?[A-Za-z_][\w-]*)/g)) classes.add(m[1]);
  for (const m of text.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  for (const m of text.matchAll(/href="#([A-Za-z_][\w-]*)"/g)) ids.add(m[1]);
  for (const m of text.matchAll(/getElementById\(\s*"([^"]+)"/g)) ids.add(m[1]);
  // "#name" selector strings, excluding hex colours.
  for (const m of text.matchAll(/["'`\s(,>~+:]#([A-Za-z_][\w-]*)(?![\w-])/g)) if (!HEX_COLOR.test(m[1])) ids.add(m[1]);
  return { classes: [...classes], ids: [...ids] };
}
