// Pages advanced-mode worker. Fronts the built comic with Helmet's request layer
// and builds each visitor's encrypted, decoy-font-encoded payload (five faces).
import { defineConfig } from "@helmet/core/runtime";
import { createHelmet } from "@helmet/worker";
import { RENDERED } from "./helmet/content.js";
import maps from "./.helmet/maps.json";
import PUBLIC_FILES from "./.helmet/public.json";

const config = defineConfig({ watermark: { text: "NRUNNER1" } });

// Order must match fontFaces in src/main.js.
const FACES = ["bangers", "barlow-500", "barlow-700", "barlow-600i", "barlow-800i"];

export default createHelmet({
  config,
  maps,
  publicFiles: PUBLIC_FILES,
  session({ variant, encode, q, k, sid, prefix }) {
    return {
      t: Object.fromEntries(Object.entries(RENDERED).map(([key, s]) => [key, encode(s)])),
      f: FACES.map((key) => `fonts/${variant}/${key}.woff2`),
      q,
      k,
      m: sid,
      prefix,
    };
  },
});
