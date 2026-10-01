// Vite plugin: obfuscate the site's own class names, ids and JS at build time.
// Returns two plugins — class/id/HTML rewriting (enforce:"pre", on source) and
// JavaScript obfuscation (enforce:"post", on our emitted modules).
import { readFileSync, globSync } from "node:fs";
import { createObfuscator, extractNames, extractCssNames, DEFAULT_KEEP } from "@helmet/core";
import JavaScriptObfuscator from "javascript-obfuscator";

const DEFAULT_SOURCES = ["index.html", "src/**/*.js", "src/**/*.css"];
const SRC_JS = /\/src\/.*\.js$/;

// Extract class/id names from a set of file globs: CSS selectors from .css files,
// markup/JS patterns from the rest, so JS property access (obj.add) is never
// mistaken for a class.
export function collectNames(sources, root = process.cwd()) {
  const classes = new Set(), ids = new Set();
  for (const g of sources) {
    for (const f of globSync(g, { cwd: root })) {
      const text = readFileSync(new URL(f, `file://${root}/`), "utf8");
      const e = f.endsWith(".css") ? extractCssNames(text) : extractNames([text]);
      e.classes.forEach((c) => classes.add(c));
      e.ids.forEach((i) => ids.add(i));
    }
  }
  return { classes: [...classes], ids: [...ids] };
}

const JS_OBFUSCATOR_DEFAULTS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.3,
  identifierNamesGenerator: "hexadecimal",
  numbersToExpressions: true,
  splitStrings: true,
  splitStringsChunkLength: 6,
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 1,
  transformObjectKeys: true,
  // self-defending / debug-protection are omitted: they hang once the bundler
  // reformats their output. Use @helmet/runtime's DevTools trap instead.
};

/**
 * @param {object} opts
 * @param {import("@helmet/core").HelmetConfig} opts.config
 * @param {string}   [opts.root]        project dir to resolve source globs (default cwd)
 * @param {string[]} [opts.sources]     globs to extract class/id names from
 * @param {RegExp}   [opts.jsInclude]   which emitted JS to obfuscate (default /\/src\/.*\.js$/)
 */
export function helmet({ config, root = process.cwd(), sources = DEFAULT_SOURCES, jsInclude = SRC_JS } = {}) {
  const ob = config.obfuscate ?? {};
  let classes = ob.classes;
  let ids = ob.ids;
  if (!classes || !ids) {
    const found = collectNames(sources, root);
    classes = classes ?? found.classes;
    ids = ids ?? found.ids;
  }
  const obfuscator = createObfuscator({ classes, ids, keep: ob.keep ?? DEFAULT_KEEP, salt: ob.salt ?? "", prefix: ob.prefix ?? "h" });

  const plugins = [{
    name: "helmet:obfuscate-names",
    enforce: "pre",
    transform(code, id) {
      if (ob.enabled === false) return null;
      if (id.endsWith(".css")) return { code: obfuscator.rewriteCss(code), map: null };
      if (SRC_JS.test(id)) return { code: obfuscator.rewriteJs(code), map: null };
      return null;
    },
    transformIndexHtml(html) {
      return ob.enabled === false ? html : obfuscator.rewriteHtml(html);
    },
  }];

  if (ob.js) {
    const jsOpts = ob.js === true ? JS_OBFUSCATOR_DEFAULTS : { ...JS_OBFUSCATOR_DEFAULTS, ...ob.js };
    plugins.push({
      name: "helmet:obfuscate-js",
      apply: "build",
      enforce: "post",
      transform(code, id) {
        if (!jsInclude.test(id)) return null;
        return { code: JavaScriptObfuscator.obfuscate(code, jsOpts).getObfuscatedCode(), map: null };
      },
    });
  }

  plugins.obfuscator = obfuscator; // exposed for tooling/tests
  return plugins;
}
