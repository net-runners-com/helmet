// Hand-built Lottie animations (no After Effects): run `npm run lottie` to
// regenerate public/lottie/*.json.
import fs from "node:fs";
import path from "node:path";

const K = (v) => ({ a: 0, k: v });
const EASE = { i: { x: [0.3], y: [1] }, o: { x: [0.6], y: [0] } };
const A = (keys) => ({ a: 1, k: keys.map((k, n) => (n < keys.length - 1 ? { t: k.t, s: k.s, ...EASE } : { t: k.t, s: k.s })) });
const tr = (over = {}) => ({ ty: "tr", p: K([0, 0]), a: K([0, 0]), s: K([100, 100]), r: K(0), o: K(100), ...over });
const group = (items, transform) => ({ ty: "gr", nm: "g", it: [...items, tr(transform)] });
const stroke = (c, w) => ({ ty: "st", c: K([...c, 1]), o: K(100), w: K(w), lc: 2, lj: 2, ml: 4 });
const fill = (c) => ({ ty: "fl", c: K([...c, 1]), o: K(100), r: 1 });
const ellipse = (s) => ({ ty: "el", d: 1, p: K([0, 0]), s });
const rect = (w, h, r) => ({ ty: "rc", d: 1, s: K([w, h]), p: K([0, 0]), r: K(r) });
const line = (pts) => ({ ty: "sh", d: 1, ks: K({ i: pts.map(() => [0, 0]), o: pts.map(() => [0, 0]), v: pts, c: false }) });
const curve = (v, i, o, c = false) => ({ ty: "sh", d: 1, ks: K({ i, o, v, c }) });
const draw = (from, to) => ({ ty: "tm", s: K(0), e: A([{ t: from, s: [0] }, { t: to, s: [100] }]), o: K(0), m: 1 });

function doc(name, w, h, op, shapes) {
  return {
    v: "5.7.4", fr: 60, ip: 0, op, w, h, nm: name, ddd: 0, assets: [],
    layers: [{ ddd: 0, ind: 1, ty: 4, nm: name, sr: 1, ao: 0, ip: 0, op, st: 0, bm: 0,
      ks: { o: K(100), r: K(0), p: K([w / 2, h / 2, 0]), a: K([0, 0, 0]), s: K([100, 100, 100]) }, shapes }],
  };
}

const WHITE = [1, 1, 1];
const YELLOW = [1, 0.83, 0.1];

// loader: three rings bursting outward
const ring = (start) => group(
  [ellipse(A([{ t: start, s: [8, 8] }, { t: start + 50, s: [104, 104] }])), stroke(YELLOW, 4)],
  { o: A([{ t: start, s: [100] }, { t: start + 50, s: [0] }]) },
);
const burst = doc("burst", 120, 120, 80, [ring(0), ring(14), ring(28)]);

// scroll hint: a bead dropping through a capsule
const scroll = doc("scroll", 40, 64, 70, [
  group([ellipse(K([6, 6])), fill(WHITE)], { p: A([{ t: 0, s: [0, -11] }, { t: 45, s: [0, 11] }]), o: A([{ t: 0, s: [100] }, { t: 35, s: [100] }, { t: 45, s: [0] }]) }),
  group([rect(22, 42, 11), stroke(WHITE, 2.5)]),
]);

// cast icons: inked stroke by stroke
const ink = (shape, from, to, w = 4) => group([shape, draw(from, to), stroke(YELLOW, w)]);

const bolt = doc("bolt", 120, 120, 90, [
  ink(line([[12, -44], [-18, 4], [4, 4], [-12, 44], [22, -8], [0, -8], [12, -44]]), 0, 60),
]);

const spoke = (deg, from) => {
  const r = (deg * Math.PI) / 180;
  return ink(line([[Math.cos(r) * 10, Math.sin(r) * 10], [Math.cos(r) * 36, Math.sin(r) * 36]]), from, from + 25);
};
const wheel = doc("wheel", 120, 120, 100, [
  ink(curve([[0, -38], [38, 0], [0, 38], [-38, 0]], [[-21, 0], [0, -21], [21, 0], [0, 21]], [[21, 0], [0, 21], [-21, 0], [0, -21]], true), 0, 50),
  ink(curve([[0, -10], [10, 0], [0, 10], [-10, 0]], [[-5.5, 0], [0, -5.5], [5.5, 0], [0, 5.5]], [[5.5, 0], [0, 5.5], [-5.5, 0], [0, -5.5]], true), 30, 60, 3),
  spoke(-90, 50), spoke(30, 58), spoke(150, 66),
]);

const drop = (x, y, s, from) => ink(
  curve([[x, y - 22 * s], [x + 14 * s, y + 8 * s], [x, y + 22 * s], [x - 14 * s, y + 8 * s]],
    [[0, 0], [0, -10 * s], [8 * s, 0], [0, 8 * s]], [[0, 0], [0, 8 * s], [-8 * s, 0], [0, -10 * s]], true), from, from + 40,
);
const rain = doc("rain", 120, 120, 100, [
  drop(-4, 4, 1.5, 0),
  drop(30, -22, 0.6, 35),
  drop(-34, -18, 0.5, 50),
  ink(line([[-30, 44], [30, 44]]), 55, 85, 3),
]);

const out = path.resolve("public/lottie");
fs.mkdirSync(out, { recursive: true });
for (const [name, data] of Object.entries({ burst, scroll, bolt, wheel, rain })) {
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(data));
}
console.log("lottie →", fs.readdirSync(out).join(", "));
