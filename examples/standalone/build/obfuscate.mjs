// Obfuscate client/app.js -> public/app.js, keeping the copyright banner.
import { readFileSync, writeFileSync } from "node:fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const src = readFileSync(new URL("../client/app.js", import.meta.url), "utf8");
const banner = src.match(/^\/\*![\s\S]*?\*\//)[0];

const out = JavaScriptObfuscator.obfuscate(src, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
  identifierNamesGenerator: "hexadecimal",
  numbersToExpressions: true,
  reservedNames: ["^onHelmetVerified$"],
  selfDefending: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 1,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
}).getObfuscatedCode();

writeFileSync(new URL("../public/app.js", import.meta.url), `${banner}\n${out}\n`);
console.log(`app.js: ${src.length} -> ${out.length} bytes`);
