import { defineConfig } from "@helmet/core";

// Rotate obfuscation tokens per deploy with HELMET_SALT to break cached scrapers.
export default defineConfig({
  watermark: { text: "HELMETMN", quality: 90 },
  obfuscate: { salt: process.env.HELMET_SALT ?? "" },
});
