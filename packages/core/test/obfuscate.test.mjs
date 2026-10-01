import { test } from "node:test";
import assert from "node:assert/strict";
import { createObfuscator, extractNames, extractCssNames, defineConfig, DEFAULTS } from "../src/index.js";

const ob = createObfuscator({
  classes: ["panel", "panel-a", "card-text", "w", "off"],
  ids: ["run", "read-btn", "panel-a"],
  keep: ["cf-turnstile"],
  salt: "t",
});

test("class selectors in CSS are renamed, longest-first", () => {
  const css = ob.rewriteCss(".panel { } .panel-a { } .card-text { }");
  assert.ok(!/\.panel\b(?!-)/.test(css.replace(new RegExp(ob.MAP["panel"], "g"), "")));
  assert.match(css, new RegExp(`\\.${ob.MAP["panel-a"]}\\b`));
  assert.match(css, new RegExp(`\\.${ob.MAP["card-text"]}\\b`));
  // ".panel-a" must not be rewritten as ".<panel>-a"
  assert.doesNotMatch(css, new RegExp(`\\.${ob.MAP["panel"]}-a`));
});

test("compound element.class in CSS is renamed", () => {
  assert.match(ob.rewriteCss("p.card-text { }"), new RegExp(`p\\.${ob.MAP["card-text"]}`));
});

test("CSS hex colours are never touched", () => {
  const css = ob.rewriteCss("a { color: #fff; background: #111014; border-color: #off000; }");
  assert.match(css, /#fff/);
  assert.match(css, /#111014/);
});

test("JS selector strings renamed, property access left alone", () => {
  assert.equal(ob.rewriteJs('q(".panel")'), `q(".${ob.MAP["panel"]}")`);
  // descendant selector: only the known class token is renamed, "statement" (not in map) stays
  assert.equal(ob.rewriteJs('q(".statement .w")'), `q(".statement .${ob.MAP["w"]}")`);
  // obj.off is property access, not a selector
  assert.equal(ob.rewriteJs("obj.off = 1"), "obj.off = 1");
});

test("classList and class= attributes renamed; keep-list preserved", () => {
  assert.equal(ob.rewriteJs('classList.toggle("off")'), `classList.toggle("${ob.MAP["off"]}")`);
  assert.equal(ob.rewriteJs('`<i class="panel cf-turnstile">`'), `\`<i class="${ob.MAP["panel"]} cf-turnstile">\``);
});

test("ids: #sel, id=, href=# renamed; hex #fff selector-like left alone", () => {
  assert.equal(ob.rewriteJs('q("#run")'), `q("#${ob.ID_MAP["run"]}")`);
  // id selector after "(" combinator, e.g. :not(#read-btn)
  assert.equal(ob.rewriteJs('qsa(":not(#read-btn)")'), `qsa(":not(#${ob.ID_MAP["read-btn"]})")`);
  assert.equal(ob.rewriteHtml('<a id="run" href="#run">'), `<a id="${ob.ID_MAP["run"]}" href="#${ob.ID_MAP["run"]}">`);
  assert.equal(ob.rewriteJs('c("#fff")'), 'c("#fff")');
});

test("getElementById / getElementsByClassName with bare names are renamed", () => {
  assert.equal(ob.rewriteJs('getElementById("run")'), `getElementById("${ob.ID_MAP["run"]}")`);
  assert.equal(ob.rewriteJs('getElementsByClassName("panel")'), `getElementsByClassName("${ob.MAP["panel"]}")`);
});

test("id and class tokens for the same name differ", () => {
  assert.notEqual(ob.MAP["panel-a"], ob.ID_MAP["panel-a"]);
});

test("salt changes every token", () => {
  const a = createObfuscator({ classes: ["panel"], salt: "x" });
  const b = createObfuscator({ classes: ["panel"], salt: "y" });
  assert.notEqual(a.MAP["panel"], b.MAP["panel"]);
});

test("extractNames (markup/JS) skips bare property access and hex colours", () => {
  const src = [
    `<div class="panel panel-a" id="run"></div><a href="#story">`,
    `document.querySelector("#read-btn"); el.classList.add("done"); x.querySelector(".card-text");`,
    `obj.map(); el.remove(); getElementById("gate"); ctx.fillStyle = "#111014";`,
  ];
  const { classes, ids } = extractNames(src);
  assert.ok(classes.includes("panel") && classes.includes("panel-a") && classes.includes("done") && classes.includes("card-text"));
  // bare property access must NOT be captured as classes
  assert.ok(!classes.includes("map") && !classes.includes("remove") && !classes.includes("querySelector"));
  assert.ok(ids.includes("run") && ids.includes("story") && ids.includes("read-btn") && ids.includes("gate"));
  assert.ok(!ids.includes("111014"));
});

test("extractCssNames reads selectors, ignores url() and hex colours", () => {
  const { classes, ids } = extractCssNames(`.panel { color: #fff; } p.card-text {} #run {} a { src: url("/x.panel.woff2"); }`);
  assert.ok(classes.includes("panel") && classes.includes("card-text"));
  assert.ok(ids.includes("run"));
  assert.ok(!ids.includes("fff"));
});

test("defineConfig deep-merges over defaults", () => {
  const c = defineConfig({ fonts: { variants: 3 }, watermark: { text: "ABCD1234" } });
  assert.equal(c.fonts.variants, 3);
  assert.equal(c.fonts.homophones, DEFAULTS.fonts.homophones); // untouched sibling kept
  assert.equal(c.watermark.text, "ABCD1234");
  assert.equal(c.assetTtl, DEFAULTS.assetTtl);
});
