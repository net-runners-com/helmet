// Client entry. Copy, fonts and the hero image only exist after a Turnstile-gated
// Helmet session; nothing readable ships in this bundle or in index.html.
import "./style.css";
import { createHelmetRuntime } from "@helmet/runtime";

const { ready } = createHelmetRuntime({
  // Index-aligned with the font paths the worker returns in payload.f.
  fontFaces: [
    { family: "Body", weight: "500", style: "normal" },
    { family: "Display", weight: "700", style: "normal" },
  ],
  // Degrade a single screenshot of the price (disabled under reduced-motion).
  temporal: { selector: ".plan-value", frames: 2, noise: 96 },
  // Blur the hero if the output path is untrusted at HDCP 2.2 (fail-open on unknown).
  hdcp: { gate: ".shot", minHdcpVersion: "2.2" },
});

// The runtime already filled [data-t], loaded fonts, and applied temporal/hdcp
// during the session. Don't call fill() again here — it would overwrite the
// temporal canvas on protected elements. Use `fill` only for DOM you add later.
const { asset } = await ready;

// The hero image is a protected asset: fetch masked bytes, show via a blob URL
// that is revoked once decoded so it can't be opened or saved.
try {
  const bytes = await asset("img/hero.jpg");
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
  const img = document.querySelector(".shot");
  img.onload = () => URL.revokeObjectURL(url);
  img.src = url;
} catch {
  /* optional asset */
}

document.getElementById("loader").classList.add("done");
