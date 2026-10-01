// Pages advanced-mode worker. Fronts the built site with Helmet's request layer
// and builds each visitor's encrypted, decoy-font-encoded payload.
import { defineConfig } from "@helmet/core/runtime";
import { createHelmet } from "@helmet/worker";
import { RENDERED } from "./content.js";
import maps from "./.helmet/maps.json";
import PUBLIC_FILES from "./.helmet/public.json";

const config = defineConfig({ watermark: { text: "HELMETMN" } });

export default createHelmet({
  config,
  maps,
  publicFiles: PUBLIC_FILES,
  session({ variant, encode, canary, q, k, sid, prefix }) {
    // Embed a per-session invisible canary in the longer copy, so leaked text
    // (if the decoy font is inverted and republished) traces back to the session.
    const canaried = new Set(["hero.sub", "foot"]);
    const t = Object.fromEntries(
      Object.entries(RENDERED).map(([key, s]) => [key, canaried.has(key) ? canary(s) : encode(s)]),
    );
    return {
      t,
      f: [`fonts/${variant}/body.woff2`, `fonts/${variant}/display.woff2`],
      q,
      k,
      m: sid,
      prefix,
    };
  },
});
