// Every piece of copy on the site. Server-only: bundled into the Pages worker and
// sent to the browser encrypted and encoded for a per-session decoy font. Never
// import this from src/ — that would ship the plain text in the client bundle.
//
// `upper` marks copy the stylesheet used to uppercase with text-transform. The
// decoy codepoints are not real letters, so the worker uppercases before encoding.
const U = (text) => ({ text, upper: true });
const P = (text) => ({ text });

export const CAST = [
  { role: "The driver", name: "Juno Vale", text: "Courier. Never late, never asks what's in the box. Tonight she should have." },
  { role: "The car", name: "The Marlowe", text: "A big-block brute with one working wiper and a grudge against red lights." },
  { role: "The city", name: "Rain City", text: "Twelve bridges, nine million neon tubes, and weather that takes sides." },
];
export const STATS = [
  { label: "frames inked for page one" },
  { suffix: " mph", label: "top speed on Canal Street" },
  { label: "bridges before midnight" },
  { suffix: " min", label: "left on the clock" },
];
export const CHAPTERS = [
  { caption: "11:47 PM. Rain City.", bubble: "One road out. One car fast enough." },
  { caption: "They said the bridge was closed.", bubble: "She never checked." },
  { caption: "Twelve blocks of neon. Zero brakes.", bubble: "Hold on to something." },
  { caption: "Next exit: nowhere.", bubble: "To be continued…" },
];
export const SFX = ["VRRROOOM!", "SKREEEE!", "KA-THOOM!", "WHOOOSH!"];

export const TEXTS = {
  "nav.mark": P("Night Runner"),
  "nav.story": U("Story"),
  "nav.cast": U("Cast"),
  "nav.read": U("Read #1"),
  "issue.label": P("Issue"),
  "issue.no": P("#1"),
  "title.1": P("NIGHT"),
  "title.2": P("RUNNER"),
  "dash.label": U("Speed"),
  "dash.unit": P("MPH"),
  "dash.page.a": U("Page"),
  "dash.page.b": U("/ 4"),
  "story.eyebrow": P("The story so far"),
  "story.statement": U(
    "Rain City locks its bridges at midnight. Tonight a courier with a borrowed muscle car, a full tank and a package nobody will name has thirteen minutes to cross all twelve. The city has other plans.",
  ),
  "cast.head": P("Meet the cast"),
  "cta.1": P("Issue #1"),
  "cta.2": P("is on the grid."),
  "read.btn": P("READ IT NOW"),
  "read.note": U("This is a demo — issue #1 doesn't exist (yet)."),
  "foot.1": P("Night Runner is a fictional comic made for this demo. There is no issue to read — yet."),
  "foot.2": P("Footage generated with Kling AI; its watermark is left in place. Built with GSAP, Lottie and a WebGL comic shader."),
};
CAST.forEach((c, i) => {
  TEXTS[`cast.${i}.role`] = U(c.role);
  TEXTS[`cast.${i}.name`] = P(c.name);
  TEXTS[`cast.${i}.text`] = P(c.text);
});
STATS.forEach((s, i) => {
  TEXTS[`stats.${i}.label`] = U(s.label);
  if (s.suffix) TEXTS[`stats.${i}.suffix`] = P(s.suffix);
});
CHAPTERS.forEach((c, i) => {
  TEXTS[`ch.${i}.caption`] = U(c.caption);
  TEXTS[`ch.${i}.bubble`] = U(c.bubble);
});
SFX.forEach((s, i) => (TEXTS[`sfx.${i}`] = P(s)));

// Final strings exactly as they must render.
export const RENDERED = Object.fromEntries(
  Object.entries(TEXTS).map(([k, v]) => [k, v.upper ? v.text.toUpperCase() : v.text]),
);
