# Changelog

## 0.1.0
Initial extraction of the Helmet mechanism into reusable packages.

- `@helmet/core` — deterministic class/id obfuscation engine (+ name extraction),
  isomorphic ECDH/AES-GCM/HMAC/XOR crypto, config defaults, `defineConfig`.
  `@helmet/core/runtime` is the Worker-safe subset.
- `@helmet/build` — `helmet()` Vite plugin (class/id + JS obfuscation) and the
  public-file allowlist helper.
- `@helmet/worker` — `createHelmet()` request layer: AI-agent blocking, security +
  copyright headers, Turnstile-gated encrypted session, signed+masked assets.
- `@helmet/runtime` — `createHelmetRuntime()`: session handshake, decoy-font
  loading, masked asset fetch, screenshot forensic overlay, structure noise,
  DevTools/copy deterrents.
- `@helmet/cli` (`helmet`) — assets, extract, allowlist, decode-screenshot,
  verify-watermark, init.
- `py/` — decoy-font generation, image/frame watermarking, screenshot decoder.
- `@helmet/runtime` screenshot defenses (experimental): `applyTemporal` /
  `temporal` option (flicker-fusion, reduced-motion-safe, region-scoped) and
  `checkHdcp` / `installHdcpGate` / `hdcp` option (EME getStatusForPolicy, no
  license server). `examples/minimal` demonstrates both.
- `@helmet/core` text canary: `embedTextCanary` / `extractTextCanary` /
  `stripCanary` (zero-width per-session id in delivered copy); the Worker exposes
  it as `ctx.canary(text)`.
- `@helmet/build` + CLI: `audit` (CI leak gate — copy/class-id/allowlist leaks),
  `legal` (terms / ai-policy / robots / ai.txt / tdmrep), and `decode-canary`.
- Worker now serves policy/legal pages (and their clean URLs) to blocked agents so
  the prohibition is discoverable.
- `@helmet/cli` + py: `c2pa` sign/verify — signed C2PA Content Credentials
  (provenance + a signed CAWG "Do Not Train" AI opt-out) in distributed images.
  SynthID is documented as not self-adoptable (proprietary); the open DWT-DCT-SVD
  watermark fills its metadata-strip-survival role.
- `@helmet/cli` + py: `monitor` (perceptual-hash clone / look-alike detection) and
  `timestamp` (OpenTimestamps proof-of-existence of a build, anchored to Bitcoin).
- `examples/night-runner` — full complex site (comic shader / GSAP / Lottie / 193
  frames) migrated onto the library; adds `protectedCopy` and `audit --ignore`.
- `examples/minimal` — reference site built on the library. `examples/standalone` —
  original proof of concept, unchanged.
