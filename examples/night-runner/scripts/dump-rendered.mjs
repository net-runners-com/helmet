// Write the rendered copy where helmet_assets.py can read it for font coverage.
import { mkdirSync, writeFileSync } from "node:fs";
import { RENDERED } from "../helmet/content.js";
mkdirSync(".helmet", { recursive: true });
writeFileSync(".helmet/rendered.json", JSON.stringify(RENDERED));
console.log(`rendered: ${Object.keys(RENDERED).length} strings -> .helmet/rendered.json`);
