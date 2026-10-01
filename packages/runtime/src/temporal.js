// Temporal dithering ("flicker-fusion") screenshot defense. A target's text is
// drawn to a canvas and split across k frames that each look like noise but whose
// time-average is the original, so the eye fuses them into readable text while a
// single screenshot captures only one noisy frame. The text is also removed from
// the DOM, so scrapers get nothing either.
//
//   import { applyTemporal } from "@helmet/runtime";
//   applyTemporal(".secret");   // protect just the elements that need it
//
// ⚠️ PHOTOSENSITIVITY: flicker between ~3–60 Hz can trigger seizures in people
// with photosensitive epilepsy. This module ALWAYS disables itself under
// `prefers-reduced-motion: reduce` (the content is shown normally instead), keeps
// the per-frame luminance swing bounded, and must be applied to small regions
// only — never the whole page. A screen RECORDING that averages frames can still
// recover the text; this degrades a single screenshot, it does not prevent capture.

const resolve = (t) =>
  typeof t === "string" ? [...document.querySelectorAll(t)] : t instanceof Element ? [t] : [...t];

function wrap(ctx, text, maxWidth) {
  if (!maxWidth) return [text];
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? line + " " + word : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function buildFrames(imageData, k, noise, rnd) {
  const { data, width, height } = imageData;
  const frames = Array.from({ length: k }, () => new ImageData(width, height));
  for (let i = 0; i < data.length; i += 4) {
    // k offsets per channel that sum to 0, so the time-average is the original.
    for (let c = 0; c < 3; c++) {
      const offs = Array.from({ length: k }, () => (rnd() * 2 - 1) * noise);
      const mean = offs.reduce((a, b) => a + b, 0) / k;
      for (let f = 0; f < k; f++) {
        frames[f].data[i + c] = Math.max(0, Math.min(255, data[i + c] + offs[f] - mean));
      }
    }
    for (let f = 0; f < k; f++) frames[f].data[i + 3] = 255;
  }
  return frames;
}

function protect(el, { frames: k, noise, hz }) {
  const cs = getComputedStyle(el);
  const text = el.textContent.trim();
  if (!text) return;
  const rect = el.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.ceil(rect.width));
  const pad = 2;

  const measure = document.createElement("canvas").getContext("2d");
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
  measure.font = font;
  const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
  const lines = wrap(measure, text, width);
  const height = Math.max(1, Math.ceil(lines.length * lineH + pad * 2));

  // Draw the true composited image (text on the element's background colour).
  const truth = document.createElement("canvas");
  truth.width = width * dpr;
  truth.height = height * dpr;
  const tctx = truth.getContext("2d");
  tctx.scale(dpr, dpr);
  const bg = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : getComputedStyle(document.body).backgroundColor || "#000";
  tctx.fillStyle = bg;
  tctx.fillRect(0, 0, width, height);
  tctx.font = font;
  tctx.fillStyle = cs.color;
  tctx.textBaseline = "top";
  tctx.textAlign = cs.textAlign === "center" ? "center" : cs.textAlign === "right" ? "right" : "left";
  const x = tctx.textAlign === "center" ? width / 2 : tctx.textAlign === "right" ? width - pad : pad;
  lines.forEach((ln, i) => tctx.fillText(ln, x, pad + i * lineH));

  const img = tctx.getImageData(0, 0, truth.width, truth.height);
  let seed = 0x9e3779b9 ^ (Math.random() * 2 ** 32);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const framesData = buildFrames(img, k, noise, rnd);

  // Swap into the visible canvas; the text is removed from the DOM.
  const canvas = document.createElement("canvas");
  canvas.width = truth.width;
  canvas.height = truth.height;
  canvas.setAttribute("aria-label", text); // keep it readable to assistive tech
  canvas.style.cssText = `width:${width}px;height:${height}px;display:block`;
  const vctx = canvas.getContext("2d");
  el.textContent = "";
  el.setAttribute("aria-hidden", "false");
  el.appendChild(canvas);

  let f = 0;
  let last = 0;
  const minInterval = 1000 / (hz || 1e9); // 0 → every frame
  const tick = (now) => {
    if (now - last >= minInterval) { vctx.putImageData(framesData[f++ % k], 0, 0); last = now; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function applyTemporal(targets, opts = {}) {
  const { frames = 2, noise = 96, hz = 0, respectReducedMotion = true } = opts;
  if (respectReducedMotion && matchMedia("(prefers-reduced-motion: reduce)").matches) return; // safety: no flicker
  for (const el of resolve(targets)) {
    try { protect(el, { frames: Math.max(2, frames), noise, hz }); } catch { /* leave element as-is */ }
  }
}
