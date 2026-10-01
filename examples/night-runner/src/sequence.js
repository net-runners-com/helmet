// Pure helpers for the scroll-scrubbed comic page.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = (v) => clamp(Number.isFinite(v) ? v : 0, 0, 1);

export const FRAME_COUNT = 193;
// Frames ship in packs of FRAME_PACK (built by helmet/build_assets.py), fetched through the protected-asset route.
export const FRAME_PACK = 8;
export const framePack = (p) => `frames/p_${String(p).padStart(2, "0")}.bin`;

export function frameIndex(progress, count) {
  return Math.round(clamp01(progress) * (count - 1));
}

// While frames are still arriving, show the closest one we already have.
export function nearestLoaded(loaded, index) {
  for (let d = 0; d < loaded.length; d++) {
    if (loaded[index - d]) return index - d;
    if (loaded[index + d]) return index + d;
  }
  return -1;
}

// Source rectangle for a comic panel: cover the cw×ch panel, zoomed in on the
// focus point (fx, fy in 0..1), clamped so it never leaves the frame.
export function focusRect(iw, ih, cw, ch, fx, fy, zoom = 1) {
  const scale = Math.max(cw / iw, ch / ih) * Math.max(1, zoom);
  const sw = cw / scale;
  const sh = ch / scale;
  return { sx: clamp(fx * iw - sw / 2, 0, iw - sw), sy: clamp(fy * ih - sh / 2, 0, ih - sh), sw, sh };
}

// Timing only. The captions, bubbles and sound-effect words live in helmet/content.js
// (server-side) so they never ship as plain text in the bundle.
export const CHAPTERS = [
  { from: 0, to: 0.26 },
  { from: 0.26, to: 0.52 },
  { from: 0.52, to: 0.78 },
  { from: 0.78, to: 1 },
];

export function chapterAt(progress) {
  const p = clamp01(progress);
  const i = CHAPTERS.findIndex((c) => p >= c.from && p < c.to);
  return i === -1 ? CHAPTERS.length - 1 : i;
}

export const SFX = [
  { from: 0.06, to: 0.2 },
  { from: 0.32, to: 0.46 },
  { from: 0.58, to: 0.72 },
  { from: 0.84, to: 0.98 },
];

export function sfxAt(progress) {
  const p = clamp01(progress);
  return SFX.findIndex((s) => p >= s.from && p < s.to);
}

export function speedAt(progress) {
  return Math.round(62 + 78 * clamp01(progress));
}
