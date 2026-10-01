# Helmet

A reusable mechanism for **raising the cost of cloning a website** and **leaving
evidence when it is copied anyway**. Built for the Vite + Cloudflare (Pages/Workers)
stack.

Helmet does not try to make a site uncopyable — that is impossible, because
anything the browser renders is in the visitor's hands. What it does:

1. **Raise the cost of automated copying** — block AI crawlers and scripting
   clients, keep copy out of the HTML source, deliver it encrypted and drawn with a
   per-session decoy font, serve images/fonts behind short-lived signatures, and
   obfuscate class names, ids and JavaScript.
2. **Leave evidence when copied** — an invisible image watermark, a per-session
   screenshot mark that decodes back to a session, and canary honeytokens salted
   through the DOM.

> ### What Helmet does **not** stop
> - **Screenshot → vision model.** Someone can photograph the rendered page and
>   have an AI rebuild the look. Nothing client-side prevents this; the watermark,
>   screenshot mark, and temporal/HDCP options (below) only *degrade and trace*
>   captures, they do not prevent them. True black-on-screenshot exists only for
>   DRM-protected **video** (EME + HDCP in a secure media path) — it cannot be
>   applied to HTML/text/design.
> - **A determined human.** DevTools can be re-enabled, breakpoints deactivated,
>   the decoy font inverted. Helmet raises cost; it is not DRM.
> - **SEO and accessibility.** A page whose copy lives in canvas/decoy-encoded DOM
>   is not indexed and not readable by screen readers. Protect only what must be
>   protected; leave marketing/landing pages normal. **This is the main trade-off.**

## Packages

| Package | Runs | Does |
|---|---|---|
| `@helmet/core` | build + worker + browser | obfuscation engine, isomorphic crypto, config defaults. `@helmet/core/runtime` is the Worker-safe subset (no `node:crypto`). |
| `@helmet/build` | build (Vite) | `helmet()` Vite plugin — class/id/JS obfuscation — and the public-file allowlist. |
| `@helmet/worker` | Cloudflare | `createHelmet()` — bot blocking, security/copyright headers, Turnstile-gated encrypted session, signed+masked asset delivery. |
| `@helmet/runtime` | browser | `createHelmetRuntime()` — session handshake, decoy-font loading, masked assets, screenshot forensics, structure noise, deterrents. |
| `@helmet/cli` (`helmet`) | build | `assets`, `extract`, `allowlist`, `audit` (CI leak gate), `legal`, `decode-screenshot`, `decode-canary`, `verify-watermark`, `init`. |
| `py/` | build | decoy-font generation, image/frame watermarking, screenshot decoding (fontTools + OpenCV). |

## How it fits together

```
          build time                         request time
  ┌───────────────────────────┐     ┌──────────────────────────────┐
  vite + @helmet/build  ──▶ dist/   browser ──▶ @helmet/worker
    · obfuscate class/id/JS           · block AI agents / scripts
    · index.html → data-t keys        · Turnstile → ECDH session
  helmet assets (py) ──▶ dist/_p/     · encode copy w/ decoy font
    · decoy fonts (N variants)        · sign + XOR-mask assets
    · watermark images/frames       @helmet/runtime (in the page)
  helmet allowlist ──▶ .helmet/        · decrypt copy, fill [data-t]
    public.json (worker 404s rest)     · load decoy fonts, unmask img
                                        · screenshot mark + DOM noise
```

The copy never ships in the bundle or the HTML. After a visitor clears Turnstile,
the worker returns it **encrypted** (ECDH→AES-GCM) and **encoded** for that
session's decoy font; the runtime decrypts it, loads the matching font, and fills
`[data-t]` placeholders. The rendered text is correct for humans; the DOM holds
only lookalike codepoints.

## Quick start (new site)

```bash
npm i -D @helmet/build @helmet/cli vite wrangler esbuild
npm i @helmet/core @helmet/runtime @helmet/worker
npx helmet init            # writes helmet.config.js + helmet.assets.json
```

1. **index.html** — put copy in `data-t="key"` placeholders, add the Turnstile gate
   (`class="cf-turnstile" data-callback="onHelmetVerified"` with `__SITEKEY__`).
2. **content.js** — export `RENDERED = { key: "text" }` (server-only).
3. **vite.config.js** — add the plugin:
   ```js
   import { helmet } from "@helmet/build";
   import config from "./helmet.config.js";
   export default { plugins: [helmet({ config })] };
   ```
4. **worker.js** — `createHelmet({ config, maps, publicFiles, session })` (see
   `examples/minimal/worker.js`).
5. **build** — `vite build` → dump rendered copy → `helmet assets` → `helmet
   allowlist dist --out .helmet/public.json` → bundle the worker with esbuild. The
   minimal example wires all of this in its `package.json`.

