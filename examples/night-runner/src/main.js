import "./styles.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import lottie from "lottie-web/build/player/lottie_light";
import { FRAME_COUNT, FRAME_PACK, framePack, frameIndex, nearestLoaded, focusRect, CHAPTERS, chapterAt, SFX, sfxAt, speedAt } from "./sequence.js";
import { createComic } from "./comic.js";
import { createHelmetRuntime } from "@helmet/runtime";

const { ready } = createHelmetRuntime({
  fontFaces: [
    { family: "Bangers", weight: "400", style: "normal" },
    { family: "Barlow Condensed", weight: "500", style: "normal" },
    { family: "Barlow Condensed", weight: "700", style: "normal" },
    { family: "Barlow Condensed", weight: "600", style: "italic" },
    { family: "Barlow Condensed", weight: "800", style: "italic" },
  ],
});

gsap.registerPlugin(ScrollTrigger);
const $ = (s) => document.querySelector(s);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Copy, fonts and assets only exist after the Turnstile-gated session (see helmet.js).
// T(key) returns copy encoded for this session's decoy fonts; it is not readable text.
const { T, fill, asset, json } = await ready;
$("#gate").remove();
const LOTTIE = Object.fromEntries(await Promise.all(["burst", "scroll", "bolt", "wheel", "rain"].map(async (n) => [n, await json(`lottie/${n}.json`)])));
const anim = (container, name, opts = {}) => lottie.loadAnimation({ container, renderer: "svg", loop: false, autoplay: false, animationData: LOTTIE[name], ...opts });

// ── content ──────────────────────────────────────────────────────────────────
const CAST = ["bolt", "wheel", "rain"];
const STATS = [193, 140, 12, 13];
$("#statement").removeAttribute("data-t"); // split into words below; a later fill() must not flatten it
$("#statement").innerHTML = $("#statement").textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
$("#marquee").innerHTML = [...SFX, ...SFX, ...SFX, ...SFX].map((_, i) => `<span data-t="sfx.${i % SFX.length}"></span>`).join("");
$("#cards").innerHTML = CAST.map((icon, i) => `
  <article class="card"><div class="card-icon" data-icon="${icon}"></div><p class="card-role" data-t="cast.${i}.role"></p><h3 data-t="cast.${i}.name"></h3><p class="card-text" data-t="cast.${i}.text"></p></article>`).join("");
$("#stats-grid").innerHTML = STATS.map((_, i) => `
  <div class="stat"><p class="stat-num" data-i="${i}">0</p><p class="stat-label" data-t="stats.${i}.label"></p></div>`).join("");
fill();

// ── frames → comic shader → panels ───────────────────────────────────────────
const comic = createComic(720, 1280);
if (!comic) document.documentElement.classList.add("no-webgl");
// each panel is a different crop of the same frame: wide shot, headlights, skyline
const panels = [
  { el: $("#panel-a"), focus: [0.5, 0.5], zoom: 1 },
  { el: $("#panel-b"), focus: [0.36, 0.49], zoom: 1.9 },
  { el: $("#panel-c"), focus: [0.72, 0.3], zoom: 1.7 },
].map((p) => ({ ...p, canvas: p.el.querySelector("canvas"), ctx: p.el.querySelector("canvas").getContext("2d") }));

const frames = new Array(FRAME_COUNT);
const loaded = new Array(FRAME_COUNT).fill(false);
let loadedCount = 0;
let progress = 0;
let dirty = true;
let speed = reducedMotion ? 0.2 : 0.4; // speed-line strength
let speedTarget = speed;
let time = 0;

function resizePanels() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  for (const p of panels) {
    p.canvas.width = Math.round(p.canvas.clientWidth * dpr);
    p.canvas.height = Math.round(p.canvas.clientHeight * dpr);
  }
  dirty = true;
}
function draw() {
  const i = nearestLoaded(loaded, frameIndex(progress, FRAME_COUNT));
  if (i < 0) return;
  const img = frames[i];
  let source = img, sw = img.naturalWidth, sh = img.naturalHeight;
  if (comic) {
    comic.render(img, { speed, time, focus: [0.45, 0.47] });
    source = comic.canvas; sw = source.width; sh = source.height;
  }
  for (const p of panels) {
    if (!p.canvas.width || !p.canvas.height) continue;
    const r = focusRect(sw, sh, p.canvas.width, p.canvas.height, p.focus[0], p.focus[1], p.zoom);
    p.ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, 0, 0, p.canvas.width, p.canvas.height);
  }
}
let lastTick = performance.now();
gsap.ticker.add(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;
  const moving = !reducedMotion && speedTarget > 0.45;
  if (Math.abs(speedTarget - speed) > 0.005) { speed += (speedTarget - speed) * Math.min(1, dt * 8); dirty = true; }
  if (moving) { time += dt; dirty = true; } // lines flicker only while the page is moving
  if (dirty) { dirty = false; draw(); }
});

