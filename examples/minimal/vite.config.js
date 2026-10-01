import { defineConfig } from "vite";
import { helmet } from "@helmet/build";
import siteConfig from "./helmet.config.js";

export default defineConfig({
  base: "./",
  // @helmet/* are workspace sources under active development — don't pre-bundle/cache them.
  optimizeDeps: { exclude: ["@helmet/core", "@helmet/runtime", "@helmet/worker"] },
  // Raw protected assets live under dist/_p via helmet assets; don't copy a static dir over them.
  publicDir: "public",
  plugins: [
    helmet({
      config: siteConfig,
      // Class and id names are auto-extracted from these sources.
      sources: ["index.html", "src/**/*.js", "src/**/*.css"],
    }),
  ],
  build: {
    target: "es2022",
    // keep the DevTools-trap `debugger` through minification
    rolldownOptions: { output: { minify: { compress: { dropDebugger: false } } } },
  },
});