The Python steps need: `fonttools brotli numpy opencv-python-headless
invisible-watermark`. The CLI runs them via [uv](https://docs.astral.sh/uv/) by
default (`helmet assets`), or run `py/helmet_assets.py` under your own venv.

## Examples

- **`examples/minimal`** — a small landing page built on the library. The reference
  for how the pieces connect; builds and runs with `npm run dev:example`.
- **`examples/night-runner`** — a full, complex site on the library: a scroll-driven
  comic (WebGL shader, GSAP, Lottie, 193 frames) served entirely through Helmet —
  copy, fonts, frames, and Lottie all behind the session. Shows `protectedCopy`
  (arbitrary assets behind the signed/masked path) and `audit --ignore`.
- **`examples/standalone`** — the original, pre-library proof of concept, kept as-is.

## Operational notes

- **Turnstile.** Examples ship Cloudflare's always-pass test keys. Create a real
  widget and set `TURNSTILE_SITEKEY` / `TURNSTILE_SECRET` before relying on it.
- **Secrets.** `SIGNING_SECRET` (asset signatures) and `TURNSTILE_SECRET` are
  Worker secrets — never commit them. `.dev.vars` holds local values.
- **Rotate obfuscation per deploy.** Set `HELMET_SALT` at build time so class/id
  tokens change every release and scrapers can't cache them.
- **`text-transform: uppercase` breaks decoy text** — CSS case-mapping shifts the
  lookalike codepoints out of the font. Deliver the copy already-cased and drop the
  CSS rule (the minimal example does this for its nav).
- **Delete old deployments.** The edge cache can keep an earlier, unprotected
  deploy reachable at its own URL. The allowlist 404s unknown paths on the current
  deploy, but a prior deployment is a separate origin — remove it.
- **Load cost.** Watermarked images are larger and protected assets are
  uncacheable; the whole page is gated behind a session round-trip.

## Screenshot defenses (experimental, `@helmet/runtime`)

Two opt-in, region-scoped tools. Neither prevents a screenshot; they degrade or
gate one.

**Temporal (flicker-fusion)** — `applyTemporal(selector)` or the `temporal` option.
A target's text is drawn to a canvas split across k frames that each look like
noise but whose time-average is the original: the eye fuses them into readable
text, a single screenshot captures one noisy frame, and the text leaves the DOM.

> ⚠️ **Photosensitivity.** Flicker (~3–60 Hz) can trigger seizures. Helmet
> **always disables temporal under `prefers-reduced-motion: reduce`** (the text is
> shown normally), bounds the per-frame luminance swing, and must be applied to
> **small regions only** — a price, a code, a secret — never the whole page. A
> screen *recording* that averages frames can still recover the text.

```js
createHelmetRuntime({ temporal: { selector: ".price", frames: 2, noise: 96 } });
```
Note: the runtime fills `[data-t]` and applies temporal during the session — don't
call `fill()` again over a temporal-protected element afterwards, or you overwrite
its canvas.

**HDCP output gate** — `checkHdcp()` / `installHdcpGate(selector)` or the `hdcp`
option. Uses EME's `getStatusForPolicy` to ask whether the display link is trusted
at a given HDCP version, with **no license server and no playback**. It cannot
force a black screenshot (only DRM video does); it lets you blur a region when the
output path is untrusted (capture card, mirrored display). Fail-open by default
(`hideOnUnknown: true` to fail-closed). Support varies by browser/CDM; many desktop
setups report `usable` regardless, so treat it as a weak signal.

```js
createHelmetRuntime({ hdcp: { gate: ".shot", minHdcpVersion: "2.2" } });
```

## Forensics

```bash
helmet decode-screenshot leaked.png          # → session id, match against worker logs
helmet verify-watermark HELMETMN image.jpg    # → MATCH / recovered bytes
helmet decode-canary "<leaked text>"          # → session id from invisible text canary
```

Three independent traces, all keyed to the same per-session id in the worker logs:
- **Image** — invisible DWT-DCT-SVD watermark in every served image/frame.
- **Screenshot** — a per-session ±luminance mark tiled over the page (survives crops).
- **Text** — `ctx.canary(text)` embeds the session id as zero-width characters in the
  delivered copy, so recovered-and-republished text is traceable (`decode-canary`).

Also search a suspected clone's DOM for the structure-noise canary prefix (default
`hlm`); a copy made from a live session keeps it.

## CI leak gate

`helmet audit <distDir> [--copy rendered.json]` fails the build (exit 1) if the
output would defeat the protection: site copy appearing verbatim in a public file,
readable (non-obfuscated) class/id names in `index.html`, or an allowlist that
exposes a protected path. Chain it last in the build (`… && helmet audit dist
--copy .helmet/rendered.json`) so a regression can't ship.

## Content Credentials (C2PA)