// loader: Lottie burst + real loading progress
const loader = $("#loader");
const burst = anim($("#loader-anim"), "burst", { loop: true, autoplay: !reducedMotion });
let revealed = false;
function reveal() {
  if (revealed) return;
  revealed = true;
  loader.classList.add("done");
  setTimeout(() => burst.destroy(), 900);
  intro();
}
const frameDone = () => { loadedCount++; if (loadedCount === FRAME_COUNT) reveal(); };
function loadFrame(i, bytes) {
  const img = new Image();
  img.decoding = "async";
  // The object URL is revoked as soon as the image has decoded, so it can't be opened or saved.
  const src = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
  img.onload = () => {
    URL.revokeObjectURL(src);
    loaded[i] = true;
    $("#loader-pct").textContent = String(Math.round(((loadedCount + 1) / FRAME_COUNT) * 100));
    if (i === 0 || loadedCount % 8 === 0) dirty = true;
    frameDone();
  };
  img.onerror = () => { URL.revokeObjectURL(src); frameDone(); };
  img.src = src;
  frames[i] = img;
}
// Frames arrive in masked packs: [u32 count][u32 length × count][jpeg bytes…]
for (let p = 0; p * FRAME_PACK < FRAME_COUNT; p++) {
  const first = p * FRAME_PACK;
  const count = Math.min(FRAME_PACK, FRAME_COUNT - first);
  asset(framePack(p)).then((data) => {
    const view = new DataView(data.buffer);
    let offset = 4 + 4 * count;
    for (let n = 0; n < count; n++) {
      const len = view.getUint32(4 + 4 * n, true);
      loadFrame(first + n, data.subarray(offset, offset + len));
      offset += len;
    }
  }, () => { for (let n = 0; n < count; n++) frameDone(); });
}
setTimeout(reveal, 12000); // never trap the reader behind the loader

// ── scrolling ────────────────────────────────────────────────────────────────
let lenis = null;
if (!reducedMotion) {
  lenis = new Lenis({ lerp: 0.09 });
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

const caption = $("#caption");
const bubble = $("#bubble");
const sfx = $("#sfx");
gsap.set(sfx, { xPercent: -50 });
let chapter = -1;
let sfxShown = -2;

function showChapter(i) {
  if (i === chapter) return;
  chapter = i;
  caption.textContent = T(`ch.${i}.caption`);
  bubble.textContent = T(`ch.${i}.bubble`);
  $("#page-no").textContent = String(i + 1);
  if (reducedMotion) return;
  // a new page: the caption slams down, the panels jolt, the ink flashes
  gsap.fromTo(caption, { scale: 1.8, rotation: -7, opacity: 0 }, { scale: 1, rotation: -2, opacity: 1, duration: 0.45, ease: "back.out(2.4)", overwrite: true });
  gsap.fromTo(bubble, { scale: 0, rotation: 8 }, { scale: 1, rotation: 0, duration: 0.7, delay: 0.18, ease: "elastic.out(1, 0.5)", overwrite: true });
  gsap.fromTo(".flash", { opacity: 0.85 }, { opacity: 0, duration: 0.4, ease: "power2.out", overwrite: true });
  gsap.fromTo(".panel", { x: () => gsap.utils.random(-12, 12), y: () => gsap.utils.random(-8, 8) }, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.3)", overwrite: "auto" });
}
function showSfx(i) {
  if (i === sfxShown) return;
  sfxShown = i;
  if (i === -1) {
    if (reducedMotion) gsap.set(sfx, { opacity: 0 });
    else gsap.to(sfx, { scale: 1.5, opacity: 0, duration: 0.2, ease: "power2.in", overwrite: true });
    return;
  }
  sfx.textContent = T(`sfx.${i}`);
  if (reducedMotion) { gsap.set(sfx, { opacity: 1, scale: 1, rotation: -8 }); return; }
  gsap.fromTo(sfx, { scale: 0.2, opacity: 0, rotation: gsap.utils.random(-16, -4) }, { scale: 1, opacity: 1, duration: 0.55, ease: "elastic.out(1, 0.45)", overwrite: true });
}

const run = $("#run");
const scrollHint = $("#scroll-hint");
anim(scrollHint, "scroll", { loop: true, autoplay: !reducedMotion });
function onScroll() {
  const p = clamp01((scrollY - run.offsetTop) / Math.max(1, run.offsetHeight - innerHeight));
  if (p !== progress) { progress = p; dirty = true; }
  showChapter(chapterAt(progress));
  showSfx(sfxAt(progress));
  $("#mph").textContent = String(speedAt(progress));
  $("#dash-fill").style.transform = `scaleX(${speedAt(progress) / 140})`;
  scrollHint.classList.toggle("off", progress > 0.03);
}
if (lenis) {
  lenis.on("scroll", ({ velocity }) => {
    ScrollTrigger.update();
    onScroll();
    // the faster the scroll, the harder the speed lines and the lean of the big panel
    const v = Math.min(1, Math.abs(velocity) / 45);
    speedTarget = 0.4 + 0.6 * v;
    gsap.to("#panel-a", { skewY: Math.max(-3, Math.min(3, velocity * 0.05)), duration: 0.25, overwrite: "auto" });
  });
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", () => { resizePanels(); onScroll(); });
resizePanels();
onScroll();

// story: words take ink as they pass
const statementWords = [...document.querySelectorAll(".statement .w")];
if (reducedMotion) statementWords.forEach((w) => (w.style.opacity = 1));
else ScrollTrigger.create({
  trigger: "#story", start: "top 75%", end: "center 45%", scrub: true,
  onUpdate: (st) => {
    const lit = st.progress * statementWords.length;
    statementWords.forEach((w, i) => (w.style.opacity = String(0.18 + 0.82 * clamp01(lit - i))));
  },
});

// marquee of sound effects, faster when the page is
if (!reducedMotion) {
  const drift = gsap.to("#marquee", { xPercent: -50, duration: 22, ease: "none", repeat: -1 });
  lenis.on("scroll", ({ velocity }) => gsap.to(drift, { timeScale: 1 + Math.min(8, Math.abs(velocity) / 8), duration: 0.3, overwrite: true }));
}

// cast: cards are thrown onto the table; each icon inks itself once
document.querySelectorAll(".card").forEach((card, i) => {
  const icon = card.querySelector(".card-icon");
  const a = anim(icon, icon.dataset.icon);
  if (reducedMotion) { a.addEventListener("DOMLoaded", () => a.goToAndStop(a.totalFrames - 1, true)); return; }
  gsap.from(card, { y: 120, rotation: i % 2 ? 14 : -14, opacity: 0, duration: 0.8, ease: "back.out(1.6)", delay: i * 0.14, scrollTrigger: { trigger: "#cards", start: "top 82%" } });
  ScrollTrigger.create({ trigger: card, start: "top 80%", once: true, onEnter: () => setTimeout(() => a.goToAndPlay(0, true), 250 + i * 160) });
});
if (!reducedMotion) gsap.from(".head", { xPercent: -30, opacity: 0, duration: 0.6, ease: "back.out(2)", scrollTrigger: { trigger: "#cast", start: "top 72%" } });

// stats
document.querySelectorAll(".stat-num").forEach((el) => {
  const i = Number(el.dataset.i);
  const set = (v) => (el.textContent = Math.round(v) + T(`stats.${i}.suffix`));
  if (reducedMotion) return set(STATS[i]);
  const o = { v: 0 };
  ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: () => gsap.to(o, { v: STATS[i], duration: 1.4, ease: "power3.out", onUpdate: () => set(o.v) }) });
});

