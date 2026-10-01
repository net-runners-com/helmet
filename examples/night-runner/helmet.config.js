import { defineConfig } from "@helmet/core";

// Rotate obfuscation tokens per deploy with HELMET_SALT to break cached scrapers.
export default defineConfig({
  watermark: { text: "NRUNNER1", quality: 82 },
  obfuscate: { salt: process.env.HELMET_SALT ?? "" },
});
