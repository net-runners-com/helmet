import { test } from "node:test";
import assert from "node:assert/strict";
import { embedTextCanary, extractTextCanary, stripCanary } from "../src/index.js";

test("round-trips a session id through zero-width canary", () => {
  for (const sid of [0, 1, 0xdeadbeef, 0x3d34f5b2, 0xffffffff]) {
    const marked = embedTextCanary("One road out. One car fast enough.", sid);
    assert.equal(extractTextCanary(marked), sid >>> 0);
  }
});

test("canary is invisible: visible text is unchanged after stripping", () => {
  const text = "Twelve bridges, nine million neon tubes.";
  const marked = embedTextCanary(text, 0xabcdef01);
  assert.notEqual(marked, text); // zero-width chars were added
  assert.equal(stripCanary(marked), text); // but nothing visible changed
  assert.ok(marked.length > text.length);
});

test("handles empty and single-char text", () => {
  assert.equal(extractTextCanary(embedTextCanary("", 42)), 42);
  assert.equal(extractTextCanary(embedTextCanary("X", 42)), 42);
});

test("returns null when there is no canary", () => {
  assert.equal(extractTextCanary("plain text, no marks"), null);
});

test("survives being embedded in surrounding text", () => {
  const marked = embedTextCanary("hello world", 0x12345678);
  const wild = "prefix " + marked + " suffix";
  assert.equal(extractTextCanary(wild), 0x12345678);
});
