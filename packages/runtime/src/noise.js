// Structure noise + canary honeytokens. After the real DOM exists, pad it with
// hidden decoy nodes, random junk attributes and dead nesting, re-randomised per
// session so two captures never match and the real tree is buried. Decoys use a
// "d…"/"q…" token space disjoint from Helmet's "h…" classes/ids, and are
// display:none, so no selector or style hits them and layout is untouched. Every
// decoy carries the canary prefix: a cloned DOM keeps it, so a suspected copy can
// be grepped for it.
const COMIC = "RRRM TSSH VRMM KPOW ZZT BWAA NGHH SKRR FWOO DKOW THMP WRRN".split(" ");

export function installStructureNoise(seed, { canaryPrefix = "hlm", decoyMin = 3, decoyMax = 8 } = {}) {
  // Deterministic per session (seed = the forensic sid) so DOM noise and the
  // screenshot mark agree and tie back to one session.
  let s = (seed ^ 0x9e3779b9) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pick = (a) => a[(rnd() * a.length) | 0];
  const hex = (n) => Array.from({ length: n }, () => ((rnd() * 16) | 0).toString(16)).join("");
  const tag = (p) => p + hex(6);
  const CANARY = canaryPrefix;

  const decoy = (depth = 0) => {
    const el = document.createElement(pick(["span", "i", "b", "u", "s"]));
    el.className = `${tag("d")} ${tag("q")}`;
    el.setAttribute(`data-${tag("v")}`, hex(8));
    el.dataset[CANARY] = hex(10);
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    el.textContent = `${CANARY}:${pick(COMIC)}${pick(COMIC)}${hex(4)}`;
    if (depth < 3 && rnd() < 0.5) {
      const wrap = document.createElement("div");
      wrap.className = tag("d");
      wrap.style.display = "none";
      wrap.appendChild(decoy(depth + 1));
      if (rnd() < 0.6) wrap.appendChild(decoy(depth + 1));
      return wrap;
    }
    return el;
  };

  // Non-grid containers only, so grid children stay direct.
  for (const host of document.querySelectorAll("main, header, footer, section, nav, aside")) {
    const n = decoyMin + ((rnd() * (decoyMax - decoyMin + 1)) | 0);
    for (let i = 0; i < n; i++) {
      const kids = host.children;
      host.insertBefore(decoy(), kids[(rnd() * (kids.length + 1)) | 0] ?? null);
    }
  }
  // Junk data-* on real elements (never id/class/data-t, never <canvas>).
  for (const el of document.querySelectorAll("main *, header *, footer *")) {
    if (el.tagName === "CANVAS" || el.dataset.t !== undefined) continue;
    if (rnd() < 0.5) el.setAttribute(`data-${tag("v")}`, hex(6));
  }
}
