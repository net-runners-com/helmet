import { defineConfig } from "vite";
import { helmet } from "@helmet/build";
import siteConfig from "./helmet.config.js";

export default defineConfig({
  base: "./",
  // @helmet/* are workspace sources under active development — don't pre-bundle them.
  optimizeDeps: { exclude: ["@helmet/core", "@helmet/runtime", "@helmet/worker"] },
  // static/ holds policy files; the raw frames/lottie in public/ are NOT copied as
  // plain static files — `helmet assets` places them under dist/_p/.
  publicDir: "static",
  plugins: [
    helmet({ config: siteConfig, sources: ["index.html", "src/**/*.js", "src/**/*.css"] }),
  ],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    // keep the DevTools-trap `debugger` through minification
    rolldownOptions: { output: { minify: { compress: { dropDebugger: false } } } },
  },
});
