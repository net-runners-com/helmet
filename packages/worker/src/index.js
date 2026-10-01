// Cloudflare Worker / Pages factory. Fronts a static site with Helmet's request
// layer: AI-agent blocking, security + copyright headers, a Turnstile-gated
// encrypted session endpoint, and signed, masked delivery of protected assets.
//
//   import { createHelmet } from "@helmet/worker";
//   import maps from "./.helmet/maps.json";
//   export default createHelmet({ config, maps, publicFiles, session });
//
// `session(ctx)` is project code that returns the plaintext payload to encrypt for
// one visitor; `ctx` carries the per-session decoy-font encoder and asset signature.
import {
  BLOCKED_UA, POLICY_PATHS, DENY_NOTICE, securityHeaders,
  b64e, b64u, b64d, hmac, serverHandshake, encryptJSON, xorMask, randomU32,
  embedTextCanary,
} from "@helmet/core/runtime";

export function createHelmet({ config, maps = {}, publicFiles = [], session, blockedUserAgents = BLOCKED_UA }) {
  const HEADERS = securityHeaders();
  const PUBLIC = new Set(publicFiles);
  const POLICY = new Set(POLICY_PATHS);
  const { assetTtl: TTL, protectedPrefix: PREFIX, turnstile: TS, signingSecretVar: SIG } = config;
  const variants = Object.keys(maps);

  const withHeaders = (res, noStore) => {
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
    if (noStore) out.headers.set("Cache-Control", "no-store");
    return out;
  };
  const deny = (status) => withHeaders(new Response(status === 403 ? DENY_NOTICE : null, { status }), true);

  async function handleSession(req, env, url) {
    if (req.headers.get("Origin") !== url.origin) return deny(403);
    let body;
    try { body = await req.json(); } catch { return deny(400); }
    if (!body.token || !body.pub) return deny(400);

    const ip = req.headers.get("CF-Connecting-IP") ?? "";
    const form = new FormData();
    form.append("secret", env[TS.secretVar]);
    form.append("response", body.token);
    if (ip) form.append("remoteip", ip);
    const verdict = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).then((r) => r.json());
    if (!verdict.success) return deny(403);

    const pick = (n) => randomU32() % n;
    const variant = variants.length ? variants[pick(variants.length)] : "0";
    const map = maps[variant] ?? {};
    const encode = (s) => Array.from(s, (c) => (map[c] ? map[c][pick(map[c].length)] : c)).join("");
    const exp = Math.floor(Date.now() / 1000) + TTL;
    const q = `e=${exp}&s=${b64u(await hmac(env[SIG], `a:${exp}`))}`;
    const k = b64e(await hmac(env[SIG], `x:${exp}`));
    const sid = randomU32();
    console.log(JSON.stringify({ event: "session", sid: sid.toString(16).padStart(8, "0"), ip, ua: req.headers.get("User-Agent"), t: new Date().toISOString() }));

    // ctx.canary(text) embeds this session's id as invisible zero-width chars before
    // decoy-encoding, so recovered-and-republished copy traces back to the session.
    const canary = (s) => encode(embedTextCanary(s, sid));
    const payload = await session({ variant, map, encode, canary, exp, q, k, sid, prefix: PREFIX, ttl: TTL });

    let handshake;
    try { handshake = await serverHandshake(b64d(body.pub)); } catch { return deny(400); }
    const { iv, ct } = await encryptJSON(handshake.aes, payload);
    return withHeaders(Response.json({ s: b64e(handshake.serverPubRaw), i: b64e(iv), c: b64e(ct) }), true);
  }

  async function handleProtected(req, env, url) {
    const exp = Number(url.searchParams.get("e"));
    const now = Math.floor(Date.now() / 1000);
    if (!(exp > now && exp <= now + TTL)) return deny(410);
    if (req.headers.get("Sec-Fetch-Site") !== "same-origin") return deny(403);
    if (req.headers.get("Sec-Fetch-Dest") !== "empty") return deny(403);
    if (b64u(await hmac(env[SIG], `a:${exp}`)) !== url.searchParams.get("s")) return deny(403);

    const res = await env.ASSETS.fetch(new Request(new URL(url.pathname, url)));
    if (!res.ok) return deny(404);
    const key = new Uint8Array(await hmac(env[SIG], `x:${exp}`));
    const masked = xorMask(new Uint8Array(await res.arrayBuffer()), key);
    return withHeaders(new Response(masked, { headers: { "Content-Type": "application/octet-stream" } }), true);
  }

  return {
    async fetch(req, env) {
      const url = new URL(req.url);
      const ua = req.headers.get("User-Agent") ?? "";
      if (!POLICY.has(url.pathname) && (!ua || blockedUserAgents.test(ua))) return deny(403);
      if (url.pathname === "/api/session" && req.method === "POST") return handleSession(req, env, url);
      if (url.pathname.startsWith(PREFIX)) return handleProtected(req, env, url);

      if (url.pathname === "/" || url.pathname === "/index.html") {
        const res = await env.ASSETS.fetch(new Request(new URL("/", url), req));
        const html = (await res.text()).replace(TS.sitekeyPlaceholder, env[TS.sitekeyVar] ?? "");
        return withHeaders(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }), true);
      }
      // Only this build's files; the edge cache may still hold older, unprotected
      // deploys. Accept Pages' clean-URL forms (/terms → /terms.html, /dir → /dir/index.html).
      const p = url.pathname;
      const inPublic = !publicFiles.length || PUBLIC.has(p) || PUBLIC.has(p + ".html") ||
        PUBLIC.has((p.endsWith("/") ? p : p + "/") + "index.html");
      if (!inPublic) return deny(404);
      return withHeaders(await env.ASSETS.fetch(req), false);
    },
  };
}
