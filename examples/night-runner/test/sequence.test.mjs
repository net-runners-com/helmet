import { test } from "node:test";
import assert from "node:assert/strict";
import { FRAME_COUNT, FRAME_PACK, framePack, frameIndex, nearestLoaded, focusRect, CHAPTERS, chapterAt, SFX, sfxAt, speedAt } from "../src/sequence.js";
import { CHAPTERS as COPY } from "../helmet/content.js";

test("frames: 193 files, progress maps onto them and clamps", () => {
  assert.equal(FRAME_COUNT, 193);
  assert.equal(framePack(0), "frames/p_00.bin");
  assert.equal(framePack(Math.ceil(FRAME_COUNT / FRAME_PACK) - 1), "frames/p_24.bin");
  assert.equal(frameIndex(0, 193), 0);
  assert.equal(frameIndex(1, 193), 192);
  assert.equal(frameIndex(0.5, 193), 96);
  assert.equal(frameIndex(-1, 193), 0);
  assert.equal(frameIndex(NaN, 193), 0);
});

test("nearestLoaded picks the closest frame that has arrived", () => {
  assert.equal(nearestLoaded([true, false, false, true], 1), 0);
  assert.equal(nearestLoaded([true, false, false, true], 2), 3);
  assert.equal(nearestLoaded([false, false], 0), -1);
});

test("focusRect: a panel crops the frame around a focus point, never outside it", () => {
  // same aspect, no zoom: the whole frame
  assert.deepEqual(focusRect(720, 1280, 360, 640, 0.5, 0.5, 1), { sx: 0, sy: 0, sw: 720, sh: 1280 });
  // zoom 2 on the centre: the middle quarter
  assert.deepEqual(focusRect(720, 1280, 360, 640, 0.5, 0.5, 2), { sx: 180, sy: 320, sw: 360, sh: 640 });
  // focus in a corner is clamped to the frame
  const c = focusRect(720, 1280, 360, 640, 0, 1, 2);
  assert.deepEqual(c, { sx: 0, sy: 640, sw: 360, sh: 640 });
  // a wide close-up panel out of a portrait frame
  const w = focusRect(720, 1280, 800, 300, 0.3, 0.47, 1.5);
  assert.ok(w.sw <= 720 && w.sh <= 1280 && w.sx >= 0 && w.sy >= 0 && w.sx + w.sw <= 720 + 1e-9 && w.sy + w.sh <= 1280 + 1e-9);
  assert.ok(Math.abs(w.sw / w.sh - 800 / 300) < 1e-9, "keeps the panel's aspect");
});

test("chapters cover the scroll without gaps", () => {
  assert.equal(CHAPTERS[0].from, 0);
  assert.equal(CHAPTERS.at(-1).to, 1);
  for (let i = 1; i < CHAPTERS.length; i++) assert.equal(CHAPTERS[i].from, CHAPTERS[i - 1].to);
  assert.equal(chapterAt(0), 0);
  assert.equal(chapterAt(1), CHAPTERS.length - 1);
  assert.equal(COPY.length, CHAPTERS.length);
  assert.ok(COPY.every((c) => c.caption && c.bubble));
});

test("sound effects pop in their windows and nowhere else", () => {
  assert.ok(SFX.length >= 3);
  assert.equal(sfxAt(0), -1);
  SFX.forEach((s, i) => assert.equal(sfxAt((s.from + s.to) / 2), i));
  for (let i = 1; i < SFX.length; i++) assert.ok(SFX[i].from >= SFX[i - 1].to, "no overlap");
});

test("the speedometer climbs from 62 to 140 mph", () => {
  assert.equal(speedAt(0), 62);
  assert.equal(speedAt(1), 140);
  assert.equal(speedAt(0.5), 101);
  assert.equal(speedAt(7), 140);
});
