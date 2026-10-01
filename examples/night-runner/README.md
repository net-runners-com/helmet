# NIGHT RUNNER — Issue #1

A scroll-driven comic page built from one video clip. Night Runner is a fictional comic; the story,
cast and figures are invented for this demo.

- **Frame-by-frame scroll**: 193 frames, scrubbed by scroll position.
- **Comic shader (WebGL)**: every frame is posterised, inked (Sobel edges), given Ben-Day halftone
  dots in the shadows and anime-style speed lines that get stronger the faster you scroll.
- **One frame, three panels**: the wide shot, a headlight close-up and the skyline are different
  crops of the same filtered frame, laid out as a comic page.
- **GSAP**: captions slam in, panels jolt and flash on each page turn, sound effects pop, counters, marquee.
- **Lottie**: loader, scroll hint and the three cast icons, hand-built by `scripts/make-lottie.mjs`.
- **Lenis**: smooth scrolling.

    npm install
    npm run dev      # http://localhost:5173
    npm test         # frame mapping, panel crops, chapters, sound-effect windows
    npm run lottie   # regenerate public/lottie/*.json
    npm run build    # static site in dist/
    npm run shots    # desktop / mobile / reduced-motion screenshots → shots/

Footage generated with Kling AI (the "KlingAI 3.0 Omni" watermark is left in place). `public/frames/`
was extracted with ffmpeg from `kling_20260701_VIDEO____Kling_V_5072_0.mp4`. Who created the clip has
not been confirmed; check that before publishing this anywhere.