`helmet c2pa sign <image> --author "<name>" --copyright "<notice>"` embeds a
cryptographically signed [C2PA](https://c2pa.org) provenance manifest into an image;
`helmet c2pa verify <image>` reads it and reports the validation state. Signed and
tamper-evident, it is a stronger origin claim than a bare watermark — apply it to
images you **distribute publicly** (press kit, og:image, downloads), not to the
masked in-session assets. The manifest carries:

- **provenance** — author, copyright, created action, digital source type;
- **a signed "Do Not Train" opt-out** (CAWG `cawg.training-mining`: generative
  training / inference / training / data-mining all `notAllowed`) — a
  machine-readable AI-training refusal baked into the asset, complementing
  `robots.txt` / `ai.txt` / TDMRep. Pass `--allow-train` to drop it.

> The demo auto-generates a local CA + leaf certificate (`.helmet/c2pa/`). Validators
> show the credential but flag the signer as untrusted; for production, sign with a
> certificate from a C2PA-recognized authority. Needs `openssl`.

### SynthID — why it is not adopted

[SynthID](https://deepmind.google/technologies/synthid/) (Google DeepMind) is the
natural complement to C2PA — an imperceptible watermark that **survives metadata
stripping**, where C2PA's signed manifest does not. But it **cannot be self-adopted**:
for images it is applied only at *generation time* by Google/partner models
(Imagen, Vertex AI, …), and **detection requires Google's proprietary,
waitlisted infrastructure** — there is no open library to embed or detect it on
arbitrary images. SynthID Text is open-sourced, but it watermarks *LLM-generated*
text by biasing sampling, so it does not apply to human-written copy either.

In Helmet, the role SynthID would play (a watermark that persists after the C2PA
manifest is removed) is filled by the **invisible DWT-DCT-SVD image watermark**
(`helmet verify-watermark`). It is weaker than SynthID but open and self-hostable.
SynthID only becomes available if you *generate* assets through Google's stack,
in which case the images already carry it and Helmet simply leaves it intact.

The C2PA + SynthID "two layers" model (rich signed metadata + a watermark that
survives metadata loss) is described here:
[C2PA × SynthID でコンテンツ来歴を守る (Qiita)](https://qiita.com/kai_kou/items/1e7a5ed2ee470ebed394).
Helmet realizes the same two layers as **C2PA (signed metadata) + DWT-DCT-SVD
(strip-resistant watermark)**.

## Proof of existence (timestamp)

`helmet timestamp stamp <distDir>` hashes every built file into a manifest and
timestamps it with [OpenTimestamps](https://opentimestamps.org) (anchored to
Bitcoin). This is **anteriority evidence** — proof the content existed at a time,
which helps a priority claim in a dispute. A few hours later, `helmet timestamp
upgrade manifest.sha256.ots` anchors it; keep the manifest + `.ots` as your proof.

> It does **not** make anything unique or exclusive, and does not prevent copying.
> "Own it on-chain" / NFT framing is marketing, not enforceable exclusivity. Run it
> as a release step (it contacts public calendar servers), not on every build.

## Similarity monitoring

`helmet monitor <baseline.png> <suspect.png> …` compares a key screen against
suspect screenshots with a perceptual hash (pHash) and reports Hamming distance —
small distance = visually alike despite re-encoding/resizing/light edits, for
spotting clones and look-alikes once you have a candidate image. Combine with
`decode-canary` (text) and the structure-noise canary (DOM) for copy detection.

`helmet monitor scan --searx <url> --phrase "<distinctive line>" [--phrases file]
[--exclude yourdomain] [--canary hlm]` searches a [SearXNG](https://searxng.org)
instance for your distinctive phrases, fetches each candidate page, and flags the
ones that carry your **text canary** (recovers the session id), your **DOM canary**
prefix, or quote your phrases — ranked strongest-first. SearXNG is open-source and
needs no API key; point at a public instance or self-host one (`--searx` is the only
requirement — no Docker needed to *use* it). Note many public instances disable JSON
output, so a self-hosted or JSON-enabled instance is most reliable. Reverse-image
search has no good open option — compare screens with `helmet monitor` (pHash).

> A merely *similar* service is usually lawful competition — this is for early
> awareness and catching actual infringement, not for stopping rivals.

## Legal pages

`helmet legal --name "<Site>" [--url …] [--email …] --out public` generates the
public, discoverable prohibitions — `terms.html`, `ai-policy.html`, `robots.txt`,
`ai.txt`, `/.well-known/tdmrep.json` — and the worker serves these (and their clean
URLs) even to blocked agents, so the refusal is findable. The Terms / AI-Policy text
is a **starting template, not legal advice** — have a lawyer review it.

## Development

```bash
npm install        # workspaces
npm test           # unit tests (@helmet/core)
npm run build:example
```

Licensed UNLICENSED (private).