// read
if (!reducedMotion) {
  gsap.from(".cta", { scale: 1.6, opacity: 0, duration: 0.5, ease: "back.out(2)", scrollTrigger: { trigger: "#read", start: "top 65%" } });
  gsap.to(".burst-btn", { rotation: 3, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 });
}
$("#read-btn").addEventListener("click", (e) => {
  e.preventDefault();
  $("#read-note").textContent = T("read.note");
});

// magnetic buttons
if (finePointer && !reducedMotion) {
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    const mx = gsap.quickTo(el, "x", { duration: 0.5, ease: "elastic.out(1, 0.4)" });
    const my = gsap.quickTo(el, "y", { duration: 0.5, ease: "elastic.out(1, 0.4)" });
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      mx((e.clientX - (r.left + r.width / 2)) * 0.35);
      my((e.clientY - (r.top + r.height / 2)) * 0.35);
    });
    el.addEventListener("mouseleave", () => { mx(0); my(0); });
  });
}

// anchors travel through Lenis
document.querySelectorAll('a[href^="#"]:not(#read-btn)').forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  const el = document.querySelector(a.getAttribute("href"));
  if (lenis) lenis.scrollTo(el, { duration: 1.4 });
  else el.scrollIntoView();
}));

function intro() {
  ScrollTrigger.refresh();
  resizePanels();
  if (reducedMotion) return;
  gsap.from(".title span", { yPercent: -130, rotation: -14, opacity: 0, duration: 0.6, ease: "back.out(2.2)", stagger: 0.14, delay: 0.1 });
  gsap.from(".issue", { scale: 0, rotation: -200, duration: 0.8, ease: "back.out(2)", delay: 0.45 });
  gsap.from(".panel", { scale: 0.7, opacity: 0, duration: 0.55, ease: "back.out(1.8)", stagger: 0.1, delay: 0.2 });
  gsap.from(".dash", { xPercent: 60, opacity: 0, duration: 0.5, ease: "back.out(1.6)", delay: 0.6 });
  chapter = -1;
  showChapter(chapterAt(progress));
}
