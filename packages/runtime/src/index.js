// Helmet client runtime. After a Turnstile-gated session, decrypts the site's copy
// and loads its decoy fonts and masked assets, then applies screenshot forensics,
// structure noise and deterrents.
//
//   import { createHelmetRuntime } from "@helmet/runtime";
//   const { ready } = createHelmetRuntime({ fontFaces: [...] });
//   const { T, fill, asset, json } = await ready;   // copy/assets now in place
//
// The server (@helmet/worker) returns a payload with at least:
//   { f: string[]  protected font paths, index-aligned with fontFaces
//     q: string    signed query for protected assets
//     k: string    base64 XOR mask key
//     m: number    session id (forensic seed)
//     t?: Record<string,string>  copy keyed by data-t }
import { b64d, b64e, clientHandshake } from "@helmet/core/runtime";
import { installDeterrents } from "./deterrents.js";
import { installForensicOverlay } from "./forensic.js";
import { installStructureNoise } from "./noise.js";
import { applyTemporal } from "./temporal.js";
import { installHdcpGate } from "./hdcp.js";

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export function createHelmetRuntime(options = {}) {
  const {
    fontFaces = [],
    sessionUrl = "/api/session",
    turnstileCallback = "onHelmetVerified",
    loadTurnstile = true,
    deterrents = {},
    noise = {},
    forensic = {},
    temporal = null,
    hdcp = null,
    onError,
  } = options;

  installDeterrents({ ...deterrents, onWipe: () => session && (session.wiped = true) });
  let session = null;

  async function open(token) {
    const { pubRaw, finish } = await clientHandshake();
    const res = await fetch(sessionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, pub: b64e(pubRaw) }),
    });
    if (!res.ok) throw new Error("helmet session " + res.status);
    const { s, i, c } = await res.json();
    const aes = await finish(b64d(s));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(i) }, aes, b64d(c));
    const doc = JSON.parse(new TextDecoder().decode(pt));

    const key = b64d(doc.k);
    const asset = async (path) => {
      const r = await fetch(`${path.startsWith("/") ? "" : (doc.prefix ?? "/_p/")}${path}?${doc.q}`);
      if (!r.ok) throw new Error(`helmet asset ${path} ${r.status}`);
      const data = new Uint8Array(await r.arrayBuffer());
      for (let n = 0; n < data.length; n++) data[n] ^= key[n % key.length];
      return data;
    };
    const json = async (path) => JSON.parse(new TextDecoder().decode(await asset(path)));

    await Promise.all((doc.f ?? []).map(async (path, n) => {
      const spec = fontFaces[n] ?? {};
      const face = new FontFace(spec.family ?? "HelmetFont" + n, (await asset(path)).buffer, { weight: spec.weight, style: spec.style });
      document.fonts.add(await face.load());
    }));

    const T = (k) => doc.t?.[k] ?? "";
    const fill = (root = document) => root.querySelectorAll("[data-t]").forEach((el) => (el.textContent = T(el.dataset.t)));
    fill();
    if (forensic.enabled !== false) installForensicOverlay(doc.m >>> 0, forensic);
    if (noise.enabled !== false) installStructureNoise(doc.m >>> 0, noise);
    // Screenshot-degradation for opt-in regions, and an HDCP output-path gate.
    if (temporal?.selector) applyTemporal(temporal.selector, temporal);
    if (hdcp?.gate) installHdcpGate(hdcp.gate, hdcp);

    session = { T, fill, asset, json, doc };
    return session;
  }

  const ready = new Promise((resolve, reject) => {
    window[turnstileCallback] = (token) => open(token).then(resolve, (e) => { onError?.(e); reject(e); });
    if (loadTurnstile) {
      // Load Turnstile only after the callback exists, so the widget can't render first.
      const ts = document.createElement("script");
      ts.src = TURNSTILE_SRC;
      ts.async = true;
      document.head.appendChild(ts);
    }
  });

  return { ready };
}

export { installDeterrents, installForensicOverlay, installStructureNoise };
export { applyTemporal } from "./temporal.js";
export { checkHdcp, installHdcpGate } from "./hdcp.js";
